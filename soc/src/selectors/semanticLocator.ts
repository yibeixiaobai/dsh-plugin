import type { Page, ElementHandle } from 'puppeteer-core'

export interface SemanticSearchOptions {
  timeoutMs?: number
  visibleOnly?: boolean
}

/**
 * 基于 Accessibility 语义与可见文本的智能自愈查找器
 * 当 CSS 类名因平台改版失效时，自动根据元素交互角色与可访问性名称进行自愈定位
 */
export async function findBySemanticRole(
  page: Page,
  role: 'button' | 'textbox' | 'tab' | 'menuitem' | 'checkbox',
  namePattern: RegExp | string,
  options: SemanticSearchOptions = {},
): Promise<ElementHandle<Element> | null> {
  const timeoutMs = options.timeoutMs ?? 3000
  const visibleOnly = options.visibleOnly ?? true
  const patternStr = typeof namePattern === 'string' ? namePattern : namePattern.source
  const isRegex = typeof namePattern !== 'string'
  const flags = isRegex ? (namePattern as RegExp).flags : 'i'

  const startTime = Date.now()
  while (Date.now() - startTime < timeoutMs) {
    try {
      const handle = await page.evaluateHandle(
        (targetRole, pStr, pFlags, checkVisible) => {
          const reg = new RegExp(pStr, pFlags)
          // 候选选择器根据角色收窄
          let query = `[role="${targetRole}"]`
          if (targetRole === 'button') query += ', button, [type="button"], [type="submit"], a.btn'
          if (targetRole === 'textbox') query += ', input:not([type="hidden"]), textarea, [contenteditable="true"]'
          if (targetRole === 'tab') query += ', [role="tab"], [class*="tab"]'
          if (targetRole === 'checkbox') query += ', input[type="checkbox"], [role="checkbox"]'

          const elements = Array.from(document.querySelectorAll(query))
          for (const el of elements) {
            const h = el as HTMLElement
            if (checkVisible) {
              const r = h.getBoundingClientRect()
              if (r.width <= 0 || r.height <= 0 || h.offsetParent === null) {
                continue
              }
            }

            const accessibleName =
              h.getAttribute('aria-label') ||
              h.getAttribute('placeholder') ||
              h.getAttribute('title') ||
              (h as HTMLInputElement).value ||
              (h.textContent ?? '').trim()

            if (reg.test(accessibleName)) {
              return h
            }
          }
          return null
        },
        role,
        patternStr,
        flags,
        visibleOnly,
      )

      const element = handle.asElement()
      if (element) {
        return element as ElementHandle<Element>
      }
    } catch {
      // 页面跳转时评估可能抛出 execution context destroyed，忽略并重试
    }

    await new Promise(resolve => setTimeout(resolve, 200))
  }

  return null
}
