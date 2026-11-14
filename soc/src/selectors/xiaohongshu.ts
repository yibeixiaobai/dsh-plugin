// 小红书平台页面对象与 DOM 选择器资产
// 【设计依据】：统一维护小红书创作者平台的 DOM 路径与反爬特征，第三方改版时在此集中更新。

import type { XiaohongshuSelectors } from './types.ts'

export const XHS_SELECTORS: XiaohongshuSelectors = {
  platform: 'xiaohongshu',
  urls: {
    creator: 'https://creator.xiaohongshu.com',
    publish: 'https://creator.xiaohongshu.com/publish/publish?source=official&from=menu',
    noteManager: 'https://creator.xiaohongshu.com/new/note-manager',
    noteListApi: '/api/galaxy/v2/creator/note/user/posted',
  },
  login: {
    qrcodeContainer: '.qrcode-img, .qrcode-container, img[alt*="qrcode"], canvas',
    loginBox: '.login-box-container, .login-container, .content-container',
    creatorFeatureBadge: 'button.publishBtn, .btn-publish, a[href*="publish"], .user-info',
    nicknameCard: '.name-box, .user-name, .con-name, .avatar-wrapper',
  },
  publish: {
    imageTab: '.tab:has-text("上传图文"), .tab-item:has-text("图文"), div[class*="tab"]:has-text("图文")',
    fileUploadInput: 'input[type="file"]',
    titleInput: 'input.c-input_inner, input[placeholder*="标题"], input[maxlength="20"]',
    contentEditor: '.c-textarea_inner, div[contenteditable="true"], #post-textarea, .post-content',
    submitButton: 'button.publishBtn, button:has-text("发布"), .btn-publish',
    draftButton: 'button:has-text("存草稿"), button:has-text("保存草稿"), .draft-btn',
  },
  riskKeywords: ['验证', '滑块', '安全检测', '账号异常', '环境异常', '点击重试'],
  timeouts: {
    navigation: 30_000,
    elementWait: 15_000,
    uploadWait: 45_000,
    publishConfirm: 25_000,
  },
}
