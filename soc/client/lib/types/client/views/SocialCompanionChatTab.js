import { jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import { getGlobalCtx } from '../index.js';
export const SOCIAL_COMPANION_CHAT_TAB_ID = 'social-publisher/companion-chat';
export const SOCIAL_COMPANION_CHAT_KIND = 'social-chat';
export const CompanionChatContext = createContext(false);
export const useIsCompanionChat = () => useContext(CompanionChatContext);
const EMPTY_SESSION_LIST_SNAPSHOT = { byId: {} };
export function SocialCompanionChatTabTitle(_props) {
    const ctx = getGlobalCtx();
    const listStore = ctx?.sessions?.list;
    const sessionListSnapshot = useSyncExternalStore(cb => listStore?.subscribe?.(cb) ?? (() => { }), () => listStore?.getSnapshot?.() ?? EMPTY_SESSION_LIST_SNAPSHOT);
    const activeSessionId = useMemo(() => {
        if (!sessionListSnapshot?.byId)
            return undefined;
        const active = Object.values(sessionListSnapshot.byId).find((s) => (s.retainedBy?.mainView ?? 0) > 0);
        return active?.id;
    }, [sessionListSnapshot]);
    const title = (activeSessionId && sessionListSnapshot?.byId?.[activeSessionId]?.title) || '伴随对话';
    return _jsx("span", { children: title });
}
function FixedChatConversationView(props) {
    return _jsx(_Fragment, { children: props.renderSlot('conversation.session', { view: 'chat' }) });
}
export function CompanionConversationPanel(props) {
    const { renderFactorySlot } = props;
    if (typeof renderFactorySlot !== 'function')
        return null;
    return (_jsx(CompanionChatContext.Provider, { value: true, children: _jsx("div", { style: {
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                height: '100%',
                width: '100%',
                minHeight: 0,
                minWidth: 0,
                overflow: 'hidden',
                position: 'relative',
            }, children: renderFactorySlot('conversation.content', { variant: 'embedded', phase: 'active', hero: false }, {
                slots: { views: FixedChatConversationView },
            }) }) }));
}
export function SocialCompanionChatTab(props) {
    const { renderSlot } = props;
    return (_jsx("div", { style: {
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            width: '100%',
            minHeight: 0,
            minWidth: 0,
            overflow: 'hidden',
            background: 'var(--dsw-alias-bg-base, #ffffff)',
        }, children: _jsx("div", { style: {
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                minHeight: 0,
                minWidth: 0,
                height: '100%',
                width: '100%',
                position: 'relative',
                overflow: 'hidden',
            }, children: renderSlot('sidebar.social.companion.chat', {}) }) }));
}
//# sourceMappingURL=SocialCompanionChatTab.js.map