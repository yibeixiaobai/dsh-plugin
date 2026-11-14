// 知乎专栏页面对象与 DOM 选择器资产
// 【设计依据】：集中管理知乎创作者写文章与专栏草稿发布页面选择器。

import type { BasePlatformSelectors } from './types.ts'

export interface ZhihuSelectors extends BasePlatformSelectors {
  readonly platform: 'zhihu'
  readonly urls: {
    write: string
    drafts: string
  }
  readonly publish: {
    titleInput: string
    editorArea: string
    publishBtn: string
    draftSaveBtn: string
    confirmModalBtn: string
  }
}

export const ZHIHU_SELECTORS: ZhihuSelectors = {
  platform: 'zhihu',
  urls: {
    write: 'https://zhuanlan.zhihu.com/write',
    drafts: 'https://zhuanlan.zhihu.com/drafts',
  },
  publish: {
    titleInput: 'textarea.WriteIndex-titleInput, input[placeholder*="请输入标题"]',
    editorArea: '.DraftEditor-editorContainer, .public-DraftEditor-content, div[contenteditable="true"]',
    publishBtn: 'button.PublishPanel-triggerButton, button:has-text("发布")',
    draftSaveBtn: 'button:has-text("保存草稿")',
    confirmModalBtn: '.Modal-content button.Button--primary',
  },
  timeouts: {
    navigation: 30_000,
    elementWait: 15_000,
  },
}
