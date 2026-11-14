import type { Browser, Page, CDPSession, ElementHandle } from 'puppeteer-core'

export interface ProfileLockHandle {
  lockPath: string
  pid: number
  released: boolean
}

export interface BrowserSessionOptions {
  /** 业务平台或渠道标识（用于并发槽位限流隔离，如 wechat, zhihu, xhs, default） */
  platform?: string
  /** 账号唯一标识（用于持久化指纹绑定） */
  accountId?: string
  /** 独立的浏览器用户数据目录（必须提供，防止多个实例争抢同一个目录导致崩溃） */
  userDataDir: string
  /** 是否以无头模式运行（默认跟随全局配置） */
  headless?: boolean
  /** 自定义可执行文件路径（留空自动探测系统 Chrome / Edge） */
  executablePath?: string
  /** 视口大小（null 表示不设置视口，完全使用系统窗口默认大小） */
  defaultViewport?: { width: number; height: number } | null
  /** CDP 协议超时时间（毫秒，默认 240000） */
  protocolTimeout?: number
  /** 自定义 Chromium 启动参数 */
  args?: string[]
  /** 平台显示名称（用于日志和排队提示） */
  platformDisplayName?: string
}

export type SafeLaunchOptions = BrowserSessionOptions

export interface ScreencastFrameData {
  sessionId?: string
  data: string // base64 encoded jpeg
  metadata: {
    offsetTop: number
    pageScaleFactor: number
    deviceWidth: number
    deviceHeight: number
    scrollOffsetX: number
    scrollOffsetY: number
    timestamp?: number
  }
  timestamp: number
}

export interface ScreencastOptions {
  maxFps?: number
  quality?: number
  maxWidth?: number
  maxHeight?: number
}

export interface CdpInputEvent {
  type: 'mousePressed' | 'mouseMoved' | 'mouseReleased' | 'click' | 'wheel' | 'keyDown' | 'keyUp'
  x?: number
  y?: number
  button?: 'left' | 'right' | 'middle' | 'none'
  deltaX?: number
  deltaY?: number
  key?: string
  text?: string
}

export interface ManagedBrowserSession {
  /** 底层 Puppeteer Browser 实例 */
  browser: Browser
  /** 默认主页面 */
  page: Page
  /** 当前用户数据目录 */
  userDataDir: string
  /** 获取底层 CDP 会话 */
  getCDPSession: () => Promise<CDPSession>
  /** 挂接实时 CDP Screencast 视讯帧流 */
  attachScreencast: (
    onFrame: (frame: ScreencastFrameData) => void,
    options?: ScreencastOptions,
  ) => Promise<() => Promise<void>>
  /** 向当前页面注入鼠标/按键 CDP 输入事件（支持人工实时接管） */
  sendInput: (event: CdpInputEvent) => Promise<void>
  /** 拟人化平滑移动并点击目标元素 */
  humanClick: (target: ElementHandle | string) => Promise<void>
  /** 拟人化输入文本 */
  humanType: (target: ElementHandle | string, text: string) => Promise<void>
  /** 检测页面是否命中人机验证或安全拦截模式 */
  detectCaptchaOrRisk: () => Promise<{ hasRisk: boolean; riskType?: string; detail?: string }>
  /** 释放会话与排他锁，优雅关闭浏览器 */
  release: () => Promise<void>
}

export interface BrowserServiceConfig {
  /** 默认是否启用无头模式 */
  defaultHeadless?: boolean
  /** 全局最大并发浏览器进程数（留空自动根据内存动态计算） */
  maxConcurrentSessions?: number
  /** 自定义 Chromium/Chrome 路径（留空自动探测系统安装） */
  executablePath?: string
  /** 是否向 DSH 独占槽位注册 ctx.browserUse 并暴露通用 Agent 工具 */
  registerBrowserUse?: boolean
}
