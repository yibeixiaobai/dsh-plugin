import { useState, useMemo, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react'
import type { HeroFrameOwnerProps } from '@winkoo/client-ui-conversation/client'
import { useAppWorkMode } from '../compat/store/workModeStore.js'
import { useSocialWorkflow } from '../features/core/useSocialWorkflow.js'
import { SocialStudioCanvas } from '../features/studio/SocialStudioCanvas.js'
import { getGlobalCtx } from '../index.js'
import { SOCIAL_COMPANION_CHAT_KIND, useIsCompanionChat } from './SocialCompanionChatTab.js'
import { LayoutPanelLeft } from 'lucide-react'
import css from './SocialSplitStudioContainer.module.css'

export type SocialSplitStudioContainerProps = HeroFrameOwnerProps & {
  children: ReactNode
}

/**
 * 社媒发布模式原生三栏工作台中央画布容器 (Social Studio Fullscreen Canvas Container)
 *
 * 【中文架构规范】：
 * 1. 任务提交前（空会话 Hero 态）或未产出文章时：纯净透传原版正文，不干扰居中大卡片与初始对话流；
 * 2. 处于右侧边栏伴随抽屉内时（isCompanionChat === true）：纯净透传会话流，严防嵌套画布递归；
 * 3. 任务执行与产物生成后（articles.length > 0）：
 *    - 中央主视口 (100% 满宽)：SocialStudioCanvas 高保真排版与审校画布，去除冗余外层绿头，直接与原生会话头紧密衔接；
 *    - 右侧伴随区域：全面委派至系统原生右侧抽屉 (sidebar.right / social-chat Tab) 承载；
 *    - 底部对话流：在中央以隐藏方式保活（display: none），保证订阅与草稿状态不丢失。
 */
const EMPTY_SESSION_LIST_SNAPSHOT: { byId: Record<string, any> } = { byId: {} }

export function SocialSplitStudioContainer(props: SocialSplitStudioContainerProps): ReactNode {
  const { children, hero } = props
  const isCompanionChat = useIsCompanionChat()
  const mode = useAppWorkMode()

  // 从 globalCtx 中响应式获取当前主会话 ID 与工作区路径
  const ctx = getGlobalCtx()
  const listStore = ctx?.sessions?.list
  const sessionListSnapshot = useSyncExternalStore(
    cb => listStore?.subscribe?.(cb) ?? (() => {}),
    () => listStore?.getSnapshot?.() ?? EMPTY_SESSION_LIST_SNAPSHOT,
  )
  const activeSessionId = useMemo(() => {
    if (!sessionListSnapshot?.byId) return undefined
    const active: any = Object.values(sessionListSnapshot.byId).find(
      (s: any) => (s.retainedBy?.mainView ?? 0) > 0,
    )
    return active?.id as string | undefined
  }, [sessionListSnapshot])

  const activeSession = activeSessionId ? sessionListSnapshot?.byId?.[activeSessionId as any] : undefined
  const isSocialSession =
    (activeSession as any)?.projectionValues?.agentPreset === 'social' ||
    (activeSession as any)?.agentPreset === 'social'

  const cwd = sessionListSnapshot?.byId?.[activeSessionId as any]?.cwd || ''

  const { workflow, hasArticles } = useSocialWorkflow(activeSessionId)
  const isSocial = mode === 'social' || isSocialSession || hasArticles
  const [viewMode, setViewMode] = useState<'canvas' | 'dismissed'>('canvas')

  // 当工作流首度产出文章或切回带产物的社媒会话时，自动向原生右栏发送打开伴随对话请求
  const openedSidebarRef = useRef(false)
  useEffect(() => {
    if (isSocial && hasArticles && !openedSidebarRef.current && activeSessionId && ctx?.sidebarRight) {
      openedSidebarRef.current = true
      try {
        ctx.sidebarRight.openTabIn?.(activeSessionId as any, SOCIAL_COMPANION_CHAT_KIND)
      } catch {
        try {
          ctx.sidebarRight.openTab?.(SOCIAL_COMPANION_CHAT_KIND)
        } catch {}
      }
    }
  }, [isSocial, hasArticles, activeSessionId, ctx])

  // 会话切换时重置打开标志
  useEffect(() => {
    openedSidebarRef.current = false
    setViewMode('canvas')
  }, [activeSessionId])

  // 伴随抽屉内部、非社媒模式、或处于空会话 Hero 态、或工作流尚未产出文章时，纯净透传原版正文
  if (isCompanionChat || !isSocial || hero || !hasArticles) {
    return <>{children}</>
  }

  // 若用户临时手动切回纯对话流，在右上角提供重新打开微标，不破坏对话流
  if (viewMode === 'dismissed') {
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
        {children}
        <button
          type="button"
          onClick={() => setViewMode('canvas')}
          style={{
            position: 'absolute',
            top: '56px',
            right: '24px',
            zIndex: 50,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            borderRadius: '20px',
            background: 'var(--dsw-alias-bg-base, #ffffff)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            color: '#059669',
            fontSize: '12px',
            fontWeight: 600,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.12)',
            cursor: 'pointer',
            transition: 'all 0.18s ease',
          }}
          title="重新打开社媒排版与审校画布"
        >
          <LayoutPanelLeft size={14} />
          <span>打开排版画布 ({workflow.articles.length}篇)</span>
        </button>
      </div>
    )
  }

  return (
    <div className={css.container} data-testid="social-split-studio-container">
      {/* 分栏主体区域：中央 100% 满宽排版画布 */}
      <div className={css.body}>
        <div className={css.canvasPaneFull}>
          <SocialStudioCanvas
            workflow={workflow}
            workspacePath={cwd}
            sessionId={activeSessionId}
          />
        </div>

        {/* 伴随式会话流以隐藏状态保活，确保输入框与底层事件订阅生命周期不丢失 */}
        <div style={{ display: 'none' }} aria-hidden="true">
          {children}
        </div>
      </div>
    </div>
  )
}
