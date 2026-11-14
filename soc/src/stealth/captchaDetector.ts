import type { Frame, Page } from 'puppeteer-core'
import type { CaptchaPresenceResult } from './types.ts'

const CAPTCHA_CONTAINER_SELECTORS = [
  '.captcha-modal',
  '#captcha-box',
  '.v-portal',
  '[class*="captcha-verify"]',
  '[class*="rotate-captcha"]',
  '[class*="slide-captcha"]',
  'iframe[src*="captcha"]',
  'iframe[src*="secsdk"]',
  '.Captcha-container',
  '[class*="Verification"]',
  '.geetest_holder',
  '.geetest_popup',
  '.geetest_wrap',
  '#tcaptcha_transform',
  '#tcaptcha_iframe',
  '#nc_1_wrapper',
  '#baxia-dialog-content',
  '.yidun_modal',
  '[class*="verify-bar"]',
  '[class*="drag-verify"]',
]

const VERIFY_KEYWORDS = [
  '安全验证',
  '按顺序拖动',
  '拖动滑块',
  '完成拼图',
  '完成验证',
  '点击图中',
  '旋转图片',
  '请按顺序点击',
  '向右滑动',
  '请完成旋转',
  '滑动验证',
]

async function checkFrameForCaptcha(frame: Frame): Promise<CaptchaPresenceResult> {
  try {
    return await frame.evaluate(
      (selectors: string[], keywords: string[]) => {
        function isRealVisible(el: Element, minW = 80, minH = 40): boolean {
          if (!el) return false
          const htmlEl = el as HTMLElement
          if (htmlEl.offsetParent === null && htmlEl.tagName !== 'BODY' && htmlEl.tagName !== 'HTML') {
            return false
          }
          const style = window.getComputedStyle(el)
          if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') < 0.1) {
            return false
          }
          const rect = el.getBoundingClientRect()
          if (rect.width < minW || rect.height < minH) return false
          return true
        }

        for (const sel of selectors) {
          const els = Array.from(document.querySelectorAll(sel))
          for (const el of els) {
            if (isRealVisible(el, 80, 40)) {
              const text = (el as HTMLElement).innerText || ''
              let type: 'rotate' | 'slide' | 'puzzle' | 'general' = 'general'
              if (text.includes('旋转') || sel.includes('rotate')) type = 'rotate'
              else if (text.includes('滑') || sel.includes('slide')) type = 'slide'
              else if (text.includes('拼图') || sel.includes('puzzle')) type = 'puzzle'

              return {
                detected: true,
                reason: `命中验证码组件 (${sel})`,
                type,
              }
            }
          }
        }

        const modalLikeEls = Array.from(
          document.querySelectorAll(
            '[role="dialog"], [class*="modal"], [class*="popup"], [class*="mask"], [class*="captcha-verify"]',
          ),
        )

        for (const m of modalLikeEls) {
          if (!isRealVisible(m, 150, 60)) continue
          const text = ((m as HTMLElement).innerText || '').trim()
          if (text.length > 250) continue
          for (const kw of keywords) {
            if (text.includes(kw)) {
              let type: 'rotate' | 'slide' | 'puzzle' | 'general' = 'general'
              if (kw.includes('旋转')) type = 'rotate'
              else if (kw.includes('滑')) type = 'slide'
              else if (kw.includes('拼图')) type = 'puzzle'

              return {
                detected: true,
                reason: `命中风控提示: ${kw}`,
                type,
              }
            }
          }
        }

        return { detected: false }
      },
      CAPTCHA_CONTAINER_SELECTORS,
      VERIFY_KEYWORDS,
    )
  } catch {
    return { detected: false }
  }
}

/**
 * 探查指定页面及其所有子 Frame 当前是否存在阻断式验证码或风控拦截
 */
export async function detectCaptchaPresence(page: Page): Promise<CaptchaPresenceResult> {
  try {
    const mainResult = await checkFrameForCaptcha(page.mainFrame())
    if (mainResult.detected) {
      return mainResult
    }

    const frames = page.frames()
    for (const frame of frames) {
      if (frame === page.mainFrame()) continue
      const subResult = await checkFrameForCaptcha(frame)
      if (subResult.detected) {
        return {
          ...subResult,
          frameUrl: frame.url(),
          reason: `${subResult.reason} [子Frame: ${frame.url()}]`,
        }
      }
    }

    return { detected: false }
  } catch {
    return { detected: false }
  }
}

export interface WaitForCaptchaOptions {
  timeoutMs?: number
  onTakeover?: (enabled: boolean, reason: string, action?: 'resume' | 'pause') => void
}

/**
 * 等待人机协同接管完成验证码，验证消失后自动自愈并恢复
 */
export async function waitForCaptchaResolution(
  page: Page,
  sessionId: string,
  platformDisplayName: string,
  optionsOrTimeoutMs: number | WaitForCaptchaOptions = 180000,
): Promise<boolean> {
  const options: WaitForCaptchaOptions =
    typeof optionsOrTimeoutMs === 'number'
      ? { timeoutMs: optionsOrTimeoutMs }
      : (optionsOrTimeoutMs || {})
  const { timeoutMs = 180000, onTakeover } = options
  onTakeover?.(true, 'captcha_detected', 'pause')
  console.warn(
    `[browser-service] ${platformDisplayName} 触发人机验证，等待人机接管处理 (sessionId: ${sessionId})`,
  )

  const startTime = Date.now()
  try {
    while (Date.now() - startTime < timeoutMs) {
      await new Promise(r => setTimeout(r, 1200))

      const presence = await detectCaptchaPresence(page)
      if (!presence.detected) {
        console.info(`[browser-service] ${platformDisplayName} 人机验证已成功解除，流水线自愈恢复`)
        onTakeover?.(false, 'captcha_resolved', 'resume')
        await new Promise(r => setTimeout(r, 1500))
        return true
      }
    }

    onTakeover?.(false, 'captcha_timeout', 'pause')
    throw new Error(`${platformDisplayName} 人机验证在 ${timeoutMs / 1000} 秒内未完成，已安全中断保护`)
  } catch (err) {
    onTakeover?.(false, 'captcha_error', 'pause')
    throw err
  }
}
