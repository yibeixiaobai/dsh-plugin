/**
 * 社媒账号配额与顺序仲裁规范 (Social Account Quota & Order Precedence Resolver)
 *
 * 【业务规则依据】：
 * 1. 未开启账户豁免：凡 enabled === false 的账号不计入会员配额上限，允许留存与编辑；
 * 2. 顺序生效机制：当用户会员等级过期（如 Pro 降为 Free，限额 1 个）或开启账号超过当前等级配额 limit 时，
 *    按照列表自然顺序，仅保证前 limit 个已开启的账号处于 active（生效可用）状态；
 * 3. 超额自动休眠：第 limit + 1 个及之后已开启的账号进入 over_quota（超限未生效）状态，不占用额外配额，
 *    任务执行全链路（UI 发起、Prompt 规划、CLI /publish 指令）严禁调度调用；
 * 4. 动态顺位递补：前序账号被关闭时，后续超额账号自动按序顺位补齐升级为 active。
 */

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
 * @param accounts 账号列表或对象
 * @param limit 当前会员等级社媒账号配额（-1 为无限制）
 */
export function resolveEffectiveSocialAccounts<T = any>(
  accounts: any,
  limit = 1,
): SocialAccountsQuotaResult<T> {
  const list = normalizeAccountsList<T>(accounts)
  const effectiveLimit = typeof limit === 'number' ? limit : 1
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

/**
 * 校验指定账号在当前列表中是否处于生效且可调用状态
 */
export function isSocialAccountCallable(
  targetAccountId: string,
  accounts: any,
  limit = 1,
): { callable: boolean; status: SocialAccountQuotaStatus; reason?: string } {
  const result = resolveEffectiveSocialAccounts(accounts, limit)
  const matched = result.items.find(item => item.id === targetAccountId)
  if (!matched) {
    return {
      callable: false,
      status: 'disabled',
      reason: `未找到 ID 为 ${targetAccountId} 的社媒账号`,
    }
  }
  return {
    callable: matched.isCallable,
    status: matched.status,
    reason: matched.reason,
  }
}

/**
 * 过滤出所有可调用的账号列表
 */
export function filterCallableSocialAccounts<T = any>(
  accounts: any,
  limit = 1,
): T[] {
  return resolveEffectiveSocialAccounts<T>(accounts, limit).activeAccounts
}
