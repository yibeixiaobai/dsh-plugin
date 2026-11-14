import { useState, useEffect, useCallback } from 'react'
import { Send, AlertCircle, ChevronDown, ChevronUp, ShieldCheck, ShieldAlert, SlidersHorizontal } from 'lucide-react'
import { useOptionalServices } from '../../compat/hooks/useServices.js'
import { publisherApiFetch, safeParseJson, normalizeAccountsList } from '../../settings/SocialPublisherTypes.js'
import { SocialAccountPickerDrawer } from './components/SocialAccountPickerDrawer.js'
import { SocialComposerHeader } from './components/SocialComposerHeader.js'
import { useMembership } from '../../compat/hooks/useMembership.js'
import { SocialPublisherComposerModals, type LoginModalState } from './components/SocialPublisherComposerModals.js'
import { SocialPlatformGridPicker } from './components/SocialPlatformGridPicker.js'
import { SocialViralSparksBar } from './components/SocialViralSparksBar.js'
import { useSocialComposerAccounts } from './utils/useSocialComposerAccounts.js'
import { buildSocialComposerPrompts } from './utils/socialComposerPromptBuilder.js'
import { PLATFORMS, type SocialPlatformKey, type SocialAccountTaskPlan, type SocialPublisherSubmitData } from './utils/socialPlatformsMeta.js'
import type { ModelSelectionView } from '../../compat/hooks/useServices.js'
import { SocialPublisherModelPicker, type UnifiedModelSelection } from './components/SocialPublisherModelPicker.js'
import { SocialPublisherWorkspacePicker } from './components/SocialPublisherWorkspacePicker.js'
import css from './SocialPublisherComposerCard.module.css'

export type { SocialPlatformKey, SocialAccountTaskPlan, SocialPublisherSubmitData }

interface SocialPublisherComposerCardProps {
  onClose?: () => void
  onSubmit: (data: SocialPublisherSubmitData) => void
  disabled?: boolean
  modelSelectionView?: ModelSelectionView | null
  defaultModelSelection?: { provider: string; model: string }
  sessionId?: string
  workspacePath?: string
}

export function SocialPublisherComposerCard({
  onClose,
  onSubmit,
  disabled = false,
  modelSelectionView,
  defaultModelSelection,
  sessionId,
  workspacePath,
}: SocialPublisherComposerCardProps) {
  const services = useOptionalServices()
  const socialPublisherRpc = services?.socialPublisherService ?? null

  const [selectedPlatforms, setSelectedPlatforms] = useState<SocialPlatformKey[]>(['gzh'])
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([])
  const [selectAllAccounts, setSelectAllAccounts] = useState(true)
  const [showAccountDrawer, setShowAccountDrawer] = useState(false)
  const [isDryRun, setIsDryRun] = useState<boolean>(true)
  const [notes, setNotes] = useState('')
  const [accounts, setAccounts] = useState<any[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [loginModalState, setLoginModalState] = useState<LoginModalState>({ open: false, platform: 'gzh', accountId: '', accountName: '' })

  const [preflightGateOpen, setPreflightGateOpen] = useState(false)
  const [featureGateOpen, setFeatureGateOpen] = useState(false)
  const { checkFeature, profile } = useMembership()
  const [unreadyAccountsList, setUnreadyAccountsList] = useState<any[]>([])

  const [currentWorkspacePath, setCurrentWorkspacePath] = useState<string>(workspacePath || '')

  useEffect(() => {
    if (workspacePath && !currentWorkspacePath) setCurrentWorkspacePath(workspacePath)
  }, [workspacePath, currentWorkspacePath])

  const [selectedUnifiedModel, setSelectedUnifiedModel] = useState<UnifiedModelSelection | null>(
    defaultModelSelection
      ? { provider: defaultModelSelection.provider, model: defaultModelSelection.model }
      : null,
  )
  useEffect(() => {
    if (defaultModelSelection && !selectedUnifiedModel) {
      setSelectedUnifiedModel({ provider: defaultModelSelection.provider, model: defaultModelSelection.model })
    }
  }, [defaultModelSelection, selectedUnifiedModel])

  const fetchAccounts = useCallback(async () => {
    setLoadingAccounts(true)
    try {
      const res = await publisherApiFetch(
        '/api/gzh-publisher/config/export?include_secrets=true&download=false',
        {},
        socialPublisherRpc,
      )
      const parsed = await safeParseJson(res)
      if (parsed.ok) {
        const rawConfig = parsed.data.config || parsed.data
        setAccounts(normalizeAccountsList(rawConfig.accounts))
        if (rawConfig.runtime?.dry_run !== undefined)
          setIsDryRun(Boolean(rawConfig.runtime.dry_run))
      }
    } catch (error) {
      console.warn('[SocialPublisherComposerCard] 加载账号失败:', error)
    } finally {
      setLoadingAccounts(false)
    }
  }, [socialPublisherRpc])

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  const {
    filteredAccounts,
    effectiveAccounts,
    effectivePlatforms,
    accountHealthMap,
    checkSingleAccount,
  } = useSocialComposerAccounts({
    accounts,
    socialAccountsLimit: profile?.privileges.socialAccountsLimit,
    selectedPlatforms,
    selectedAccountIds,
    selectAllAccounts,
    socialPublisherRpc,
  })

  const togglePlatform = (platformKey: SocialPlatformKey) => {
    setSelectedPlatforms(prev =>
      prev.includes(platformKey) ? (prev.length === 1 ? prev : prev.filter(k => k !== platformKey)) : [...prev, platformKey],
    )
  }

  const toggleAccount = (accountId: string) => {
    setSelectAllAccounts(false)
    setSelectedAccountIds(prev => prev.includes(accountId) ? prev.filter(id => id !== accountId) : [...prev, accountId])
  }

  const doSubmit = useCallback((
    platformsToSubmit = effectivePlatforms,
    notesToSubmit = notes,
    selectAll = selectAllAccounts,
    accountsToUse = effectiveAccounts,
  ) => {
    if (!selectAll && accountsToUse.length === 0) {
      setErrorMessage('请至少选择一个执行账号，或点击切换为「全部账号」')
      return
    }
    if (platformsToSubmit.length === 0) {
      setErrorMessage('当前所选账号无对应生效发布平台，请重新选择')
      return
    }
    setErrorMessage(null)

    const effectiveWorkspace = currentWorkspacePath || workspacePath
    const { formattedPrompt, accountsPlan } = buildSocialComposerPrompts({
      platformsToSubmit,
      accountsToUse,
      selectAll,
      notesToSubmit,
      isDryRun,
      platformsMeta: PLATFORMS,
      sessionId,
      workspacePath: effectiveWorkspace,
    })

    onSubmit({
      platforms: platformsToSubmit,
      accountIds: accountsToUse.map((a: any) => String(a.id || '')).filter(Boolean),
      selectAllAccounts: selectAll,
      topic: '',
      notes: notesToSubmit.trim(),
      formattedPrompt,
      accountsPlan,
      unifiedModel: selectedUnifiedModel || undefined,
      workspacePath: effectiveWorkspace,
    })
  },
  [currentWorkspacePath, effectiveAccounts, effectivePlatforms, isDryRun, notes, onSubmit, selectAllAccounts, selectedUnifiedModel, sessionId, workspacePath],
  )

  const handleSubmit = async (e?: React.FormEvent) => {
    if (effectiveAccounts.length > 1) {
      const gate = await checkFeature('social_matrix_concurrency')
      if (!gate.allowed) {
        setFeatureGateOpen(true)
        return
      }
    }
    if (e) e.preventDefault()
    if (!isDryRun) {
      const unready = effectiveAccounts.filter(
        (a: any) => a.id && accountHealthMap[a.id]?.valid === false,
      )
      if (unready.length > 0) {
        setUnreadyAccountsList(unready)
        setPreflightGateOpen(true)
        return
      }
    }
    doSubmit()
  }

  return (
    <div
      className={css.card}
      data-testid="social-publisher-composer-card"
    >
      <SocialComposerHeader
        isDryRun={isDryRun}
        selectedPlatformsCount={selectedPlatforms.length}
        onClose={onClose}
      />
      <SocialPlatformGridPicker
        selectedPlatforms={selectedPlatforms}
        onTogglePlatform={togglePlatform}
      />

      <div className={css.accountBar}>
        <div className={css.accountBarTop}>
          <div className={css.accountBarTitle}>
            {effectiveAccounts.some((a: any) => a.id && accountHealthMap[a.id]?.valid === false) ? (
              <ShieldAlert size={12} style={{ color: '#f59e0b', flexShrink: 0 }} />
            ) : (
              <ShieldCheck size={12} style={{ color: '#10b981', flexShrink: 0 }} />
            )}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectAllAccounts
                ? `全自动免密发布 (${effectiveAccounts.length} 个账号)`
                : `指定账号 (${effectiveAccounts.length} 个)`}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowAccountDrawer(v => !v)}
            className={css.accountSettingsToggle}
            title="选择特定发布账号"
          >
            <SlidersHorizontal size={11} />
            <span>账号设置</span>
            {showAccountDrawer ? (
              <ChevronUp size={11} />
            ) : (
              <ChevronDown size={11} />
            )}
          </button>
        </div>

        <SocialAccountPickerDrawer
          show={showAccountDrawer}
          selectedPlatforms={selectedPlatforms}
          platformsMeta={PLATFORMS}
          filteredAccounts={filteredAccounts}
          effectiveAccounts={effectiveAccounts}
          selectedAccountIds={selectedAccountIds}
          selectAllAccounts={selectAllAccounts}
          loadingAccounts={loadingAccounts}
          accountHealthMap={accountHealthMap}
          onSelectAll={() => {
            setSelectAllAccounts(true)
            setSelectedAccountIds([])
          }}
          onToggleAccount={toggleAccount}
          onOpenLoginModal={(acc) => {
            setLoginModalState({
              open: true,
              platform: acc.platform === 'xhs' ? 'xiaohongshu' : acc.platform || 'gzh',
              accountId: acc.id,
              accountName: acc.name || acc.id,
            })
          }}
        />
      </div>

      <div className={css.composerInputArea}>
        <div className={css.inputAreaHeader}>
          <span className={css.inputAreaTitle}>定制要求 / 选题灵感</span>
          <span className={css.inputAreaHint}>留空则全自动热点巡航</span>
        </div>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value)
            if (errorMessage) setErrorMessage(null)
          }}
          disabled={disabled}
          placeholder="例如：围绕本周最新行业前沿热点写一篇深度综述，要求逻辑严密，并针对小红书生成 4 张 3:4 竖版图文..."
          className={css.textarea}
        />
        <SocialViralSparksBar
          onSelectPrompt={(prompt) => {
            setNotes(prompt)
            if (errorMessage) setErrorMessage(null)
          }}
        />
      </div>

      {errorMessage && (
        <div className={css.errorMessage}>
          <AlertCircle size={12} style={{ flexShrink: 0 }} />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className={css.footer}>
        <div className={css.footerLeft}>
          <SocialPublisherWorkspacePicker
            currentWorkspacePath={currentWorkspacePath}
            onSelectWorkspacePath={setCurrentWorkspacePath}
            disabled={disabled}
          />

          <div className={css.modeHint}>
            <ShieldCheck size={13} style={{ flexShrink: 0 }} />
            <span>
              {isDryRun ? '演练模式（不耗额度·不发布）' : '实盘模式 · 选题查重 · 真实排版 · 一键多发'}
            </span>
          </div>
        </div>

        <div className={css.footerRight}>
          <SocialPublisherModelPicker
            modelSelectionView={modelSelectionView}
            value={selectedUnifiedModel}
            onChange={setSelectedUnifiedModel}
            disabled={disabled}
          />
          <button
            type="button"
            disabled={
              disabled ||
              (!selectAllAccounts && effectiveAccounts.length === 0) ||
              effectivePlatforms.length === 0
            }
            onClick={() => handleSubmit()}
            className={css.submitBtn}
          >
            <span>
              {effectiveAccounts.length > 1
                ? `启动矩阵并行 (${effectiveAccounts.length}账号)`
                : '开始执行'}
            </span>
            <Send size={12} style={{ flexShrink: 0 }} />
          </button>
        </div>
      </div>

      <SocialPublisherComposerModals
        loginModalState={loginModalState} setLoginModalState={setLoginModalState} checkSingleAccount={checkSingleAccount}
        preflightGateOpen={preflightGateOpen} setPreflightGateOpen={setPreflightGateOpen} unreadyAccountsList={unreadyAccountsList}
        doSubmit={doSubmit} effectivePlatforms={effectivePlatforms} notes={notes}
        selectAllAccounts={selectAllAccounts} effectiveAccounts={effectiveAccounts} setErrorMessage={setErrorMessage}
        featureGateOpen={featureGateOpen} setFeatureGateOpen={setFeatureGateOpen}
      />
    </div>
  )
}
