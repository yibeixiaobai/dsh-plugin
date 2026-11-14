/**
 * 浏览器反自动化检测套件类型定义
 */

export interface UserAgentBrand {
  brand: string
  version: string
}

export interface UserAgentDataConfig {
  brands: UserAgentBrand[]
  mobile: boolean
  platform: string
  architecture: string
  bitness: string
  model: string
  platformVersion: string
}

export interface WindowGeometryConfig {
  outerWidthDiff: number
  outerHeightDiff: number
  devicePixelRatio: number
}

export interface FingerprintConfig {
  vendor: string
  renderer: string
  userAgent: string
  userAgentData: UserAgentDataConfig
  screen: {
    width: number
    height: number
    availWidth: number
    availHeight: number
    colorDepth: number
  }
  windowGeometry: WindowGeometryConfig
  languages: string[]
  canvasNoiseSeed: number
  audioNoiseSeed?: number
}

export interface HumanMotionOptions {
  speedFactor?: number
  enableJitter?: boolean
  jitterIntensity?: number
}

export interface HumanTypeOptions {
  meanDelay?: number
  stdDev?: number
  punctuationPause?: number
  paragraphPause?: number
  simulateTypo?: boolean
}

export interface HumanPasteOptions {
  dwellBeforePasteMs?: number
  reviewScrollSteps?: number
  pauseAfterPasteMs?: number
}

export interface CaptchaPresenceResult {
  detected: boolean
  reason?: string
  type?: 'rotate' | 'slide' | 'puzzle' | 'general'
  frameUrl?: string
}
