// 百家号创作者中心页面对象与 DOM 选择器资产
// 【设计依据】：集中管理百家号（百度生态）编辑器、UEditor Iframe、标题党禁词与审核弹层选择器。

import type { BaijiahaoSelectors } from './types.ts'

export const BAIJIAHAO_SELECTORS: BaijiahaoSelectors = {
  platform: 'baijiahao',
  urls: {
    console: 'https://baijiahao.baidu.com/',
    write: 'https://baijiahao.baidu.com/builder/rc/edit',
    loginPage: 'https://baijiahao.baidu.com/builder/theme/bjh/login',
    contentList: 'https://baijiahao.baidu.com/builder/rc/content',
  },
  editor: {
    titleInput: '[data-testid="news-title-input"] [contenteditable="true"], .client_components_titleInput [contenteditable="true"]',
    editorIframe: '#ueditor_0',
    editorBody: 'body.view.news-editor-pc[contenteditable="true"], body[contenteditable="true"]',
    saveButtonLabels: ['保存草稿', '存草稿', '保存'],
    publishButtonLabels: ['发布', '提交发布', '下一步'],
    publishConfirmLabels: ['确认发布', '发布', '确定'],
    coverUploadLabels: ['本地上传', '上传封面', '上传图片', '本地图'],
    tagInputSelector: [
      'input[placeholder*="标签"]',
      'input[placeholder*="关键词"]',
      'input[placeholder*="添加标签"]',
      'textarea[placeholder*="标签"]',
      '.tag-input input',
      '[class*="tagInput"] input',
      '[class*="tag"] input',
    ].join(', '),
    tagPopupReadySelector: [
      '[class*="tag"] li',
      '[class*="Tag"] li',
      '[class*="suggest"] li',
      '[class*="Suggest"] li',
      '[class*="option"]',
      '[class*="menu"] li',
      '[class*="dropdown"] li',
      '[class*="Dropdown"] li',
      '[class*="popover"] li',
      '[class*="Popover"] li',
    ].join(', '),
  },
  riskKeywords: ['安全验证', '异常流量', '环境异常', '访问异常'],
  timeouts: {
    navigation: 30_000,
    elementWait: 15_000,
  },
}
