import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ImageIcon } from "lucide-react";
/**
 * 配图生成进度指示槽
 * 【中文修复依据】：彻底移除 Sparkles 与旋转星芒动效，改为出版软件专业低噪的线性微进度槽
 */
export function ImageProgressBanner({ imageProgress }) {
    const pct = Math.round(imageProgress.percentage);
    return (_jsxs("div", { "data-testid": "studio-image-progress-banner", className: "flex items-center gap-3 px-4 py-1.5 bg-surface/30 border-b border-border/30 shrink-0 text-ui-2xs text-foreground-muted", children: [_jsxs("div", { className: "flex items-center gap-1.5 shrink-0 font-medium", children: [_jsx(ImageIcon, { className: "size-3 text-foreground-muted" }), _jsx("span", { children: "\u914D\u56FE\u6E32\u67D3\u4E2D" })] }), _jsxs("div", { className: "flex-1 min-w-0 flex items-center gap-2", children: [_jsx("div", { className: "flex-1 h-1 rounded-full bg-border/40 overflow-hidden", children: _jsx("div", { className: "h-full rounded-full bg-primary/70 transition-all duration-500 ease-out", style: { width: `${pct}%` } }) }), _jsxs("span", { className: "font-mono tabular-nums shrink-0 text-[11px]", children: [imageProgress.current, "/", imageProgress.total, " (", pct, "%)"] })] }), imageProgress.currentArticleIndex > 0 && (_jsxs("span", { className: "font-mono shrink-0 text-[11px]", children: ["\u7BC7\u76EE #", imageProgress.currentArticleIndex] }))] }));
}
//# sourceMappingURL=ImageProgressBanner.js.map