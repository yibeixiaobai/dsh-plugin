// 社媒发布平台页面对象模型与选择器统一出口
export * from './types.ts'
export * from './xiaohongshu.ts'
export * from './wechat.ts'
export * from './zhihu.ts'
export * from './baijiahao.ts'
export * from './toutiao.ts'
export * from './hotpatchManager.ts'
export * from './semanticLocator.ts'

import { XHS_SELECTORS } from './xiaohongshu.ts'
import { WECHAT_SELECTORS } from './wechat.ts'
import { ZHIHU_SELECTORS } from './zhihu.ts'
import { BAIJIAHAO_SELECTORS } from './baijiahao.ts'
import { TOUTIAO_SELECTORS } from './toutiao.ts'
import { hotpatchManager } from './hotpatchManager.ts'
import type { BasePlatformSelectors } from './types.ts'

/**
 * 平台选择器注册字典
 */
export const PLATFORM_SELECTORS_MAP: Record<string, BasePlatformSelectors> = {
  xiaohongshu: XHS_SELECTORS,
  xhs: XHS_SELECTORS,
  gzh: WECHAT_SELECTORS,
  wechat: WECHAT_SELECTORS,
  zhihu: ZHIHU_SELECTORS,
  baijiahao: BAIJIAHAO_SELECTORS,
  bjh: BAIJIAHAO_SELECTORS,
  toutiao: TOUTIAO_SELECTORS,
}

/**
 * 获取指定平台的选择器资产集合，自动结合热补丁求值
 */
export function getPlatformSelectors<T extends BasePlatformSelectors = BasePlatformSelectors>(platform: string): T | null {
  const norm = platform.toLowerCase().trim()
  return (PLATFORM_SELECTORS_MAP[norm] as T) || null
}
