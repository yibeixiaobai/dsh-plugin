import type { Config, AccountProfile } from '../config.ts'
import { getStrictImageQuota } from './shared.ts'
import type { GenItem } from './genImagesTypes.ts'

/**
 * 校验生图配额硬约束
 * 【中文依据】：所有平台和账号的任务必须按照内容规则的配图数量限制生产，不允许多或者缺少
 */
export function assertStrictImageQuota(params: {
  cfg: Config
  account: { id: string; profile: AccountProfile }
  items: GenItem[]
  isNewspic: boolean
}): void {
  const { cfg, account, items, isNewspic } = params
  const quota = getStrictImageQuota(cfg, account.profile, isNewspic ? 'newspic' : 'news')
  const articleIndexes = Array.from(new Set(items.map(it => it.index)))
  if (articleIndexes.length === 0) {
    throw new Error('生图任务中未包含任何有效的文章序号 (index)')
  }

  for (const idx of articleIndexes) {
    if (quota.isNewspic) {
      // 图文卡片模式（小红书 / 微信小绿书）
      const picItems = items.filter(it => it.kind === 'pic' && it.index === idx)
      const actualPicCount = picItems.length
      const requiredPicCount = quota.cardImageCount

      if (actualPicCount < requiredPicCount) {
        const existingSubs = new Set(picItems.map(it => it.sub))
        const missingSubs: number[] = []
        for (let s = 1; s <= requiredPicCount; s++) {
          if (!existingSubs.has(s)) missingSubs.push(s)
        }
        throw new Error(
          `【配图数量硬性拦截】${account.profile.name || account.id}（${quota.platform}图文）严格要求生产 ${requiredPicCount} 张 3:4 竖版卡片，实际仅传入 ${actualPicCount} 张！缺少卡片序号: ${missingSubs.join(', ')}。请严格按内容规则配图数量补全后再执行生图！`,
        )
      }

      if (actualPicCount > requiredPicCount) {
        throw new Error(
          `【配图数量硬性拦截】${account.profile.name || account.id}（${quota.platform}图文）严格限制生产 ${requiredPicCount} 张 3:4 竖版卡片，实际传入 ${actualPicCount} 张，超标多出配图！严禁多生！请调整为刚好 ${requiredPicCount} 张。`,
        )
      }
    } else {
      // 长文平台（微信公众号长文 / 知乎 / 百家号 / 今日头条）
      if (quota.coverRequired) {
        const hasCover = items.some(it => it.kind === 'cover' && it.index === idx)
        if (!hasCover) {
          throw new Error(`【配图数量硬性拦截】第 ${idx} 篇长文当前缺少封面图（kind: cover）！长文严格要求 1 张封面 + ${quota.contentImageCount} 张正文插图。`)
        }
      }

      const contentItems = items.filter(it => it.kind === 'content' && it.index === idx)
      const actualContentCount = contentItems.length
      const requiredContentCount = quota.contentImageCount

      if (actualContentCount < requiredContentCount) {
        const existingSubs = new Set(contentItems.map(it => it.sub))
        const missingSubs: number[] = []
        for (let s = 1; s <= requiredContentCount; s++) {
          if (!existingSubs.has(s)) missingSubs.push(s)
        }
        throw new Error(
          `【配图数量硬性拦截】第 ${idx} 篇长文正文插图不足！规则严格要求 ${requiredContentCount} 张正文插图，实际仅传入 ${actualContentCount} 张，缺少插图序号: ${missingSubs.join(', ')}。请补全后再执行生图！`,
        )
      }

      if (actualContentCount > requiredContentCount) {
        throw new Error(
          `【配图数量硬性拦截】第 ${idx} 篇长文正文插图超标！规则严格限制 ${requiredContentCount} 张正文插图，实际传入 ${actualContentCount} 张！超标多出配图！严禁多生！`,
        )
      }
    }
  }
}
