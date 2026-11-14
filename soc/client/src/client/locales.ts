export const zh = {
  nav: '社媒发布',
  'panel.title': '社媒工作台',
  'tab.articleReview': '文章排版预览',
  'tab.studio': '矩阵创作中心',
  'tab.schedule': '定时与草稿',
  'tab.settings': '账号与配置',
  'composer.openStudio': '打开社媒工作台',
  'composer.placeholder': '输入社媒内容创作或发布指令...',
  'turn.title': '社媒发布流水线',
  'turn.completed': '已完成',
  'turn.inProgress': '进行中',
  'turn.failed': '失败',
  'mode.general': '通用任务',
  'mode.social': '社媒发布',
  'mode.general.tooltip': '切换为通用对话任务',
  'mode.social.tooltip': '切换为社媒发布专属模式',
} as const

export const en: Record<keyof typeof zh, string> = {
  nav: 'Social Publisher',
  'panel.title': 'Social Studio',
  'tab.articleReview': 'Article Preview & Style',
  'tab.studio': 'Matrix Studio',
  'tab.schedule': 'Schedule & Drafts',
  'tab.settings': 'Accounts & Config',
  'composer.openStudio': 'Open Social Studio',
  'composer.placeholder': 'Enter social publishing command...',
  'turn.title': 'Social Publishing Pipeline',
  'turn.completed': 'Completed',
  'turn.inProgress': 'In Progress',
  'turn.failed': 'Failed',
  'mode.general': 'General Task',
  'mode.social': 'Social Publisher',
  'mode.general.tooltip': 'Switch to General Task',
  'mode.social.tooltip': 'Switch to Social Publisher Mode',
}

export type SocialPublisherLocaleKey = keyof typeof zh
