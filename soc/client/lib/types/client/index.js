import { zh, en } from './locales.js';
import { SocialPublisherInputDock } from './views/SocialPublisherInputDock.js';
import { SocialWorkflowTurnTail } from './views/SocialWorkflowTurnTail.js';
import { SocialArticleRightTab, SocialArticleRightTabTitle, SOCIAL_ARTICLE_TAB_ID, } from './views/SocialArticleRightTab.js';
import { SocialCompanionChatTab, SocialCompanionChatTabTitle, CompanionConversationPanel, SOCIAL_COMPANION_CHAT_TAB_ID, } from './views/SocialCompanionChatTab.js';
import { SocialPublisherSection } from './settings/SocialPublisherSection.js';
import { HeroWorkModePillSwitcher } from './views/HeroWorkModePillSwitcher.js';
import { SocialSplitStudioContainer } from './views/SocialSplitStudioContainer.js';
import { SocialPublisherToolView } from './views/SocialPublisherToolView.js';
export const LOCALE_NS = 'socialPublisher';
let globalCtx = null;
export function getGlobalCtx() {
    return globalCtx;
}
/** Injected services required by the Social Publisher Client plugin. */
export const inject = ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs', 'sessions', 'conversation', 'uiWorkspace'];
/**
 * Apply the Social Publisher Web Client plugin.
 */
export function apply(ctx) {
    globalCtx = ctx;
    // 1. 注册多语言字典
    ctx.effect(() => ctx.locale.register(LOCALE_NS, {
        zh,
        en,
        ja: en,
        es: en,
        fr: en,
        de: en,
        ru: en,
        pt: en,
    }), 'ui-social-publisher: dictionaries');
    const t = ctx.locale.bind(LOCALE_NS);
    // 2. 注册设置页 (Settings -> 社媒发布)
    ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'social-publisher',
        order: 85,
        locale: LOCALE_NS,
        label: () => t('nav'),
    }, SocialPublisherSection));
    // 3. 注册对话输入框顶部门户卡片 (Conversation Input Dock)
    ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
        name: 'conversation.input.dock',
        id: 'social-publisher-composer',
        order: 15,
        locale: LOCALE_NS,
        inject: (sessionId) => {
            const actx = ctx.sessions?.scope?.(sessionId);
            const conversation = actx?.get?.('conversation') ?? ctx.conversation;
            return {
                onSendPrompt: async (text) => {
                    if (conversation && typeof conversation.send === 'function') {
                        await conversation.send(text);
                    }
                },
            };
        },
    }, SocialPublisherInputDock));
    // 6. 注册回合消息尾部进度卡片 (Conversation Chat TurnTail)
    ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
        name: 'conversation.chat.turnTail',
        id: 'social-publisher-turn-tail',
        order: 25,
        locale: LOCALE_NS,
    }, SocialWorkflowTurnTail));
    // 7. 注册右侧抽屉文章排版预览 Tab (Sidebar Right Pane Tab & Title)
    ctx.effect(() => ctx.sidebarRightTabs.register({
        id: SOCIAL_ARTICLE_TAB_ID,
        kind: 'social-article',
        title: () => t('tab.articleReview'),
    }), 'ui-social-publisher: sidebar right tab definition');
    ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab',
        key: SOCIAL_ARTICLE_TAB_ID,
        locale: LOCALE_NS,
    }, SocialArticleRightTab));
    ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab.title',
        key: SOCIAL_ARTICLE_TAB_ID,
        locale: LOCALE_NS,
    }, SocialArticleRightTabTitle));
    // 7.1 注册右侧抽屉伴随对话流 Tab (Sidebar Right Companion Chat Tab)
    ctx.effect(() => ctx.sidebarRightTabs.register({
        id: SOCIAL_COMPANION_CHAT_TAB_ID,
        kind: 'social-chat',
        title: () => {
            const snapshot = ctx.sessions?.list?.getSnapshot?.();
            const active = snapshot?.byId
                ? Object.values(snapshot.byId).find((s) => (s.retainedBy?.mainView ?? 0) > 0)
                : undefined;
            return active?.title || '伴随对话';
        },
    }), 'ui-social-publisher: sidebar right companion chat tab definition');
    ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab',
        key: SOCIAL_COMPANION_CHAT_TAB_ID,
        locale: LOCALE_NS,
        children: { 'sidebar.social.companion.chat': { kind: 'single', scope: 'session' } },
    }, SocialCompanionChatTab));
    ctx.slots.inject('sidebar.social.companion.chat', () => ctx.slots.register({
        name: 'sidebar.social.companion.chat',
    }, CompanionConversationPanel));
    ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab.title',
        key: SOCIAL_COMPANION_CHAT_TAB_ID,
        locale: LOCALE_NS,
    }, SocialCompanionChatTabTitle));
    // 8. 注册新会话中央工作模式胶囊药丸切换器 (Hero Work Mode Pill Switcher - 对标图1)
    ctx.slots.inject('conversation.hero.mode.switcher', () => ctx.slots.register({
        name: 'conversation.hero.mode.switcher',
        locale: LOCALE_NS,
    }, HeroWorkModePillSwitcher));
    // 9. 注册全屏分栏主舞台 (Conversation Hero Frame HOC: Left Canvas + Right Chat)
    ctx.slots.inject('conversation.hero.frame', () => ctx.slots.register({
        name: 'conversation.hero.frame',
        id: 'social-split-studio',
        order: 5,
        locale: LOCALE_NS,
    }, SocialSplitStudioContainer));
    // 10. 注册社媒发布流水线工具专属展示视图 (Streamlined Tool Call View)
    ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
        name: 'tool.call.toolview',
        key: 'social_publisher',
        locale: LOCALE_NS,
    }, SocialPublisherToolView));
}
//# sourceMappingURL=index.js.map