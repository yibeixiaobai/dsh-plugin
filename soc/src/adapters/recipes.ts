/**
 * 社媒多平台浏览器自动化弹性选择器配方系统 (Resilient Selector Recipes)
 *
 * 【设计初衷与架构依据】：
 * 1. 国内各主流社媒平台（小红书创作者服务平台、微信公众平台、知乎专栏等）前端常年频繁升级并混淆 Class 命名。
 * 2. 避免在核心发布或登录逻辑中硬编码单个 CSS 选择器。
 * 3. 采用声明式选择器优先级链（Fallback Chain），高优先级特征在前，一旦命中立即返回；
 *    全部失效时提供清晰的上下文与建议，便于 1 分钟内定位与维护。
 */

import type { Page } from 'puppeteer-core'
import type { ElementRecipe, PlatformRecipe } from './types.ts'

/** 小红书创作者中心弹性 DOM 选择器配方 */
export const XIAOHONGSHU_RECIPES: PlatformRecipe = {
  loginQrCode: {
    name: '小红书登录二维码容器',
    selectors: [
      '.qrcode',
      '[class*="qrcode"]',
      '[class*="login-box"]',
      '[class*="login-container"]',
      'img[src*="qrcode"]',
    ],
    fallbackBehavior: 'retry',
  },
  userInfo: {
    name: '小红书用户信息与登录标识',
    selectors: [
      '[class*="user-name"]',
      '[class*="name-box"]',
      '[class*="author-name"]',
      '[class*="user-info"]',
      'img[src*="avatar"]',
      'img[src*="sns-avatar"]',
    ],
  },
  fileInput: {
    name: '图片上传文件输入框',
    selectors: [
      'input[type="file"][accept*="image"]',
      'input[type="file"]',
      '.upload-input-file',
    ],
    fallbackBehavior: 'throw',
  },
  titleInput: {
    name: '笔记标题输入框',
    selectors: [
      'input.d-input[placeholder*="填写标题"]',
      'input[placeholder*="填写标题"]',
      'input[placeholder*="标题"]',
      'input.d-text[type="text"]',
      '.title-container input',
    ],
    fallbackBehavior: 'throw',
  },
  contentEditor: {
    name: '笔记正文输入区域',
    selectors: [
      'div#post-textarea',
      'div[contenteditable="true"][placeholder*="填写正文"]',
      'div[contenteditable="true"]',
      '.content-editor',
      'textarea[placeholder*="正文"]',
    ],
    fallbackBehavior: 'throw',
  },
  publishButton: {
    name: '发布/定时发布按钮',
    selectors: [
      'button.publish-btn',
      'button:has-text("发布")',
      'button[class*="publish"]',
      '.publish-button',
      'button.d-button--primary',
    ],
    fallbackBehavior: 'retry',
  },
}

/** 微信公众号后台弹性 DOM 选择器配方 */
export const WECHAT_RECIPES: PlatformRecipe = {
  homeScheduledList: {
    name: '首页定时发表任务列表容器',
    selectors: [
      '#timer_send_main ul.js_send_list > li',
      '.weui-desktop-mass-timer__list > li',
      'ul.js_send_list > li',
    ],
  },
  massAppmsgTitle: {
    name: '定时群发图文标题',
    selectors: [
      '.weui-desktop-mass-appmsg__title',
      '.appmsg_title',
      'a.weui-desktop-mass-appmsg__title',
    ],
  },
  cancelScheduleLink: {
    name: '取消发表链接与确认按钮',
    selectors: [
      'a.js_cancel_timer',
      'a[data-action="cancel"]',
      '.weui-desktop-popover__wrp button.weui-desktop-btn_primary',
    ],
  },
}

/**
 * 弹性执行器：按配方中的候选选择器链依次探测，命中首个可见元素并返回
 */
export async function queryElementByRecipe(
  page: Page,
  recipe: ElementRecipe,
  timeoutMs = 5000,
): Promise<{ selector: string; element: any } | null> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeoutMs) {
    for (const sel of recipe.selectors) {
      try {
        const el = await page.$(sel)
        if (el) {
          return { selector: sel, element: el }
        }
      } catch {
        // 忽略单个选择器语法差异异常，继续尝试下一个候选
      }
    }
    await new Promise((r) => setTimeout(r, 200))
  }

  if (recipe.fallbackBehavior === 'throw') {
    throw new Error(
      `未能在规定时间内（${timeoutMs}ms）定位到「${recipe.name}」。已尝试选择器链: ${recipe.selectors.join(', ')}`,
    )
  }

  return null
}
