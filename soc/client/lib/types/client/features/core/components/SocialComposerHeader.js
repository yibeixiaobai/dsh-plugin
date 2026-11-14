import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { memo } from 'react';
import { isBrandGeoEnabled } from '../../../compat/types.js';
import { Share2, Compass, X, ShieldAlert, ShieldCheck } from 'lucide-react';
import css from '../SocialPublisherComposerCard.module.css';
export const SocialComposerHeader = memo(function SocialComposerHeader({ isDryRun, selectedPlatformsCount, onClose, }) {
    return (_jsxs("div", { className: css.header, children: [_jsxs("div", { className: css.headerLeft, children: [_jsx("div", { className: css.headerIcon, children: _jsx(Share2, { size: 14 }) }), _jsx("span", { className: css.headerTitle, children: "\u793E\u5A92\u591A\u5E73\u53F0\u77E9\u9635\u53D1\u5E03" }), _jsx("span", { className: css.badgeStudio, children: "\u77E9\u9635\u5DE5\u4F5C\u53F0" }), isBrandGeoEnabled() && (_jsxs("button", { type: "button", onClick: () => {
                            window.dispatchEvent(new CustomEvent('wincode:switch-to-geo-card'));
                        }, className: css.geoButton, title: "\u5207\u6362\u81F3\u54C1\u724C GEO \u6536\u5F55\u68C0\u6D4B", children: [_jsx(Compass, { size: 12 }), _jsx("span", { children: "GEO\u68C0\u6D4B" })] }))] }), _jsxs("div", { className: css.headerRight, children: [_jsxs("div", { "data-testid": "composer-dry-run-indicator", className: `${css.dryRunPill} ${isDryRun ? css.dryRunAmber : css.dryRunEmerald}`, title: isDryRun
                            ? '当前为演练模式（免额度推演）。运行模式受全局设置管控，如需切换实盘请前往「设置 - 社媒发布 - 运行环境」修改。'
                            : '当前为实盘模式（真实生产发布）。运行模式受全局设置管控，如需切换演练请前往「设置 - 社媒发布 - 运行环境」修改。', children: [isDryRun ? (_jsx(ShieldAlert, { size: 12, style: { flexShrink: 0 } })) : (_jsx(ShieldCheck, { size: 12, style: { flexShrink: 0 } })), _jsx("span", { children: isDryRun ? '演练模式 (免额度)' : '实盘模式 (已就绪)' })] }), _jsxs("span", { className: css.platformCountLabel, children: ["\u5DF2\u9009 ", _jsx("strong", { children: selectedPlatformsCount }), " \u5E73\u53F0"] }), onClose ? (_jsx("button", { type: "button", className: css.closeBtn, onClick: onClose, title: "\u9000\u51FA\u4E13\u5C5E\u5361\u7247", "aria-label": "\u5173\u95ED", children: _jsx(X, { size: 14 }) })) : null] })] }));
});
//# sourceMappingURL=SocialComposerHeader.js.map