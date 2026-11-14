import { useState, type ReactNode } from 'react'
import type { PropsRuntime, PropsLocale } from '@winkoo/client-ui-slots'
import { SocialSchedulePlanView } from '../features/plan/SocialSchedulePlanView.js'
import { SocialStudioLayout } from '../features/studio/SocialStudioLayout.js'
import { SocialPublisherSection } from '../settings/SocialPublisherSection.js'
import { LayoutPanelLeft, Calendar, Settings as SettingsIcon } from 'lucide-react'

export type SocialStudioMainPanelProps = PropsRuntime<'main'> & PropsLocale<'socialPublisher'>

export function SocialStudioMainPanel(props: SocialStudioMainPanelProps): ReactNode {
  const { t } = props
  const [activeTab, setActiveTab] = useState<'studio' | 'schedule' | 'settings'>('studio')

  // 空工作流占位状态，用户可通过聊天会话指令激活或在调度视图管理现有草稿
  const defaultWorkflow: any = {
    v: 1,
    stage: 'idle',
    platform: 'gzh',
    topics: [],
    articles: [],
    step: { id: 'idle', label: '就绪', progress: 0 },
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        background: 'var(--dsw-surface-base, #ffffff)',
        color: 'var(--dsw-text-primary, #111827)',
      }}
    >
      {/* 顶部主工作台导航条 */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          borderBottom: '1px solid var(--dsw-border-subtle, rgba(0,0,0,0.08))',
          background: 'var(--dsw-surface-panel, #fafafa)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '15px', fontWeight: 600 }}>{t('panel.title')}</span>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '12px',
              background: 'var(--dsw-primary-subtle, rgba(59,130,246,0.1))',
              color: 'var(--dsw-primary-text, #2563eb)',
              fontWeight: 500,
            }}
          >
            WinCode 深度矩阵版
          </span>
        </div>

        {/* 视图切换 Tabs */}
        <div
          style={{
            display: 'inline-flex',
            gap: '4px',
            padding: '2px',
            borderRadius: '8px',
            background: 'var(--dsw-surface-subtle, rgba(0,0,0,0.05))',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('studio')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              fontSize: '12px',
              fontWeight: activeTab === 'studio' ? 600 : 400,
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'studio' ? 'var(--dsw-surface-base, #fff)' : 'transparent',
              color: activeTab === 'studio' ? 'var(--dsw-text-primary, #000)' : 'var(--dsw-text-secondary, #666)',
              boxShadow: activeTab === 'studio' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            <LayoutPanelLeft size={14} />
            <span>{t('tab.studio')}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('schedule')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              fontSize: '12px',
              fontWeight: activeTab === 'schedule' ? 600 : 400,
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'schedule' ? 'var(--dsw-surface-base, #fff)' : 'transparent',
              color: activeTab === 'schedule' ? 'var(--dsw-text-primary, #000)' : 'var(--dsw-text-secondary, #666)',
              boxShadow: activeTab === 'schedule' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            <Calendar size={14} />
            <span>{t('tab.schedule')}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              fontSize: '12px',
              fontWeight: activeTab === 'settings' ? 600 : 400,
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'settings' ? 'var(--dsw-surface-base, #fff)' : 'transparent',
              color: activeTab === 'settings' ? 'var(--dsw-text-primary, #000)' : 'var(--dsw-text-secondary, #666)',
              boxShadow: activeTab === 'settings' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            <SettingsIcon size={14} />
            <span>{t('tab.settings')}</span>
          </button>
        </div>
      </header>

      {/* 主面板内容 */}
      <main style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
        {activeTab === 'studio' && (
          <SocialStudioLayout
            workflow={defaultWorkflow}
            workspacePath=""
            sessionId=""
          />
        )}
        {activeTab === 'schedule' && (
          <div style={{ height: '100%', overflowY: 'auto' }}>
            <SocialSchedulePlanView />
          </div>
        )}
        {activeTab === 'settings' && (
          <div style={{ height: '100%', overflowY: 'auto', padding: '16px' }}>
            <SocialPublisherSection />
          </div>
        )}
      </main>
    </div>
  )
}
