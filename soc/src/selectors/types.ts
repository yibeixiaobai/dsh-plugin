// 社媒发布平台页面对象模型 (Page Object Model) 与选择器契约
// 【设计依据】：将各平台频繁变动的前端 DOM 选择器、URL 特征、超时时限与业务逻辑彻底解耦。

export interface BasePlatformSelectors {
  readonly platform: string
  readonly urls: Record<string, string>
  readonly timeouts: Record<string, number>
}

export interface XiaohongshuSelectors extends BasePlatformSelectors {
  readonly platform: 'xiaohongshu'
  readonly urls: {
    creator: string
    publish: string
    noteManager: string
    noteListApi: string
  }
  readonly login: {
    qrcodeContainer: string
    loginBox: string
    creatorFeatureBadge: string
    nicknameCard: string
  }
  readonly publish: {
    imageTab: string
    fileUploadInput: string
    titleInput: string
    contentEditor: string
    submitButton: string
    draftButton: string
  }
  readonly riskKeywords: string[]
}

export interface WechatSelectors extends BasePlatformSelectors {
  readonly platform: 'gzh'
  readonly urls: {
    home: string
    draftBox: string
    editor: string
    operateAppmsgCgi: string
  }
  readonly schedule: {
    timerSendContainer: string
    scheduleItemList: string
    showAllLink: string
    itemTitle: string
    cancelSendLink: string
    popoverConfirmBtn: string
  }
  readonly draft: {
    masonryContainer: string
    draftCard: string
    deleteBtn: string
    deleteConfirmBtn: string
  }
  readonly original: {
    originalCheckbox: string
    agreementDialog: string
    authorInput: string
  }
}

export interface BaijiahaoSelectors extends BasePlatformSelectors {
  readonly platform: 'baijiahao'
  readonly urls: {
    console: string
    write: string
    loginPage: string
    contentList: string
  }
  readonly editor: {
    titleInput: string
    editorIframe: string
    editorBody: string
    saveButtonLabels: string[]
    publishButtonLabels: string[]
    publishConfirmLabels: string[]
    coverUploadLabels: string[]
    tagInputSelector: string
    tagPopupReadySelector: string
  }
  readonly riskKeywords: string[]
}

export interface ToutiaoSelectors extends BasePlatformSelectors {
  readonly platform: 'toutiao'
  readonly urls: {
    console: string
    write: string
    contentList: string
    loginPage: string
  }
  readonly editor: {
    titleInput: string
    editorBody: string
    saveButtonLabels: string[]
    publishButtonLabels: string[]
    publishConfirmLabels: string[]
    coverPickLabels: string[]
    coverUploadLabels: string[]
  }
  readonly riskKeywords: string[]
}
