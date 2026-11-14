import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import type { PropsRuntime, PropsRenderSlots, PropsRenderFactories } from '@winkoo/client-ui-slots'
import type { ConversationViewsProps } from '@winkoo/client-ui-conversation/client'
import { getGlobalCtx } from '../index.js'

export const SOCIAL_COMPANION_CHAT_TAB_ID = 'social-publisher/companion-chat'
export const SOCIAL_COMPANION_CHAT_KIND = 'social-chat'

export const CompanionChatContext = createContext<boolean>(false)
export const useIsCompanionChat = (): boolean => useContext(CompanionChatContext)

declare module '@winkoo/client-ui-slots' {
  interface SlotMap {
    'sidebar.social.companion.chat': { kind: 'single'; scope: 'session' }
  }
}

const EMPTY_SESSION_LIST_SNAPSHOT: { byId: Record<string, any> } = { byId: {} }

export function SocialCompanionChatTabTitle(_props: PropsRuntime<'sidebar.right.pane.tab.title'>): ReactNode {
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

  const title = (activeSessionId && sessionListSnapshot?.byId?.[activeSessionId as any]?.title) || '伴随对话'

  return <span>{title}</span>
}

function FixedChatConversationView(props: ConversationViewsProps) {
  return <>{props.renderSlot('conversation.session', { view: 'chat' })}</>
}

export type CompanionConversationPanelProps = PropsRuntime<'sidebar.social.companion.chat'> & PropsRenderFactories

export function CompanionConversationPanel(props: CompanionConversationPanelProps): ReactNode {
  const { renderFactorySlot } = props
  if (typeof renderFactorySlot !== 'function') return null
  return (
    <CompanionChatContext.Provider value={true}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          height: '100%',
          width: '100%',
          minHeight: 0,
          minWidth: 0,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {renderFactorySlot('conversation.content', { variant: 'embedded', phase: 'active', hero: false }, {
          slots: { views: FixedChatConversationView },
        })}
      </div>
    </CompanionChatContext.Provider>
  )
}

export type SocialCompanionChatTabProps = PropsRuntime<'sidebar.right.pane.tab'> &
  PropsRenderSlots<'sidebar.social.companion.chat'>

export function SocialCompanionChatTab(props: SocialCompanionChatTabProps): ReactNode {
  const { renderSlot } = props
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        minHeight: 0,
        minWidth: 0,
        overflow: 'hidden',
        background: 'var(--dsw-alias-bg-base, #ffffff)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          height: '100%',
          width: '100%',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {renderSlot('sidebar.social.companion.chat', {})}
      </div>
    </div>
  )
}
