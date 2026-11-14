/**
 * 社媒多平台自适应差分标题引擎 (Adaptive Title Engine)
 *
 * 核心目标：
 * 解决跨平台批量内容生产分发时，各大社交媒体平台对标题字数上限巨大差异导致的合规报错与截断问题：
 * - 微信公众号长文 (gzh news): ≤64 字
 * - 微信公众号小绿书 (gzh newspic): ≤20 字（微信官方硬性拦截）
 * - 小红书 (xiaohongshu): ≤20 字（创作者中心硬性拦截）
 * - 今日头条 (toutiao): ≤30 字（头条号官方硬性规范）
 * - 知乎 (zhihu): ≤100 字（知乎专栏规范）
 * - 百家号 (baijiahao): ≤64 字（百度机器审核规范）
 */

export interface PlatformTitleConstraint {
  platform: string
  displayName: string
  maxChars: number
  recommendedChars: string
  isStrict: boolean
}

export const PLATFORM_TITLE_CONSTRAINTS: Record<string, PlatformTitleConstraint> = {
  gzh_news: {
    platform: 'gzh',
    displayName: '微信公众号长文',
    maxChars: 64,
    recommendedChars: '20~45 字',
    isStrict: true,
  },
  gzh_newspic: {
    platform: 'gzh',
    displayName: '微信小绿书',
    maxChars: 20,
    recommendedChars: '12~18 字',
    isStrict: true,
  },
  xiaohongshu: {
    platform: 'xiaohongshu',
    displayName: '小红书',
    maxChars: 20,
    recommendedChars: '14~18 字',
    isStrict: true,
  },
  toutiao: {
    platform: 'toutiao',
    displayName: '今日头条',
    maxChars: 30,
    recommendedChars: '18~28 字',
    isStrict: true,
  },
  zhihu: {
    platform: 'zhihu',
    displayName: '知乎专栏',
    maxChars: 100,
    recommendedChars: '25~50 字',
    isStrict: false,
  },
  baijiahao: {
    platform: 'baijiahao',
    displayName: '百家号',
    maxChars: 64,
    recommendedChars: '20~40 字',
    isStrict: true,
  },
}

/**
 * 规范化平台标识
 */
export function normalizePlatformKey(platform: string, isNewspic = false): string {
  const p = (platform || 'gzh').toLowerCase().trim()
  if (p === 'gzh' || p === 'wechat' || p === 'weixin') {
    return isNewspic ? 'gzh_newspic' : 'gzh_news'
  }
  if (p === 'xiaohongshu' || p === 'xhs') return 'xiaohongshu'
  if (p === 'toutiao' || p === 'tt') return 'toutiao'
  if (p === 'zhihu' || p === 'zh') return 'zhihu'
  if (p === 'baijiahao' || p === 'bjh') return 'baijiahao'
  return p
}

/**
 * 获取指定平台的最大标题字数限制
 */
export function getPlatformTitleLimit(platform: string, isNewspic = false): number {
  const key = normalizePlatformKey(platform, isNewspic)
  return PLATFORM_TITLE_CONSTRAINTS[key]?.maxChars || 64
}

export interface AdaptTitleResult {
  title: string
  originalTitle: string
  adapted: boolean
  platform: string
  limit: number
  reason?: string
}

/**
 * 核心函数：根据目标平台规格自适应差分改写/提炼标题
 * 优先保留核心主旨，剥离冗余修饰，严格收敛至平台字数上限以内
 */
export function adaptTitleForPlatform(
  rawTitle: string,
  platform: string,
  isNewspic = false,
): AdaptTitleResult {
  const originalTitle = (rawTitle || '').trim()
  const key = normalizePlatformKey(platform, isNewspic)
  const constraint = PLATFORM_TITLE_CONSTRAINTS[key] || PLATFORM_TITLE_CONSTRAINTS.gzh_news
  const limit = constraint.maxChars

  // 未超限直接返回
  if (originalTitle.length <= limit) {
    return {
      title: originalTitle,
      originalTitle,
      adapted: false,
      platform: constraint.platform,
      limit,
    }
  }

  // 1. 尝试剥离外围装饰性括号与标签前缀（如 【独家深度】、[建议收藏]、（内附清单））
  const cleaned = originalTitle
    .replace(/^[【\[(（][^】\])）]+[】\])）]\s*/, '')
    .replace(/\s*[【\[(（][^】\])）]+[】\])）]$/, '')
    .trim()

  if (cleaned.length <= limit && cleaned.length >= 4) {
    return {
      title: cleaned,
      originalTitle,
      adapted: true,
      platform: constraint.platform,
      limit,
      reason: `已自动去除外围装饰性标签，收敛至 ${constraint.displayName} 限制（≤${limit}字）`,
    }
  }

  // 2. 尝试从冒号、破折号或分句标点处拆分副标题，保留最核心的主干句
  const clauseDelimiters = /[:：—\-\s|]/
  const parts = cleaned.split(clauseDelimiters).filter(Boolean)
  if (parts.length > 1) {
    // 优先尝试第一段主句
    const firstPart = parts[0].trim()
    if (firstPart.length <= limit && firstPart.length >= 6) {
      return {
        title: firstPart,
        originalTitle,
        adapted: true,
        platform: constraint.platform,
        limit,
        reason: `已提炼核心主句并剔除副标题，适配 ${constraint.displayName} 限制（≤${limit}字）`,
      }
    }
  }

  // 3. 智能语义收敛截断：保留前 limit 个字符，并消除末尾的悬挂助词与标点
  let truncated = cleaned.slice(0, limit)
  // 消除末尾孤立助词或标点
  truncated = truncated.replace(/[\s,，、:：;；\-—_的了与和及在对向从]$/, '').trim()

  return {
    title: truncated,
    originalTitle,
    adapted: true,
    platform: constraint.platform,
    limit,
    reason: `已智能凝练紧凑标题，满足 ${constraint.displayName} 硬性规范（原 ${originalTitle.length} 字 ➔ 现 ${truncated.length} 字）`,
  }
}

/**
 * 批量标题自适应转换
 */
export function adaptBatchTitles(
  titles: string[],
  platform: string,
  isNewspic = false,
): AdaptTitleResult[] {
  return (titles || []).map(t => adaptTitleForPlatform(t, platform, isNewspic))
}

/**
 * 校验标题是否属于调试/生成占位符（如 "文章_1", "文章_1 职称评审", "article_1", "未命名", "draft" 等）
 * 【中文修复依据】：严防占位符标题泄露至下游生图或发布到微信公众平台官方后台造成重大运营事故
 */
export function isInvalidPlaceholderTitle(title: string | undefined | null): boolean {
  if (!title) return true
  const trimmed = title.trim()
  return (
    !trimmed ||
    /^(?:文章|article)[_\s\-]?\d+(?:[:：\s_\-]|$)/i.test(trimmed) ||
    /^(?:文章|article)[_\s\-]?\d*$/i.test(trimmed) ||
    /^(?:未命名|无标题|新建文章|草稿)(?:文章|图文)?[_\s\-]?\d*(?:[:：\s_\-]|$)/i.test(trimmed) ||
    /^(?:untitled|draft)[_\s\-]?\d*(?:[:：\s_\-]|$)/i.test(trimmed)
  )
}
