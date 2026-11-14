import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { memo, useCallback } from 'react';
import { Sparkles, Share2 } from 'lucide-react';
import { useAppWorkMode, setAppWorkMode } from '../compat/store/workModeStore.js';
import css from './HeroWorkModePillSwitcher.module.css';
/**
 * 新会话中央模式胶囊药丸切换器 (HeroWorkModePillSwitcher)
 * 1:1 对标用户参考设计图1：
 * 位于中央标语正下方、卡片/输入框上方，提供圆角药丸分段选择：
 * - 通用任务：常规对话状态，支持通用自由交互与常规开发
 * - 社媒发布：社媒矩阵专属模式，展开多平台矩阵工作台大卡片
 */
export const HeroWorkModePillSwitcher = memo(function HeroWorkModePillSwitcher({ className, }) {
    const currentMode = useAppWorkMode();
    const isSocial = currentMode === 'social';
    const handleSelectGeneral = useCallback(() => {
        setAppWorkMode('general');
    }, []);
    const handleSelectSocial = useCallback(() => {
        setAppWorkMode('social');
    }, []);
    return (_jsxs("div", { className: className ? `${css.pillContainer} ${className}` : css.pillContainer, role: "tablist", "aria-label": "\u5DE5\u4F5C\u6A21\u5F0F\u5207\u6362", children: [_jsxs("button", { type: "button", role: "tab", "aria-selected": !isSocial, className: `${css.pillItem} ${!isSocial ? css.active : ''}`, onClick: handleSelectGeneral, children: [_jsx(Sparkles, { size: 14, className: css.pillIcon }), _jsx("span", { children: "\u901A\u7528\u4EFB\u52A1" })] }), _jsxs("button", { type: "button", role: "tab", "aria-selected": isSocial, className: `${css.pillItem} ${isSocial ? css.active : ''}`, onClick: handleSelectSocial, children: [_jsx(Share2, { size: 14, className: css.pillIcon }), _jsx("span", { children: "\u793E\u5A92\u53D1\u5E03" })] })] }));
});
//# sourceMappingURL=HeroWorkModePillSwitcher.js.map