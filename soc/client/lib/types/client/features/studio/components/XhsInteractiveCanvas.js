import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useMemo, useCallback } from "react";
import { Sparkles, GripVertical, Image as ImageIcon, Hash, FileText } from "lucide-react";
import { resolveSafeMediaPreviewUrl } from "../../core/slices/sandboxedMediaResolver.js";
import { Button } from "../../../compat/components/ui/button.js";
import { cn } from "../../../compat/components/lib/utils.js";
export function XhsInteractiveCanvas({ article, workspacePath, workspaceIdentity, sessionId, taskId: _taskId, onUpdateArticle, }) {
    const [selectedCardIdx, setSelectedCardIdx] = useState(0);
    const [draggedCardIdx, setDraggedCardIdx] = useState(null);
    // 聚合所有图片（首图封面 + 正文卡片图）
    const allImages = useMemo(() => {
        const list = [];
        if (article.coverUrl)
            list.push(article.coverUrl);
        for (const img of article.images || []) {
            if (!list.includes(img))
                list.push(img);
        }
        return list;
    }, [article.coverUrl, article.images]);
    // 解析安全本地预览 URL 列表
    const resolvedImageUrls = useMemo(() => {
        return allImages.map((raw) => resolveSafeMediaPreviewUrl({
            rawUrlOrPath: raw,
            workspacePath,
            workspaceIdentity,
            sessionId,
            scriptsDir: article.scriptsDir,
        }) || raw);
    }, [allImages, workspacePath, workspaceIdentity, sessionId, article.scriptsDir]);
    // 拖拽重排
    const handleDragStart = (idx) => {
        setDraggedCardIdx(idx);
    };
    const handleDragOver = (e, targetIdx) => {
        e.preventDefault();
        if (draggedCardIdx === null || draggedCardIdx === targetIdx)
            return;
        const nextImages = [...allImages];
        const [moved] = nextImages.splice(draggedCardIdx, 1);
        if (moved) {
            nextImages.splice(targetIdx, 0, moved);
            setDraggedCardIdx(targetIdx);
            if (onUpdateArticle) {
                onUpdateArticle({
                    ...article,
                    coverUrl: nextImages[0] || article.coverUrl,
                    images: nextImages,
                });
            }
        }
    };
    const handleDragEnd = () => {
        setDraggedCardIdx(null);
    };
    // 触发全局单图 AI 重新生成弹窗
    const handleRegenerateImage = useCallback((idx) => {
        window.dispatchEvent(new CustomEvent("wincode:social-studio-regenerate-image", {
            detail: {
                articleIndex: article.index || 1,
                slotId: `slot_${idx + 1}`,
                kind: idx === 0 ? "pic_cover" : "pic_card",
                ratio: "3:4",
                article,
            },
        }));
    }, [article]);
    return (_jsxs("div", { "data-testid": "xhs-interactive-canvas", className: "flex flex-col lg:flex-row gap-6 max-w-6xl mx-auto h-full min-h-0 select-none", children: [_jsxs("div", { className: "flex-1 flex flex-col items-center justify-center p-4 min-h-0", children: [_jsxs("div", { className: "relative w-full max-w-[360px] aspect-[3/4] rounded-2xl overflow-hidden shadow-2xl border border-border/80 bg-surface-subtle group", children: [resolvedImageUrls[selectedCardIdx] ? (_jsx("img", { src: resolvedImageUrls[selectedCardIdx], alt: `卡片 ${selectedCardIdx + 1}`, className: "w-full h-full object-cover select-none pointer-events-none" })) : (_jsxs("div", { className: "w-full h-full flex flex-col items-center justify-center gap-2 p-6 text-foreground-muted bg-surface/80", children: [_jsx(ImageIcon, { className: "size-10 stroke-1 opacity-60 animate-pulse" }), _jsx("p", { className: "text-ui-xs font-medium", children: "3:4 \u7AD6\u7248\u6D77\u62A5\u5361\u7247\u751F\u6210\u4E2D" })] })), selectedCardIdx === 0 && (_jsxs("div", { className: "absolute top-6 left-4 right-4 p-3 rounded-lg bg-black/75 backdrop-blur-md border border-white/10 text-white shadow-lg", children: [_jsx("span", { className: "text-ui-2xs font-semibold px-1.5 py-0.5 rounded bg-primary text-primary-foreground mr-2", children: "\u7206\u6B3E\u9996\u56FE" }), _jsx("span", { className: "text-ui-sm font-bold tracking-tight", children: article.title || "未命名小红书笔记" })] })), _jsx("div", { className: "absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity", children: _jsxs(Button, { size: "sm", variant: "secondary", className: "h-7 px-2 text-ui-2xs gap-1 bg-surface/90 backdrop-blur shadow-sm hover:bg-surface-hover", onClick: () => handleRegenerateImage(selectedCardIdx), children: [_jsx(Sparkles, { className: "size-3 text-primary" }), "\u91CD\u65B0\u8BBE\u8BA1"] }) }), resolvedImageUrls.length > 0 && (_jsxs("div", { className: "absolute bottom-3 right-3 px-2 py-0.5 rounded-full bg-black/60 text-white text-ui-2xs font-mono backdrop-blur-sm", children: [selectedCardIdx + 1, " / ", resolvedImageUrls.length] }))] }), resolvedImageUrls.length > 1 && (_jsx("div", { className: "flex gap-2 mt-4 p-1.5 bg-surface-subtle rounded-xl border border-border/60 overflow-x-auto max-w-full custom-scrollbar", children: resolvedImageUrls.map((url, idx) => (_jsxs("div", { draggable: true, onDragStart: () => handleDragStart(idx), onDragOver: (e) => handleDragOver(e, idx), onDragEnd: handleDragEnd, onClick: () => setSelectedCardIdx(idx), className: cn("relative w-14 aspect-[3/4] rounded-lg overflow-hidden border cursor-pointer transition-all flex-shrink-0 group/item", selectedCardIdx === idx
                                ? "border-primary ring-2 ring-primary/20 shadow-md scale-105"
                                : "border-border/60 hover:border-foreground-muted opacity-80 hover:opacity-100", draggedCardIdx === idx && "opacity-40"), children: [_jsx("img", { src: url, alt: `缩略图 ${idx + 1}`, className: "w-full h-full object-cover" }), _jsx("div", { className: "absolute top-0.5 left-0.5 p-0.5 bg-black/60 rounded text-white text-[9px] font-mono leading-none", children: idx === 0 ? "封面" : idx + 1 }), _jsx("div", { className: "absolute inset-0 flex items-center justify-center opacity-0 group-hover/item:opacity-100 bg-black/30 transition-opacity", children: _jsx(GripVertical, { className: "size-3.5 text-white" }) })] }, idx))) }))] }), _jsxs("div", { className: "w-full lg:w-[420px] flex flex-col gap-4 p-4 bg-surface rounded-2xl border border-border/70 overflow-hidden shadow-sm", children: [_jsxs("div", { className: "flex items-center gap-2 border-b border-border/60 pb-3", children: [_jsx(FileText, { className: "size-4 text-primary" }), _jsx("h4", { className: "text-ui-sm font-semibold text-foreground", children: "\u5C0F\u7EA2\u4E66\u6587\u6848\u4E0E\u70ED\u95E8\u8BDD\u9898" }), _jsxs("span", { className: "text-ui-2xs text-foreground-muted ml-auto font-mono", children: [article.content ? article.content.length : 0, " \u5B57"] })] }), _jsxs("div", { className: "flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar", children: [_jsxs("div", { className: "space-y-1.5", children: [_jsx("label", { className: "text-ui-2xs font-medium text-foreground-muted", children: "\u7206\u6B3E\u6807\u9898 (\u226420\u5B57)" }), _jsx("input", { type: "text", maxLength: 20, value: article.title || "", onChange: (e) => {
                                            if (onUpdateArticle) {
                                                onUpdateArticle({ ...article, title: e.target.value });
                                            }
                                        }, className: "w-full px-3 py-2 rounded-lg bg-surface-subtle border border-border/60 text-ui-sm font-bold focus:outline-none focus:ring-1 focus:ring-primary", placeholder: "\u8F93\u5165\u5C0F\u7EA2\u4E66\u7206\u6B3E\u6807\u9898..." })] }), _jsxs("div", { className: "space-y-1.5 flex-1", children: [_jsx("label", { className: "text-ui-2xs font-medium text-foreground-muted", children: "\u6587\u6848\u6B63\u6587" }), _jsx("textarea", { rows: 12, value: article.content || "", onChange: (e) => {
                                            if (onUpdateArticle) {
                                                onUpdateArticle({ ...article, content: e.target.value });
                                            }
                                        }, className: "w-full px-3 py-2 rounded-lg bg-surface-subtle border border-border/60 text-ui-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary resize-none custom-scrollbar", placeholder: "\u6B63\u6587\u5185\u5BB9..." })] }), article.tags && article.tags.length > 0 && (_jsxs("div", { className: "space-y-1.5", children: [_jsxs("label", { className: "text-ui-2xs font-medium text-foreground-muted flex items-center gap-1", children: [_jsx(Hash, { className: "size-3 text-primary" }), "\u63A8\u8350\u70ED\u95E8\u8BDD\u9898"] }), _jsx("div", { className: "flex flex-wrap gap-1.5", children: article.tags.map((tag, i) => (_jsxs("span", { className: "px-2 py-0.5 rounded-full bg-primary/10 text-primary text-ui-2xs font-medium", children: ["#", tag] }, i))) })] }))] })] })] }));
}
//# sourceMappingURL=XhsInteractiveCanvas.js.map