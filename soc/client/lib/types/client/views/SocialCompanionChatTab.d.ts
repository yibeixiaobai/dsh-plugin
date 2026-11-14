import { type ReactNode } from 'react';
import type { PropsRuntime, PropsRenderSlots, PropsRenderFactories } from '@winkoo/client-ui-slots';
export declare const SOCIAL_COMPANION_CHAT_TAB_ID = "social-publisher/companion-chat";
export declare const SOCIAL_COMPANION_CHAT_KIND = "social-chat";
export declare const CompanionChatContext: import("react").Context<boolean>;
export declare const useIsCompanionChat: () => boolean;
declare module '@winkoo/client-ui-slots' {
    interface SlotMap {
        'sidebar.social.companion.chat': {
            kind: 'single';
            scope: 'session';
        };
    }
}
export declare function SocialCompanionChatTabTitle(_props: PropsRuntime<'sidebar.right.pane.tab.title'>): ReactNode;
export type CompanionConversationPanelProps = PropsRuntime<'sidebar.social.companion.chat'> & PropsRenderFactories;
export declare function CompanionConversationPanel(props: CompanionConversationPanelProps): ReactNode;
export type SocialCompanionChatTabProps = PropsRuntime<'sidebar.right.pane.tab'> & PropsRenderSlots<'sidebar.social.companion.chat'>;
export declare function SocialCompanionChatTab(props: SocialCompanionChatTabProps): ReactNode;
//# sourceMappingURL=SocialCompanionChatTab.d.ts.map