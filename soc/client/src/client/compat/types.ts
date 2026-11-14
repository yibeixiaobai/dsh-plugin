export interface ConversationRow {
  id?: string
  role?: string
  content?: any
  toolCalls?: any[]
  [key: string]: any
}

export type SocialAccountQuotaStatus = 'active' | 'disabled' | 'over_quota'

export interface ResolvedSocialAccount<T = any> {
  account: T
  id: string
  name: string
  platform: string
  status: SocialAccountQuotaStatus
  isCallable: boolean
  quotaIndex?: number
  reason?: string
}

export interface SocialAccountsQuotaResult<T = any> {
  items: ResolvedSocialAccount<T>[]
  activeAccounts: T[]
  activeCount: number
  disabledCount: number
  overQuotaCount: number
  limit: number
}

export const DEFAULT_DESKTOP_CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'

export function buildLocalMediaPreviewUrl(filePath: string): string {
  if (!filePath) return ''
  if (filePath.startsWith('http://') || filePath.startsWith('https://') || filePath.startsWith('data:')) {
    return filePath
  }
  return `dsh-resource://file/${encodeURIComponent(filePath)}`
}

export function isBrandGeoEnabled(): boolean {
  return false
}

/**
 * 规范化提取账号列表
 */
export function normalizeAccountsList<T = any>(raw: any): T[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'object') {
    return Object.entries(raw).map(([id, val]: [string, any]) => ({
      id,
      ...(typeof val === 'object' ? val : {}),
    })) as T[]
  }
  return []
}

/**
 * 按列表自然顺序裁决账号的配额占用与生效状态
 */
export function resolveEffectiveSocialAccounts<T = any>(
  accounts: any,
  limit = -1,
): SocialAccountsQuotaResult<T> {
  const list = normalizeAccountsList<T>(accounts)
  const effectiveLimit = typeof limit === 'number' ? limit : -1
  const isUnlimited = effectiveLimit === -1

  let activeCount = 0
  let disabledCount = 0
  let overQuotaCount = 0
  const activeAccounts: T[] = []

  const items: ResolvedSocialAccount<T>[] = list.map((acc: any, index) => {
    const id = String(acc.id || `account_${index}`)
    const name = String(acc.name || id)
    const platform = String(acc.platform || 'gzh')
    const isEnabled = acc.enabled !== false

    // 1. 未开启账户：不占用配额，不可调用
    if (!isEnabled) {
      disabledCount++
      return {
        account: acc,
        id,
        name,
        platform,
        status: 'disabled',
        isCallable: false,
        reason: '账号已处于停用状态，不占用会员配额，不可在任务中调用',
      }
    }

    // 2. 已开启账户：检查是否在前 N 个配额内
    if (isUnlimited || activeCount < effectiveLimit) {
      activeCount++
      activeAccounts.push(acc)
      return {
        account: acc,
        id,
        name,
        platform,
        status: 'active',
        isCallable: true,
        quotaIndex: activeCount,
      }
    }

    // 3. 超额开启账户：按列表顺序超出配额上限，进入超额休眠
    overQuotaCount++
    return {
      account: acc,
      id,
      name,
      platform,
      status: 'over_quota',
      isCallable: false,
      reason: `超出当前会员等级配额上限（限 ${effectiveLimit} 个），已按顺序自动休眠，任务中严禁调用`,
    }
  })

  return {
    items,
    activeAccounts,
    activeCount,
    disabledCount,
    overQuotaCount,
    limit: effectiveLimit,
  }
}

export function hasSocialPlatformAuthCredentials(accOrPlat: any, _account?: any, _cookies?: any): any {
  return { valid: true, reason: '' }
}

export function getSocialPlatformLoginUrl(platform: string, _config?: any): string {
  switch (platform) {
    case 'gzh':
    case 'wechat':
      return 'https://mp.weixin.qq.com/'
    case 'xiaohongshu':
    case 'xhs':
      return 'https://creator.xiaohongshu.com/login'
    case 'zhihu':
      return 'https://www.zhihu.com/signin'
    case 'baijiahao':
      return 'https://baijiahao.baidu.com/builder/author/register/login'
    case 'toutiao':
      return 'https://mp.toutiao.com/auth/page/login'
    default:
      return 'https://mp.weixin.qq.com/'
  }
}

export function isSocialPlatformSuccessUrl(platform: string, url: string): boolean {
  if (!url) return false
  if (platform === 'gzh' || platform === 'wechat') return url.includes('cgi-bin/home') || url.includes('cgi-bin/frame')
  if (platform === 'xiaohongshu' || platform === 'xhs') return url.includes('creator.xiaohongshu.com/creator/home') || url.includes('/publish')
  if (platform === 'zhihu') return url.includes('zhihu.com/creator') || url.includes('zhihu.com/hot')
  if (platform === 'baijiahao') return url.includes('baijiahao.baidu.com/builder/rc/home')
  if (platform === 'toutiao') return url.includes('mp.toutiao.com/profile_v4/index')
  return false
}

export function isSocialPlatformLoginUrl(platform: string, url: string): boolean {
  return !isSocialPlatformSuccessUrl(platform, url)
}

export function parseCookieString(raw: string, domain?: string): any[] {
  if (!raw || typeof raw !== 'string') return []
  return raw
    .split(';')
    .map((part) => {
      const [name, ...val] = part.trim().split('=')
      return { name: name?.trim() || '', value: val.join('=').trim(), domain }
    })
    .filter(c => Boolean(c.name))
}
