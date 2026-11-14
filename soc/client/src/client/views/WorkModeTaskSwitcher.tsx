import { memo, useCallback, useState, useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MessageSquarePlus, Share2 } from 'lucide-react'
import type {} from '@winkoo/client-ui-workspace/client'
import { useAppWorkMode, setAppWorkMode } from '../compat/store/workModeStore.js'
import { getGlobalCtx } from '../index.js'
import {
  SocialSidebarViewSwitcher,
  type SocialSidebarView,
} from './SocialSidebarViewSwitcher.js'
import { SocialTypographySidebarPanel } from '../features/core/components/SocialTypographySidebarPanel.js'

export interface WorkModeTaskSwitcherProps {
  readonly wide: boolean
  readonly startSession: (workspaceId?: string) => void
  readonly canStartSession?: boolean
  readonly shortcutKeys?: readonly string[] | undefined
}

/**
 * 任务模式切换与新建控制器 (WorkModeTaskSwitcher)
 * 1:1 对标 wincode 的 WorkModeTaskSwitcher 交互与液态玻璃质感设计：
 * - 通用任务模式：常规对话状态，支持通用自由交互与常规开发
 * - 社媒发布模式：社媒矩阵专属模式，自动展开社媒创作配置卡片
 * - 折叠导轨模式：自适应呈现当前活跃模式图标，点击一键新建对应模式会话
 */
export const WorkModeTaskSwitcher = memo(function WorkModeTaskSwitcher({
  wide,
  startSession,
  canStartSession = true,
  shortcutKeys,
}: WorkModeTaskSwitcherProps): ReactNode {
  const currentMode = useAppWorkMode()
  const isSocialMode = currentMode === 'social'

  const [socialSidebarView, setSocialSidebarView] = useState<SocialSidebarView>(() => {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const saved = window.sessionStorage.getItem('dsh_social_sidebar_view')
      if (saved === 'typography' || saved === 'projects') return saved
    }
    return 'projects'
  })

  const handleSetSocialSidebarView = useCallback((view: SocialSidebarView) => {
    setSocialSidebarView(view)
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        window.sessionStorage.setItem('dsh_social_sidebar_view', view)
      } catch {
        // Ignore storage exceptions
      }
    }
  }, [])

  // 监听画布或外部触发的“打开排版素材库”事件，自动将左侧栏切换至微信排版视图
  useEffect(() => {
    const handleOpenTypography = (): void => {
      if (currentMode !== 'social') {
        setAppWorkMode('social')
      }
      handleSetSocialSidebarView('typography')
    }
    window.addEventListener('wincode:social-open-typography', handleOpenTypography)
    window.addEventListener('dsh:social-open-typography', handleOpenTypography)
    return () => {
      window.removeEventListener('wincode:social-open-typography', handleOpenTypography)
      window.removeEventListener('dsh:social-open-typography', handleOpenTypography)
    }
  }, [currentMode, handleSetSocialSidebarView])

  const [scrollRegionEl, setScrollRegionEl] = useState<HTMLElement | null>(null)

  useEffect(() => {
    if (!isSocialMode || socialSidebarView !== 'typography') {
      setScrollRegionEl(null)
      return
    }
    const findEl = (): HTMLElement | null =>
      document.querySelector<HTMLElement>('[data-sidebar-scrollport]')?.parentElement
      ?? document.querySelector<HTMLElement>('[class*="scrollRegion"]')

    setScrollRegionEl(findEl())
    const timer = setTimeout(() => {
      setScrollRegionEl(findEl())
    }, 100)
    return () => clearTimeout(timer)
  }, [isSocialMode, socialSidebarView, wide])

  const handleSwitchToGeneral = useCallback(() => {
    if (!canStartSession) return
    setAppWorkMode('general')
    startSession()
  }, [canStartSession, startSession])

  const handleSwitchToSocial = useCallback(() => {
    if (!canStartSession) return
    setAppWorkMode('social')
    const ctx = getGlobalCtx()
    if (ctx?.uiWorkspace && typeof ctx.uiWorkspace.startSession === 'function') {
      ctx.uiWorkspace.startSession(undefined, { agentPreset: 'social' })
    } else {
      startSession()
    }
  }, [canStartSession, startSession])

  const shortcutLabel = shortcutKeys && shortcutKeys.length > 0 ? shortcutKeys.join('+') : ''

  // 1. 折叠导轨态（Rail 56px）：遵循决议呈现单图标自适应态
  if (!wide) {
    const tooltipLabel = isSocialMode ? '新建社媒发布' : '新建通用任务'
    return (
      <div style={{ display: 'flex', justifyContent: 'center', width: '100%', margin: '4px 0' }}>
        <button
          type="button"
          aria-label={tooltipLabel}
          title={tooltipLabel}
          onClick={isSocialMode ? handleSwitchToSocial : handleSwitchToGeneral}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            border: isSocialMode
              ? '1px solid rgba(16, 185, 129, 0.4)'
              : '1px solid var(--dsw-alias-border-l3, rgba(0,0,0,0.1))',
            background: isSocialMode
              ? 'rgba(16, 185, 129, 0.15)'
              : 'var(--dsw-alias-button-elevated-fill, rgba(255,255,255,0.8))',
            color: isSocialMode
              ? '#10b981'
              : 'var(--dsw-alias-label-primary, currentColor)',
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {isSocialMode ? <Share2 size={16} /> : <MessageSquarePlus size={16} />}
        </button>
      </div>
    )
  }

  // 2. 宽屏展开态（Wide）：1:1 对标 wincode 50% 雾面半透明液态玻璃分段滑块
  return (
    <>
      <div
        role="group"
        aria-label="任务工作模式切换"
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          width: 'calc(100% - 8px)',
          height: '36px',
          margin: '2px 4px 6px 4px',
          padding: '2px',
          boxSizing: 'border-box',
          borderRadius: '12px',
          border: '1px solid rgba(125, 125, 125, 0.15)',
          background: 'rgba(125, 125, 125, 0.06)',
          backdropFilter: 'blur(16px)',
          userSelect: 'none',
          overflow: 'hidden',
        }}
      >
        {/*
          50% 透明度 iPhone 液态玻璃滑动指示器 (Liquid Glass Sliding Indicator)：
          动效采用 iOS 标志性的 cubic-bezier(0.16, 1, 0.3, 1) 平滑阻尼回弹曲线
        */}
        <div
          aria-hidden="true"
          style={{
            pointerEvents: 'none',
            position: 'absolute',
            top: '2px',
            bottom: '2px',
            left: '2px',
            width: 'calc(50% - 2px)',
            borderRadius: '10px',
            transform: isSocialMode ? 'translateX(100%)' : 'translateX(0)',
            transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.25s ease, border-color 0.25s ease',
            backgroundColor: isSocialMode
              ? 'rgba(16, 185, 129, 0.18)'
              : 'var(--dsw-surface-floating, rgba(255, 255, 255, 0.85))',
            border: isSocialMode
              ? '1px solid rgba(16, 185, 129, 0.35)'
              : '1px solid rgba(255, 255, 255, 0.6)',
            boxShadow: isSocialMode
              ? '0 2px 8px rgba(16, 185, 129, 0.12), inset 0 1px 1.5px rgba(255, 255, 255, 0.6)'
              : '0 2px 8px rgba(0, 0, 0, 0.06), inset 0 1px 1px rgba(255, 255, 255, 0.8)',
          }}
        />

        {/* 1. 通用任务分段按钮 */}
        <button
          type="button"
          onClick={handleSwitchToGeneral}
          title={shortcutLabel ? `切换为通用对话任务 (${shortcutLabel})` : '切换为通用对话任务'}
          style={{
            position: 'relative',
            zIndex: 1,
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            height: '100%',
            padding: '0 8px',
            borderRadius: '10px',
            border: 'none',
            background: 'transparent',
            fontSize: '12px',
            fontWeight: !isSocialMode ? 600 : 500,
            color: !isSocialMode
              ? 'var(--dsw-alias-label-primary, #111827)'
              : 'var(--dsw-alias-label-tertiary, #6b7280)',
            cursor: 'pointer',
            transition: 'color 0.2s ease',
          }}
        >
          <MessageSquarePlus
            size={14}
            style={{
              flexShrink: 0,
              color: !isSocialMode ? 'currentColor' : 'var(--dsw-alias-label-tertiary, #9ca3af)',
            }}
          />
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            通用任务
          </span>
          {shortcutLabel && !isSocialMode && (
            <span
              style={{
                marginLeft: 'auto',
                fontSize: '10px',
                fontWeight: 400,
                opacity: 0.6,
                letterSpacing: '-0.3px',
              }}
            >
              {shortcutLabel}
            </span>
          )}
        </button>

        {/* 2. 社媒发布分段按钮 */}
        <button
          type="button"
          onClick={handleSwitchToSocial}
          title="切换为社媒发布专属模式"
          data-testid="social-publisher-mode-tab"
          style={{
            position: 'relative',
            zIndex: 1,
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            height: '100%',
            padding: '0 8px',
            borderRadius: '10px',
            border: 'none',
            background: 'transparent',
            fontSize: '12px',
            fontWeight: isSocialMode ? 600 : 500,
            color: isSocialMode
              ? '#059669'
              : 'var(--dsw-alias-label-tertiary, #6b7280)',
            cursor: 'pointer',
            transition: 'color 0.2s ease',
          }}
        >
          <Share2
            size={14}
            style={{
              flexShrink: 0,
              color: isSocialMode ? '#10b981' : 'var(--dsw-alias-label-tertiary, #9ca3af)',
            }}
          />
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            社媒发布
          </span>
        </button>
      </div>

      {/* 社媒模式下左侧二级视图控制器：[项目任务] [微信排版] */}
      {isSocialMode && (
        <SocialSidebarViewSwitcher
          appWorkMode={currentMode}
          currentView={socialSidebarView}
          onViewChange={handleSetSocialSidebarView}
        />
      )}

      {/* 当切换至微信排版视图时，平滑覆盖左侧边栏列表区域 */}
      {isSocialMode && socialSidebarView === 'typography' && scrollRegionEl && createPortal(
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 25,
            background: 'var(--dsw-surface-base, #ffffff)',
          }}
        >
          <SocialTypographySidebarPanel />
        </div>,
        scrollRegionEl,
      )}
    </>
  )
})
