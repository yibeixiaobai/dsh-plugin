import { type ReactNode } from 'react';
export type SocialSidebarView = 'projects' | 'typography';
export interface SocialSidebarViewSwitcherProps {
    /** Current app work mode, e.g. 'general' or 'social'. */
    readonly appWorkMode: string;
    /** Active sub-view in social mode: 'projects' for sessions/tasks, 'typography' for WeChat templates. */
    readonly currentView: SocialSidebarView;
    /** Callback invoked when the user selects a sub-view. */
    readonly onViewChange: (view: SocialSidebarView) => void;
}
/**
 * Social sidebar sub-view switcher component.
 * Provides seamless two-way switching between "项目任务" (session task list)
 * and "微信排版" (typography template library) in social media mode.
 *
 * @param props - Component props containing mode, current view and change handler.
 * @returns Segmented control element or null when not in social mode.
 */
export declare const SocialSidebarViewSwitcher: import("react").MemoExoticComponent<({ appWorkMode, currentView, onViewChange, }: SocialSidebarViewSwitcherProps) => ReactNode>;
//# sourceMappingURL=SocialSidebarViewSwitcher.d.ts.map