import { memo } from 'react'
import { Check, Loader2 } from 'lucide-react'
import type { SocialPlatformKey } from '../utils/socialPlatformsMeta.js'
import type { AccountHealthInfo } from '../utils/useSocialAccountsHealth.js'
import css from '../SocialPublisherComposerCard.module.css'

export interface SocialAccountPickerDrawerProps {
  show: boolean
  selectedPlatforms: SocialPlatformKey[]
  platformsMeta: Array<{ key: SocialPlatformKey; label: string; shortLabel: string }>
  filteredAccounts: any[]
  effectiveAccounts: any[]
  selectedAccountIds: string[]
  selectAllAccounts: boolean
  loadingAccounts: boolean
  accountHealthMap: Record<string, AccountHealthInfo>
  onSelectAll: () => void
  onToggleAccount: (id: string) => void
  onOpenLoginModal?: (account: any) => void
}

export const SocialAccountPickerDrawer = memo(function SocialAccountPickerDrawer({
  show,
  selectedPlatforms,
  platformsMeta,
  filteredAccounts,
  effectiveAccounts,
  selectedAccountIds,
  selectAllAccounts,
  loadingAccounts,
  accountHealthMap,
  onSelectAll,
  onToggleAccount,
  onOpenLoginModal: _onOpenLoginModal,
}: SocialAccountPickerDrawerProps) {
  if (!show) return null

  return (
    <div className={css.accountDrawerPanel}>
      {/* 顶层全部账号重置胶囊 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <button
          type="button"
          onClick={onSelectAll}
          className={`${css.accountChip} ${selectAllAccounts ? css.accountChipActive : ''}`}
        >
          全部账号 (默认)
        </button>
        {!selectAllAccounts && (
          <span style={{ fontSize: '11px', color: 'var(--dsw-alias-label-caption, #9ca3af)' }}>
            已切换为精确指定模式，仅执行所勾选的账号
          </span>
        )}
      </div>

      {/* 按已选平台分栏展示各自的专属账号 */}
      {selectedPlatforms.map((pKey) => {
        const platOption = platformsMeta.find(p => p.key === pKey)
        const platAccounts = filteredAccounts.filter((acc) => {
          const pk = acc.platform === 'xhs' ? 'xiaohongshu' : acc.platform
          return pk === pKey
        })

        if (platAccounts.length === 0) return null

        const platSelectedCount = effectiveAccounts.filter(
          a => (a.platform === 'xhs' ? 'xiaohongshu' : a.platform) === pKey,
        ).length

        return (
          <div key={pKey} className={css.accountGroupCard}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11.5px' }}>
              <span style={{ fontWeight: 600, color: 'var(--dsw-alias-label-primary, #111827)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>{platOption?.label || pKey}</span>
                <span style={{ color: 'var(--dsw-alias-label-caption, #9ca3af)', fontWeight: 400 }}>
                  ({platAccounts.length}个可用)
                </span>
              </span>
              {!selectAllAccounts && platSelectedCount === 0 && (
                <span style={{ color: 'var(--dsw-alias-label-caption, #9ca3af)', fontSize: '11px' }}>
                  未选账号 (不发布该平台)
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {platAccounts.map((account) => {
                const isChecked = !selectAllAccounts && selectedAccountIds.includes(account.id)
                const health = accountHealthMap[account.id]
                const isHealthy = health?.valid === true
                const isExpired = health?.valid === false
                const isChecking = health?.checking === true

                return (
                  <div key={account.id} style={{ display: 'flex', alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => onToggleAccount(account.id)}
                      title={
                        health?.userName
                          ? `已授权创作者：${health.userName}`
                          : isExpired
                            ? `登录态已失效或未登录：${health?.error || '请前往设置页账号列表扫码登录'}`
                            : account.name || account.id
                      }
                      className={`${css.accountChip} ${isChecked ? css.accountChipActive : ''}`}
                    >
                      {isChecking ? (
                        <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} />
                      ) : isHealthy ? (
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
                      ) : isExpired ? (
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b' }} />
                      ) : (
                        <span
                          style={{
                            width: '5px',
                            height: '5px',
                            borderRadius: '50%',
                            background: account.enabled ? '#10b981' : '#9ca3af',
                          }}
                        />
                      )}
                      <span>{account.name || account.id}</span>
                      {isChecked && <Check size={10} strokeWidth={2.5} style={{ color: '#059669' }} />}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {filteredAccounts.length === 0 && !loadingAccounts ? (
        <span style={{ fontSize: '11px', color: 'var(--dsw-alias-label-caption, #9ca3af)' }}>
          当前所选平台未配置任何账号
        </span>
      ) : null}
    </div>
  )
})
