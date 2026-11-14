// 今日头条（头条号）创作者平台页面对象与 DOM 选择器资产
// 【设计依据】：集中管理头条号 ProseMirror 编辑器、标题输入区与发布弹层选择器。

import type { ToutiaoSelectors } from './types.ts'

export const TOUTIAO_SELECTORS: ToutiaoSelectors = {
  platform: 'toutiao',
  urls: {
    console: 'https://mp.toutiao.com/',
    write: 'https://mp.toutiao.com/profile_v4/graphic/publish',
    contentList: 'https://mp.toutiao.com/profile_v4/graphic/content',
    loginPage: 'https://mp.toutiao.com/',
  },
  editor: {
    titleInput: [
      'textarea[placeholder*="标题"]',
      'input[placeholder*="标题"]',
      '[class*="title"] textarea[placeholder]',
      '[class*="titleInput"] [contenteditable="true"]',
      '[data-testid*="title"] [contenteditable="true"]',
    ].join(', '),
    editorBody: '.ProseMirror[contenteditable="true"], .ql-editor[contenteditable="true"], .ql-editor',
    saveButtonLabels: ['保存草稿', '存草稿', '保存'],
    publishButtonLabels: ['预览并发布', '发布', '发表', '提交发布'],
    publishConfirmLabels: ['确认发布', '确定发布', '发布', '确定'],
    coverPickLabels: ['选择封面', '单图', '上传封面'],
    coverUploadLabels: ['本地上传', '上传封面', '上传图片', '本地图'],
  },
  riskKeywords: ['安全验证', '异常流量', '访问异常', '环境异常'],
  timeouts: {
    navigation: 30_000,
    elementWait: 15_000,
  },
}
