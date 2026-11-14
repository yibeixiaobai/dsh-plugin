import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Input } from "../compat/components/ui/input.js";
import { Switch } from "../compat/components/ui/switch.js";
import { Sparkles, Sliders, Info, Search, Image as ImageIcon, Languages } from "lucide-react";
import { COVER_RATIOS, SECONDARY_COVER_RATIOS } from "./SocialPublisherTypes.js";
import { SocialPublisherUnifiedModelStatusCard } from "./SocialPublisherUnifiedModelStatusCard.js";
import { cn } from "../compat/components/lib/utils.js";
/** 社媒正文与封面配图设置子面板：支持自适应与自定义配比，多平台规格适配 */
export function SocialPublisherContentImageSettings({ currentAccount, updateCurrentAccount, isZhihu, isXhs, isBaijiahao, isToutiao, }) {
    const content = currentAccount?.content || {};
    // 配图模式：默认为 auto（AI 智能自适应）
    const imageMode = (content.image_count_mode || "auto");
    const aiImageCount = Math.max(0, Math.min(4, Number(content.ai_images_per_article ?? 1)));
    const searchImageCount = Math.max(0, Math.min(4, Number(content.search_images_per_article ?? 1)));
    const totalContentImages = aiImageCount + searchImageCount;
    // 小红书模式下的卡片配比
    const xhsImageMode = (content.xhs_image_count_mode || "auto");
    const xhsAiCount = Math.max(1, Math.min(18, Number(content.xhs_ai_images_per_note ?? 3)));
    const xhsSearchCount = Math.max(0, Math.min(18, Number(content.xhs_search_images_per_note ?? 1)));
    const xhsTotalCards = xhsAiCount + xhsSearchCount;
    const handleModeChange = (mode) => {
        if (isXhs) {
            updateCurrentAccount({
                content: {
                    ...content,
                    xhs_image_count_mode: mode,
                    ...(mode === "custom"
                        ? {
                            xhs_ai_images_per_note: xhsAiCount,
                            xhs_search_images_per_note: xhsSearchCount,
                            xhs_images_per_note: xhsTotalCards,
                        }
                        : {}),
                },
            });
        }
        else {
            updateCurrentAccount({
                content: {
                    ...content,
                    image_count_mode: mode,
                    ...(mode === "custom"
                        ? {
                            ai_images_per_article: aiImageCount,
                            search_images_per_article: searchImageCount,
                            content_images_per_article: totalContentImages,
                        }
                        : {}),
                },
            });
        }
    };
    const handleUpdateCounts = (ai, search) => {
        const validAi = Math.max(0, Math.min(4, Math.floor(ai)));
        const validSearch = Math.max(0, Math.min(4, Math.floor(search)));
        const sum = validAi + validSearch;
        updateCurrentAccount({
            content: {
                ...content,
                image_count_mode: "custom",
                ai_images_per_article: validAi,
                search_images_per_article: validSearch,
                content_images_per_article: sum,
            },
        });
    };
    const handleUpdateXhsCounts = (ai, search) => {
        const validAi = Math.max(1, Math.min(18, Math.floor(ai)));
        const validSearch = Math.max(0, Math.min(18, Math.floor(search)));
        const sum = validAi + validSearch;
        updateCurrentAccount({
            content: {
                ...content,
                xhs_image_count_mode: "custom",
                xhs_ai_images_per_note: validAi,
                xhs_search_images_per_note: validSearch,
                xhs_images_per_note: sum,
            },
        });
    };
    const isGzh = !isXhs && !isZhihu && !isBaijiahao && !isToutiao;
    const currentMode = isXhs ? xhsImageMode : imageMode;
    return (_jsxs("div", { className: "space-y-4", "data-testid": "social-publisher-image-settings", children: [_jsx(SocialPublisherUnifiedModelStatusCard, {}), isXhs ? (_jsxs("div", { className: "flex items-start gap-3 rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-3.5 text-ui-xs text-foreground leading-relaxed", children: [_jsx(Info, { className: "size-4.5 text-rose-500 shrink-0 mt-0.5" }), _jsxs("div", { className: "space-y-1", children: [_jsx("span", { className: "font-semibold text-rose-600 dark:text-rose-400", children: "\u5C0F\u7EA2\u4E66\u8F6E\u64AD\u56FE\u89C4\u683C" }), _jsx("p", { className: "text-foreground-subtle", children: "\u5C0F\u7EA2\u4E66\u7B14\u8BB0\u56FA\u5B9A\u4E3A 3:4 \u7AD6\u7248\u5C3A\u5BF8 (1080\u00D71440 px)\u3002\u9996\u5F20\u5361\u7247\u4F5C\u4E3A\u5C01\u9762\uFF0C\u652F\u6301 AI \u7A3F\u5B9A\u5927\u5B57\u62A5\u6392\u7248\u5361\u7247\u4E0E\u771F\u5B9E\u7F51\u7EDC\u5B9E\u666F\u63D2\u56FE\u6DF7\u6392\u3002" })] })] })) : isGzh ? (_jsxs("div", { className: "rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3.5 text-ui-xs text-foreground leading-relaxed", children: ["\u5F53\u524D\u5C01\u9762\u5C3A\u5BF8\uFF1A\u5934\u6761", " ", _jsx("strong", { className: "font-semibold", children: content.headline_cover_ratio || "2.35:1" }), " \u00B7 \u6B21\u6761 ", _jsx("strong", { className: "font-semibold", children: content.secondary_cover_ratio || "1:1" }), "\uFF1B\u4E0B\u6B21\u751F\u56FE\u6309\u6B64\u6BD4\u4F8B\u751F\u6210\u3002"] })) : (_jsxs("div", { className: "flex items-start gap-3 rounded-xl border border-sky-500/20 bg-sky-500/[0.04] p-3.5 text-ui-xs text-foreground leading-relaxed", children: [_jsx(Info, { className: "size-4.5 text-sky-500 shrink-0 mt-0.5" }), _jsxs("div", { className: "space-y-1", children: [_jsxs("span", { className: "font-semibold text-sky-600 dark:text-sky-400", children: [isZhihu ? "知乎专栏" : isBaijiahao ? "百家号" : "头条号", " \u5C01\u9762\u4E0E\u6B63\u6587\u89C4\u683C"] }), _jsx("p", { className: "text-foreground-subtle", children: "\u5C01\u9762\u6BD4\u4F8B\u7EDF\u4E00\u673A\u5668\u81EA\u52A8\u9002\u914D\uFF08\u77E5\u4E4E/\u5934\u6761 16:9\uFF0C\u767E\u5BB6\u53F7 2.35:1\uFF09\uFF0C\u6B63\u6587\u63D2\u56FE\u7531\u4E0B\u65B9\u914D\u56FE\u89C4\u5219\u667A\u80FD\u751F\u6210\u3002" })] })] })), isGzh && (_jsxs("div", { className: "grid gap-4 sm:grid-cols-2 rounded-xl border border-border/80 bg-surface/50 p-4", children: [_jsxs("label", { className: "space-y-1.5 text-ui-sm text-foreground", children: [_jsx("span", { className: "font-medium text-ui-xs text-foreground-subtle", children: "\u5934\u6761\u5C01\u9762\u6BD4\u4F8B" }), _jsx("select", { className: "h-9 w-full rounded-lg border border-border bg-background px-3 text-ui-xs text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-primary", value: content.headline_cover_ratio || "2.35:1", onChange: (e) => updateCurrentAccount({
                                    content: { ...content, headline_cover_ratio: e.target.value },
                                }), children: COVER_RATIOS.map((r) => (_jsx("option", { value: r.value, children: r.label }, r.value))) })] }), _jsxs("label", { className: "space-y-1.5 text-ui-sm text-foreground", children: [_jsx("span", { className: "font-medium text-ui-xs text-foreground-subtle", children: "\u6B21\u6761\u5C01\u9762\u6BD4\u4F8B (\u6B21\u6761\u4E0D\u652F\u6301 2.35:1)" }), _jsx("select", { className: "h-9 w-full rounded-lg border border-border bg-background px-3 text-ui-xs text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-primary", value: content.secondary_cover_ratio || "1:1", onChange: (e) => updateCurrentAccount({
                                    content: { ...content, secondary_cover_ratio: e.target.value },
                                }), children: SECONDARY_COVER_RATIOS.map((r) => (_jsx("option", { value: r.value, children: r.label }, r.value))) })] })] })), _jsxs("div", { className: "rounded-xl border border-border/80 bg-surface/50 p-4 space-y-4", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "space-y-0.5", children: [_jsx("h4", { className: "text-ui-sm font-semibold text-foreground flex items-center gap-1.5", children: _jsx("span", { children: isXhs ? "小红书卡片配图生成策略" : "正文插图生成与搜图策略" }) }), _jsx("p", { className: "text-ui-xs text-foreground-subtle", children: "\u652F\u6301 AI \u667A\u80FD\u81EA\u9002\u5E94\u914D\u56FE\uFF0C\u6216\u81EA\u5B9A\u4E49\u7CBE\u7EC6\u6307\u5B9A AI \u751F\u56FE\u4E0E\u771F\u5B9E\u7F51\u7EDC\u641C\u56FE\u6570\u91CF" })] }), _jsx("span", { className: "text-ui-2xs font-mono font-semibold px-2 py-0.5 rounded border border-primary/30 text-primary bg-primary/[0.06]", children: currentMode === "auto" ? "智能自适应" : "自定义配比" })] }), _jsxs("div", { className: "grid gap-3 sm:grid-cols-2", children: [_jsxs("button", { type: "button", onClick: () => handleModeChange("auto"), className: cn("flex flex-col items-start gap-1.5 rounded-xl p-3.5 text-left border transition-all cursor-pointer", currentMode === "auto"
                                    ? "bg-background border-primary shadow-xs ring-1 ring-primary/25"
                                    : "bg-surface/30 border-border hover:bg-surface/70 text-foreground-subtle"), children: [_jsxs("div", { className: "flex items-center gap-1.5 font-semibold text-ui-xs text-foreground", children: [_jsx(Sparkles, { className: "size-3.5 text-primary" }), _jsx("span", { children: "AI \u667A\u80FD\u6839\u636E\u5185\u5BB9\u81EA\u9002\u5E94\u914D\u56FE (\u63A8\u8350)" })] }), _jsx("p", { className: "text-ui-xs text-foreground-subtle leading-tight", children: "\u7531 AI \u6839\u636E\u6B63\u6587\u5B9E\u9645\u5206\u6BB5\u3001\u5B57\u6570\u4E0E\u8BBA\u636E\u5BC6\u5EA6\u81EA\u52A8\u89C4\u5212 1~4 \u5F20\u914D\u56FE\uFF0C\u5E76\u667A\u80FD\u4EA4\u66FF\u6DF7\u6392 AI \u6392\u7248\u56FE\u4E0E\u771F\u5B9E\u641C\u56FE" })] }), _jsxs("button", { type: "button", onClick: () => handleModeChange("custom"), className: cn("flex flex-col items-start gap-1.5 rounded-xl p-3.5 text-left border transition-all cursor-pointer", currentMode === "custom"
                                    ? "bg-background border-primary shadow-xs ring-1 ring-primary/25"
                                    : "bg-surface/30 border-border hover:bg-surface/70 text-foreground-subtle"), children: [_jsxs("div", { className: "flex items-center gap-1.5 font-semibold text-ui-xs text-foreground", children: [_jsx(Sliders, { className: "size-3.5 text-primary" }), _jsx("span", { children: "\u81EA\u5B9A\u4E49\u5206\u522B\u6307\u5B9A AI \u4E0E\u641C\u56FE\u6570\u91CF" })] }), _jsx("p", { className: "text-ui-xs text-foreground-subtle leading-tight", children: "\u624B\u52A8\u7CBE\u786E\u63A7\u5236\u6BCF\u7BC7\u6587\u7AE0\u751F\u6210\u7684 AI \u8BBE\u8BA1\u6392\u7248\u56FE\u5F20\u6570\u4E0E\u7F51\u7EDC\u641C\u7D22\u771F\u5B9E\u7D20\u6750\u56FE\u5F20\u6570" })] })] }), currentMode === "custom" && (_jsxs("div", { className: "rounded-lg border border-border/60 bg-background/60 p-3.5 space-y-3", children: [isXhs ? (_jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsxs("label", { className: "space-y-1.5 text-ui-xs text-foreground", children: [_jsxs("span", { className: "font-medium text-foreground flex items-center gap-1.5", children: [_jsx(ImageIcon, { className: "size-3.5 text-primary" }), _jsx("span", { children: "AI \u7A3F\u5B9A\u5927\u5B57\u62A5\u6392\u7248\u5361\u7247\u6570" })] }), _jsx(Input, { type: "number", min: 1, max: 18, value: xhsAiCount, onChange: (e) => handleUpdateXhsCounts(Number(e.target.value), xhsSearchCount), className: "h-8.5 text-ui-xs" }), _jsx("span", { className: "text-ui-2xs text-foreground-subtle", children: "\u9996\u56FE\u5FC5\u4E3A\u5C01\u9762\u5927\u5B57\u62A5\uFF0C\u6B21\u56FE\u751F\u6210\u7ED3\u6784\u5316\u77E5\u8BC6\u5361" })] }), _jsxs("label", { className: "space-y-1.5 text-ui-xs text-foreground", children: [_jsxs("span", { className: "font-medium text-foreground flex items-center gap-1.5", children: [_jsx(Search, { className: "size-3.5 text-emerald-600 dark:text-emerald-400" }), _jsx("span", { children: "\u7F51\u7EDC\u641C\u7D22\u771F\u5B9E\u63D2\u56FE\u7D20\u6750\u6570" })] }), _jsx(Input, { type: "number", min: 0, max: 18, value: xhsSearchCount, onChange: (e) => handleUpdateXhsCounts(xhsAiCount, Number(e.target.value)), className: "h-8.5 text-ui-xs" }), _jsx("span", { className: "text-ui-2xs text-foreground-subtle", children: "\u6839\u636E\u7B14\u8BB0\u5173\u952E\u8BCD\u81EA\u52A8\u641C\u7D22\u771F\u5B9E\u573A\u666F\u56FE\uFF0C\u514D\u6263\u8D39\u751F\u56FE" })] })] })) : (_jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsxs("label", { className: "space-y-1.5 text-ui-xs text-foreground", children: [_jsxs("span", { className: "font-medium text-foreground flex items-center gap-1.5", children: [_jsx(ImageIcon, { className: "size-3.5 text-primary" }), _jsx("span", { children: "\u6B63\u6587 AI \u7A3F\u5B9A\u6392\u7248\u751F\u56FE\u6570 (0~4 \u5F20)" })] }), _jsx(Input, { type: "number", min: 0, max: 4, value: aiImageCount, onChange: (e) => handleUpdateCounts(Number(e.target.value), searchImageCount), className: "h-8.5 text-ui-xs" }), _jsx("span", { className: "text-ui-2xs text-foreground-subtle", children: "\u751F\u6210\u7A3F\u5B9A\u98CE\u683C\u6982\u5FF5\u4FE1\u606F\u56FE\u8C31\u4E0E\u5927\u5B57\u62A5\u5361\u7247" })] }), _jsxs("label", { className: "space-y-1.5 text-ui-xs text-foreground", children: [_jsxs("span", { className: "font-medium text-foreground flex items-center gap-1.5", children: [_jsx(Search, { className: "size-3.5 text-emerald-600 dark:text-emerald-400" }), _jsx("span", { children: "\u6B63\u6587\u7F51\u7EDC\u641C\u7D22\u771F\u5B9E\u7D20\u6750\u56FE\u6570 (0~4 \u5F20)" })] }), _jsx(Input, { type: "number", min: 0, max: 4, value: searchImageCount, onChange: (e) => handleUpdateCounts(aiImageCount, Number(e.target.value)), className: "h-8.5 text-ui-xs" }), _jsx("span", { className: "text-ui-2xs text-foreground-subtle", children: "\u6D4F\u89C8\u5668\u6781\u901F\u641C\u7D22\u771F\u5B9E\u6444\u5F71\u63D2\u56FE\uFF0C\u6D88\u9664 100% AI \u7ED8\u56FE\u7279\u5F81" })] })] })), _jsxs("div", { className: "flex items-center justify-between pt-1 border-t border-border/40 text-ui-2xs text-foreground-subtle", children: [_jsxs("span", { children: ["\u6BCF\u7BC7\u6B63\u6587\u914D\u56FE\u603B\u8BA1:", " ", _jsxs("strong", { className: "text-foreground font-semibold", children: [isXhs ? xhsTotalCards : totalContentImages, " \u5F20"] }), " ", "(\u5C01\u9762\u53E6\u8BA1)"] }), _jsx("span", { className: "text-emerald-600 dark:text-emerald-400", children: "\u641C\u56FE\u63D2\u56FE\u4E0D\u6D88\u8017 API \u914D\u989D\uFF0C\u641C\u7D22\u5F02\u5E38\u81EA\u52A8\u56DE\u9000 AI \u7ED8\u5236" })] })] })), _jsxs("div", { className: "rounded-xl border border-border/80 bg-surface/50 p-4 space-y-3", children: [_jsxs("div", { className: "space-y-0.5", children: [_jsxs("h4", { className: "text-ui-sm font-semibold text-foreground flex items-center gap-1.5", children: [_jsx(Languages, { className: "size-4 text-primary" }), _jsx("span", { children: "\u56FE\u4E2D\u6587\u5B57\u8BED\u8A00\u6392\u7248\u7EA6\u675F" })] }), _jsx("p", { className: "text-ui-xs text-foreground-subtle", children: "\u5206\u522B\u72EC\u7ACB\u63A7\u5236\u5C01\u9762\u4E0E\u6B63\u6587\u914D\u56FE\u7684\u8BED\u8A00\u7EA6\u675F\uFF0C\u5E95\u5C42\u81EA\u52A8\u5F3A\u5236\u6267\u884C\uFF0C\u9632\u6B62 AI \u751F\u6210\u82F1\u6587\u4E71\u7801\u4E0E\u4F2A\u5B57\u7B26" })] }), _jsxs("div", { className: "grid gap-3 sm:grid-cols-2 pt-1", children: [_jsxs("div", { className: "flex items-center justify-between rounded-lg border border-border/80 bg-background/60 p-3", children: [_jsxs("div", { className: "space-y-0.5 pr-2", children: [_jsx("div", { className: "text-ui-xs font-semibold text-foreground", children: "\u5C01\u9762\u56FE\u6587\u5B57\u4EC5\u4E2D\u6587\u6392\u7248" }), _jsx("div", { className: "text-ui-2xs text-foreground-subtle", children: "\u9644\u52A0\u4E2D\u6587\u4E3B\u6807\u9898\u4E0E\u5173\u952E\u8BCD\u827A\u672F\u6392\u7248\u7EA6\u675F\uFF0C\u4E25\u7981\u82F1\u6587\u4E71\u7801\u4E0E\u4F2A\u5B57\u7B26" })] }), _jsx(Switch, { checked: Boolean(content.cover_lang_zh_only ?? content.image_lang_zh_only ?? true), onCheckedChange: (c) => updateCurrentAccount({
                                                    content: {
                                                        ...content,
                                                        cover_lang_zh_only: c,
                                                        image_lang_zh_only: c && Boolean(content.content_image_lang_zh_only ?? content.image_lang_zh_only ?? true),
                                                    },
                                                }) })] }), _jsxs("div", { className: "flex items-center justify-between rounded-lg border border-border/80 bg-background/60 p-3", children: [_jsxs("div", { className: "space-y-0.5 pr-2", children: [_jsx("div", { className: "text-ui-xs font-semibold text-foreground", children: "\u6B63\u6587\u914D\u56FE\u6587\u5B57\u4EC5\u4E2D\u6587\u6392\u7248" }), _jsx("div", { className: "text-ui-2xs text-foreground-subtle", children: "\u6B63\u6587\u9AD8\u6E05\u63D2\u56FE\u6D89\u53CA\u6587\u5B57\u8981\u7D20\u65F6\u4E25\u683C\u8981\u6C42\u7EAF\u4E2D\u6587\uFF0C\u4E25\u7981\u82F1\u6587\u5355\u8BCD\u4E0E\u4F2A\u5B57\u7B26" })] }), _jsx(Switch, { checked: Boolean(content.content_image_lang_zh_only ?? content.image_lang_zh_only ?? true), onCheckedChange: (c) => updateCurrentAccount({
                                                    content: {
                                                        ...content,
                                                        content_image_lang_zh_only: c,
                                                        image_lang_zh_only: Boolean(content.cover_lang_zh_only ?? content.image_lang_zh_only ?? true) && c,
                                                    },
                                                }) })] })] })] })] })] }));
}
//# sourceMappingURL=SocialPublisherContentImageSettings.js.map