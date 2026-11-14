// 微信公众平台页面对象与 DOM 选择器资产
// 【设计依据】：集中管理微信公众平台（首页定时任务、草稿箱管理、原生发表弹窗）选择器，便于快速适配微信后台 DOM 升级。

import type { WechatSelectors } from './types.ts'

export const WECHAT_SELECTORS: WechatSelectors = {
  platform: 'gzh',
  urls: {
    home: 'https://mp.weixin.qq.com/cgi-bin/home',
    draftBox: 'https://mp.weixin.qq.com/cgi-bin/appmsgedit?action=edit_v2&type=77',
    editor: 'https://mp.weixin.qq.com/cgi-bin/appmsgedit?action=edit_v2',
    operateAppmsgCgi: 'https://mp.weixin.qq.com/cgi-bin/operate_appmsg',
  },
  schedule: {
    timerSendContainer: '#timer_send_main',
    scheduleItemList: '#timer_send_main ul.js_send_list > li',
    showAllLink: '#timer_send_main .js_show_all',
    itemTitle: '.weui-desktop-mass-appmsg__title',
    cancelSendLink: 'a.weui-desktop-link:has-text("取消发表"), .js_cancel_send',
    popoverConfirmBtn: '.weui-desktop-popover button.weui-desktop-btn_primary, .weui-desktop-popover .weui-desktop-btn_primary',
  },
  draft: {
    masonryContainer: '.weui-desktop-masonry-list',
    draftCard: '.weui-desktop-card, .appmsg_col',
    deleteBtn: '.weui-desktop-icon-checkbox, a[title="删除"], button[title="删除"], .js_delete',
    deleteConfirmBtn: '.weui-desktop-popover button.weui-desktop-btn_primary, .weui-desktop-dialog__wrp button.weui-desktop-btn_primary',
  },
  original: {
    originalCheckbox: 'input[name="is_original"], .original-checkbox',
    agreementDialog: '.weui-desktop-dialog',
    authorInput: 'input[name="original_author"], .original-author-input',
  },
  timeouts: {
    navigation: 30_000,
    elementWait: 15_000,
    dialogWait: 10_000,
  },
}
