import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { memo, useEffect } from 'react';
import { Folder, Layers } from 'lucide-react';
import css from './SocialSidebarViewSwitcher.module.css';
/**
 * Social sidebar sub-view switcher component.
 * Provides seamless two-way switching between "项目任务" (session task list)
 * and "微信排版" (typography template library) in social media mode.
 *
 * @param props - Component props containing mode, current view and change handler.
 * @returns Segmented control element or null when not in social mode.
 */
export const SocialSidebarViewSwitcher = memo(function SocialSidebarViewSwitcher({ appWorkMode, currentView, onViewChange, }) {
    // Listen for canvas or external triggers asking to open the typography panel
    useEffect(() => {
        const handleOpenTypography = () => {
            onViewChange('typography');
        };
        window.addEventListener('wincode:social-open-typography', handleOpenTypography);
        window.addEventListener('dsh:social-open-typography', handleOpenTypography);
        return () => {
            window.removeEventListener('wincode:social-open-typography', handleOpenTypography);
            window.removeEventListener('dsh:social-open-typography', handleOpenTypography);
        };
    }, [onViewChange]);
    if (appWorkMode !== 'social') {
        return null;
    }
    return (_jsx("div", { className: css.switcherRoot, role: "tablist", "aria-label": "\u793E\u5A92\u4FA7\u8FB9\u680F\u89C6\u56FE\u5207\u6362", children: _jsxs("div", { className: css.segmentedBox, children: [_jsxs("button", { type: "button", role: "tab", "aria-selected": currentView === 'projects', onClick: () => onViewChange('projects'), className: `${css.segmentBtn} ${currentView === 'projects' ? css.segmentBtnActive : ''}`, title: "\u5207\u6362\u81F3\u793E\u5A92\u53D1\u5E03\u4EFB\u52A1\u4E0E\u4F1A\u8BDD\u5217\u8868", children: [_jsx(Folder, { className: css.icon }), _jsx("span", { children: "\u9879\u76EE\u4EFB\u52A1" })] }), _jsxs("button", { type: "button", role: "tab", "aria-selected": currentView === 'typography', onClick: () => onViewChange('typography'), className: `${css.segmentBtn} ${currentView === 'typography' ? css.segmentBtnActive : ''}`, title: "\u5207\u6362\u81F3\u5FAE\u4FE1\u6392\u7248\u7248\u5F0F\u7EC4\u4EF6\u5E93", children: [_jsx(Layers, { className: css.icon }), _jsx("span", { children: "\u5FAE\u4FE1\u6392\u7248" })] })] }) }));
});
//# sourceMappingURL=SocialSidebarViewSwitcher.js.map