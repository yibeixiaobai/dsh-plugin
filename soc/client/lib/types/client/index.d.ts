/**
 * Social Publisher Web Client Plugin for WinCast.
 * Mounts Social Studio in Main, PanelList rail icon, Input Dock, Turn Tail,
 * Right Sidebar Article Preview, and Settings Section.
 * @module @winkoo/client-ui-social-publisher/client
 */
import type { Context } from '@deepseek-ai/cordis';
import { type SocialPublisherLocaleKey } from './locales.js';
import { SOCIAL_ARTICLE_TAB_ID } from './views/SocialArticleRightTab.js';
import { SOCIAL_COMPANION_CHAT_TAB_ID } from './views/SocialCompanionChatTab.js';
export declare const LOCALE_NS = "socialPublisher";
export declare function getGlobalCtx(): Context | null;
declare module '@winkoo/client-ui-slots' {
    interface LocaleNamespaceMap {
        socialPublisher: SocialPublisherLocaleKey;
    }
}
declare module '@winkoo/client-ui-sidebar-right/client' {
    interface SidebarRightTabParamsMap {
        [SOCIAL_ARTICLE_TAB_ID]: {
            readonly articleId?: string;
            readonly platform?: string;
        };
        [SOCIAL_COMPANION_CHAT_TAB_ID]: {};
        'social-chat': {};
        'social-article': {
            readonly articleId?: string;
            readonly platform?: string;
        };
    }
}
/** Injected services required by the Social Publisher Client plugin. */
export declare const inject: string[];
/**
 * Apply the Social Publisher Web Client plugin.
 */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map