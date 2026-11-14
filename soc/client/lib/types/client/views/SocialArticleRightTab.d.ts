import { type ReactNode } from 'react';
import type { PropsRuntime, PropsLocale } from '@winkoo/client-ui-slots';
export declare const SOCIAL_ARTICLE_TAB_ID = "social-publisher/article-preview";
/**
 * Tab title chip for the right sidebar social article preview tab.
 *
 * @returns Tab icon and label element.
 */
export declare function SocialArticleRightTabTitle(_props: PropsRuntime<'sidebar.right.pane.tab.title'>): ReactNode;
/**
 * Right sidebar tab for live multi-platform article preview, inspection, and review.
 * Connects directly to active session workflow articles and supports
 * multi-article navigation pills, previous/next cycling, and one-click copy.
 *
 * @param props - Slot runtime and locale props.
 * @returns Right pane preview body.
 */
export declare function SocialArticleRightTab(props: PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<'socialPublisher'>): ReactNode;
//# sourceMappingURL=SocialArticleRightTab.d.ts.map