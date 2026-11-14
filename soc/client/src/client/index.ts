/**
 * Social Publisher Web Client Plugin for WinCast.
 * Mounts Social Studio in Main, PanelList rail icon, Input Dock, Turn Tail,
 * Right Sidebar Article Preview, and Settings Section.
 * @module @winkoo/client-ui-social-publisher/client
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@winkoo/client-locale/client'
import type {} from '@winkoo/client-ui-renderer/client'
import type {} from '@winkoo/client-ui-session/client'
import type {} from '@winkoo/client-ui-sidebar/client'
import type {} from '@winkoo/client-ui-sidebar-right/client'
import type {} from '@winkoo/client-ui-conversation/client'
import type {} from '@winkoo/client-ui-settings/client'
import type {} from '@winkoo/api-session-controller/client'
import type { SessionId } from '@winkoo/session/types'
import { zh, en, type SocialPublisherLocaleKey } from './locales.js'
import { SocialPublisherInputDock } from './views/SocialPublisherInputDock.js'
import { SocialWorkflowTurnTail } from './views/SocialWorkflowTurnTail.js'
import {
  SocialArticleRightTab,
  SocialArticleRightTabTitle,
  SOCIAL_ARTICLE_TAB_ID,
} from './views/SocialArticleRightTab.js'
import {
  SocialCompanionChatTab,
  SocialCompanionChatTabTitle,
  CompanionConversationPanel,
  SOCIAL_COMPANION_CHAT_TAB_ID,
} from './views/SocialCompanionChatTab.js'
import { SocialPublisherSection } from './settings/SocialPublisherSection.js'
import { HeroWorkModePillSwitcher } from './views/HeroWorkModePillSwitcher.js'
import { WorkModeTaskSwitcher } from './views/WorkModeTaskSwitcher.js'
import { SocialSplitStudioContainer } from './views/SocialSplitStudioContainer.js'
import { SocialPublisherToolView } from './views/SocialPublisherToolView.js'

export const LOCALE_NS = 'socialPublisher'

import type {} from '@winkoo/client-ui-workspace/client'
import type {} from '@winkoo/client-ui-tool/client'

let globalCtx: Context | null = null

export function getGlobalCtx(): Context | null {
  return globalCtx
}

declare module '@winkoo/client-ui-slots' {
  interface LocaleNamespaceMap {
    socialPublisher: SocialPublisherLocaleKey
  }
}

declare module '@winkoo/client-ui-sidebar-right/client' {
  interface SidebarRightTabParamsMap {
    [SOCIAL_ARTICLE_TAB_ID]: { readonly articleId?: string; readonly platform?: string }
    [SOCIAL_COMPANION_CHAT_TAB_ID]: {}
    'social-chat': {}
    'social-article': { readonly articleId?: string; readonly platform?: string }
  }
}

/** Injected services required by the Social Publisher Client plugin. */
export const inject = ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs', 'sessions', 'conversation', 'uiWorkspace']

/**
 * Apply the Social Publisher Web Client plugin.
 */
export function apply(ctx: Context): void {
  globalCtx = ctx
  // 1. 注册多语言字典
  ctx.effect(
    () =>
      ctx.locale.register(LOCALE_NS, {
        zh,
        en,
        ja: en,
        es: en,
        fr: en,
        de: en,
        ru: en,
        pt: en,
      }),
    'ui-social-publisher: dictionaries',
  )

  const t = ctx.locale.bind(LOCALE_NS)

  // 2. 注册设置页 (Settings -> 社媒发布)
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'social-publisher',
        order: 85,
        locale: LOCALE_NS,
        label: () => t('nav'),
      },
      SocialPublisherSection as any,
    ),
  )

  // 3. 注册对话输入框顶部门户卡片 (Conversation Input Dock)
  ctx.slots.inject('conversation.input.dock', () =>
    ctx.slots.register(
      {
        name: 'conversation.input.dock',
        id: 'social-publisher-composer',
        order: 15,
        locale: LOCALE_NS,
        inject: (sessionId: SessionId) => {
          const actx = ctx.sessions?.scope?.(sessionId)
          const conversation = actx?.get?.('conversation') ?? (ctx as any).conversation
          return {
            onSendPrompt: async (text: string) => {
              if (conversation && typeof conversation.send === 'function') {
                await conversation.send(text)
              }
            },
          }
        },
      },
      SocialPublisherInputDock as any,
    ),
  )

  // 6. 注册回合消息尾部进度卡片 (Conversation Chat TurnTail)
  ctx.slots.inject('conversation.chat.turnTail', () =>
    ctx.slots.register(
      {
        name: 'conversation.chat.turnTail',
        id: 'social-publisher-turn-tail',
        order: 25,
        locale: LOCALE_NS,
      },
      SocialWorkflowTurnTail as any,
    ),
  )

  // 7. 注册右侧抽屉文章排版预览 Tab (Sidebar Right Pane Tab & Title)
  ctx.effect(
    () =>
      ctx.sidebarRightTabs.register({
        id: SOCIAL_ARTICLE_TAB_ID,
        kind: 'social-article',
        title: () => t('tab.articleReview'),
      }),
    'ui-social-publisher: sidebar right tab definition',
  )

  ctx.slots.inject('sidebar.right.pane.tab', () =>
    ctx.slots.register(
      {
        name: 'sidebar.right.pane.tab',
        key: SOCIAL_ARTICLE_TAB_ID,
        locale: LOCALE_NS,
      },
      SocialArticleRightTab as any,
    ),
  )

  ctx.slots.inject('sidebar.right.pane.tab.title', () =>
    ctx.slots.register(
      {
        name: 'sidebar.right.pane.tab.title',
        key: SOCIAL_ARTICLE_TAB_ID,
        locale: LOCALE_NS,
      },
      SocialArticleRightTabTitle as any,
    ),
  )

  // 7.1 注册右侧抽屉伴随对话流 Tab (Sidebar Right Companion Chat Tab)
  ctx.effect(
    () =>
      ctx.sidebarRightTabs.register({
        id: SOCIAL_COMPANION_CHAT_TAB_ID,
        kind: 'social-chat',
        title: () => {
          const snapshot = ctx.sessions?.list?.getSnapshot?.()
          const active = snapshot?.byId
            ? Object.values(snapshot.byId).find((s: any) => (s.retainedBy?.mainView ?? 0) > 0)
            : undefined
          return active?.title || '伴随对话'
        },
      }),
    'ui-social-publisher: sidebar right companion chat tab definition',
  )

  ctx.slots.inject('sidebar.right.pane.tab', () =>
    ctx.slots.register(
      {
        name: 'sidebar.right.pane.tab',
        key: SOCIAL_COMPANION_CHAT_TAB_ID,
        locale: LOCALE_NS,
        children: { 'sidebar.social.companion.chat': { kind: 'single', scope: 'session' } },
      },
      SocialCompanionChatTab as any,
    ),
  )

  ctx.slots.inject('sidebar.social.companion.chat', () =>
    ctx.slots.register(
      {
        name: 'sidebar.social.companion.chat',
      },
      CompanionConversationPanel as any,
    ),
  )

  ctx.slots.inject('sidebar.right.pane.tab.title', () =>
    ctx.slots.register(
      {
        name: 'sidebar.right.pane.tab.title',
        key: SOCIAL_COMPANION_CHAT_TAB_ID,
        locale: LOCALE_NS,
      },
      SocialCompanionChatTabTitle as any,
    ),
  )

  // 8. 注册新会话中央工作模式胶囊药丸切换器 (Hero Work Mode Pill Switcher - 对标图1)
  ctx.slots.inject('conversation.hero.mode.switcher' as any, () =>
    ctx.slots.register(
      {
        name: 'conversation.hero.mode.switcher' as any,
        locale: LOCALE_NS,
      },
      HeroWorkModePillSwitcher as any,
    ),
  )

  // 9. 注册全屏分栏主舞台 (Conversation Hero Frame HOC: Left Canvas + Right Chat)
  ctx.slots.inject('conversation.hero.frame', () =>
    ctx.slots.register(
      {
        name: 'conversation.hero.frame',
        id: 'social-split-studio',
        order: 5,
        locale: LOCALE_NS,
      },
      SocialSplitStudioContainer as any,
    ),
  )

  // 10. 注册社媒发布流水线工具专属展示视图 (Streamlined Tool Call View)
  ctx.slots.inject('tool.call.toolview', () =>
    ctx.slots.register(
      {
        name: 'tool.call.toolview',
        key: 'social_publisher',
        locale: LOCALE_NS,
      },
      SocialPublisherToolView as any,
    ),
  )
}
