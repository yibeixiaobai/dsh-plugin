import React from 'react'
import { SocialPublisherLoginModal } from '../../../settings/SocialPublisherLoginModal.js'
import { SocialPreflightGateModal } from './SocialPreflightGateModal.js'
import { ProFeatureGateModal } from '../../../settings/ProFeatureGateModal.js'
import type { SocialPlatformKey } from '../utils/socialPlatformsMeta.js'

export interface LoginModalState {
  open: boolean
  platform: string
  accountId: string
  accountName: string
}

export interface SocialPublisherComposerModalsProps {
  loginModalState: LoginModalState
  setLoginModalState: React.Dispatch<React.SetStateAction<LoginModalState>>
  checkSingleAccount: (platform: string, accountId: string) => void
  preflightGateOpen: boolean
  setPreflightGateOpen: (open: boolean) => void
  unreadyAccountsList: any[]
  doSubmit: (
    platforms?: SocialPlatformKey[],
    notes?: string,
    selectAll?: boolean,
    accounts?: any[],
  ) => void
  effectivePlatforms: SocialPlatformKey[]
  notes: string
  selectAllAccounts: boolean
  effectiveAccounts: any[]
  setErrorMessage: (msg: string | null) => void
  featureGateOpen: boolean
  setFeatureGateOpen: (open: boolean) => void
}

export function SocialPublisherComposerModals({
  loginModalState,
  setLoginModalState,
  checkSingleAccount,
  preflightGateOpen,
  setPreflightGateOpen,
  unreadyAccountsList,
  doSubmit,
  effectivePlatforms: _effectivePlatforms,
  notes,
  selectAllAccounts: _selectAllAccounts,
  effectiveAccounts,
  setErrorMessage,
  featureGateOpen,
  setFeatureGateOpen,
}: SocialPublisherComposerModalsProps) {
  return (
    <>
      {loginModalState.open && (
        <SocialPublisherLoginModal
          open={loginModalState.open}
          onOpenChange={open => setLoginModalState(prev => ({ ...prev, open }))}
          platform={loginModalState.platform}
          accountId={loginModalState.accountId}
          accountName={loginModalState.accountName}
          onLoginSuccess={() => {
            setLoginModalState(prev => ({ ...prev, open: false }))
            checkSingleAccount(loginModalState.platform, loginModalState.accountId)
          }}
        />
      )}

      <SocialPreflightGateModal
        open={preflightGateOpen}
        unreadyAccounts={unreadyAccountsList}
        onClose={() => setPreflightGateOpen(false)}
        onOpenLoginModal={(acc) => {
          setPreflightGateOpen(false)
          setLoginModalState({
            open: true,
            platform: acc.platform === 'xhs' ? 'xiaohongshu' : acc.platform || 'gzh',
            accountId: acc.id,
            accountName: acc.name || acc.id,
          })
        }}
        onContinueWithReadyOnly={() => {
          setPreflightGateOpen(false)
          const readyAccounts = effectiveAccounts.filter(
            a => !unreadyAccountsList.some(u => u.id === a.id),
          )
          if (readyAccounts.length > 0) doSubmit(undefined, notes, false, readyAccounts)
          else setErrorMessage('已无就绪账号可供发布，请先完成扫码登录')
        }}
      />

      <ProFeatureGateModal
        open={featureGateOpen}
        onOpenChange={setFeatureGateOpen}
        featureId="social_matrix_concurrency"
        featureTitle="社媒多平台多账号矩阵并发发布"
        description="系统检测到您已勾选多个发布账号。矩阵并发执行将为每个账号创建独立的 AI 调度会话与并发内容生产，属于高级会员专属特权。"
        onConfirmTrial={() => {
          doSubmit()
        }}
      />
    </>
  )
}
