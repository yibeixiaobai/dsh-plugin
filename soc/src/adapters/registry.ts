import { normalizePlatform } from '../config.ts'
import { BaijiahaoPlatformAdapter } from './baijiahao-adapter.ts'
import { ToutiaoPlatformAdapter } from './toutiao-adapter.ts'
import type {
  ISocialPlatformAdapter,
  PlatformCapabilities,
  PlatformType,
} from './types.ts'
import { WechatPlatformAdapter } from './wechat-adapter.ts'
import { XiaohongshuPlatformAdapter } from './xiaohongshu-adapter.ts'
import { ZhihuPlatformAdapter } from './zhihu-adapter.ts'

export class PlatformAdapterRegistry {
  private readonly adapters = new Map<PlatformType, ISocialPlatformAdapter>()

  /** 注册新的平台适配器 */
  register(adapter: ISocialPlatformAdapter): void {
    this.adapters.set(adapter.capabilities.id, adapter)
  }

  /** 判断是否支持指定平台 */
  has(platform: string): boolean {
    const norm = this.resolvePlatformKey(platform)
    return norm ? this.adapters.has(norm) : false
  }

  /** 获取指定平台的标准驱动适配器 */
  get(platform: string): ISocialPlatformAdapter {
    const key = this.resolvePlatformKey(platform)
    if (!key) {
      throw new Error(`未知的社媒平台类型: "${platform}"。支持的平台: ${Array.from(this.adapters.keys()).join(', ')}`)
    }
    const adapter = this.adapters.get(key)
    if (!adapter) {
      throw new Error(`未找到平台 "${key}" 的发布适配器实现`)
    }
    return adapter
  }

  /** 列出所有已注册的适配器实例 */
  list(): ISocialPlatformAdapter[] {
    return Array.from(this.adapters.values())
  }

  /** 列出所有已支持平台的能力规范清单 */
  listCapabilities(): PlatformCapabilities[] {
    return this.list().map((a) => a.capabilities)
  }

  /** 标准化平台标识符与别名解析 */
  private resolvePlatformKey(raw: string): PlatformType | null {
    if (!raw || typeof raw !== 'string') return null
    const norm = raw.toLowerCase().trim()
    if (norm === 'gzh' || norm === 'wechat') return 'gzh'
    if (norm === 'zhihu') return 'zhihu'
    if (norm === 'baijiahao' || norm === 'bjh') return 'baijiahao'
    if (norm === 'toutiao') return 'toutiao'
    if (norm === 'xiaohongshu' || norm === 'xhs') return 'xiaohongshu'
    return null
  }
}

/** 全局单例平台适配器注册中心，默认装配内置 5 大平台标准驱动 */
export const adapterRegistry = new PlatformAdapterRegistry()

// 播种内置平台适配器
adapterRegistry.register(new WechatPlatformAdapter())
adapterRegistry.register(new ZhihuPlatformAdapter())
adapterRegistry.register(new BaijiahaoPlatformAdapter())
adapterRegistry.register(new ToutiaoPlatformAdapter())
adapterRegistry.register(new XiaohongshuPlatformAdapter())
