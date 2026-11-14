/**
 * 生图提供商装配与比例解析辅助模块
 */
import type { Config } from '../config.ts'
import {
  XHS_COVER_RATIO,
  ZHIHU_COVER_RATIO,
  BAIJIAHAO_COVER_RATIO,
  TOUTIAO_COVER_RATIO,
} from '../config.ts'
import { resolveProjectImageModels } from '../model-resolver.ts'
import { resolveCoverRatio } from './shared.ts'

export function assembleImageProviders(cfg: Config, effectiveWs?: string): Array<{ id: string; provider: any }> {
  const projectImageModels = resolveProjectImageModels(effectiveWs)
  let providers: Array<{ id: string; provider: any }> = []

  if (projectImageModels.length > 0) {
    providers = projectImageModels
      .filter(m => Boolean(m.apiKey))
      .map(m => ({
        id: `project-${m.providerId}-${m.modelId}`,
        provider: {
          enabled: true,
          name: `${(m as any).providerName || m.providerId}/${(m as any).modelName || m.modelId}`,
          providerId: m.providerId,
          base_url: m.baseUrl,
          api_key: m.apiKey,
          model: m.modelId,
          priority: m.priority,
        },
      }))
  }

  if (cfg.image_providers) {
    for (const [id, prov] of Object.entries(cfg.image_providers)) {
      if (prov && prov.enabled && prov.base_url && prov.api_key) {
        providers.push({
          id: `pool-${id}`,
          provider: { ...prov, priority: (prov.priority ?? 0) - 100 },
        })
      }
    }
  }

  return providers
}

export function resolveItemCoverRatio(cfg: Config, profile: any, index: number): import('../config.ts').CoverRatio {
  const p = profile?.platform
  if (p === 'zhihu') return ZHIHU_COVER_RATIO
  if (p === 'xiaohongshu') return XHS_COVER_RATIO
  if (p === 'baijiahao') return BAIJIAHAO_COVER_RATIO
  if (p === 'toutiao') return TOUTIAO_COVER_RATIO
  return resolveCoverRatio(cfg, index, profile)
}
