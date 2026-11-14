import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useMemo, useEffect } from "react";
import { Button } from "../../compat/components/ui/button.js";
import { Search, X, CopyCheck, CheckCircle2, AlertCircle, FileText, Image as ImageIcon, RefreshCw, } from "lucide-react";
import { SocialPublisherDraftCard } from "../../settings/SocialPublisherDraftCard.js";
import { SocialPublisherDraftsDuplicateDialog } from "../../settings/SocialPublisherDraftsDuplicateDialog.js";
import { useSocialPublisherDrafts } from "../../settings/useSocialPublisherDrafts.js";
import { normalizeSocialDraftTitle } from "../../settings/socialPublisherTitleHelper.js";
import { useMembership } from "../../compat/hooks/useMembership.js";
import { ProFeatureGateModal } from "../../settings/ProFeatureGateModal.js";
import { cn } from "../../compat/components/lib/utils.js";
export function SocialPlanDraftsView({ currentAccountId, accountName, socialPublisherRpc, onDraftCountChange, refreshKey = 0, }) {
    const { checkFeature } = useMembership();
    const [featureGateOpen, setFeatureGateOpen] = useState(false);
    const [activeTabType, setActiveTabType] = useState("news");
    const [searchKeyword, setSearchKeyword] = useState("");
    const { drafts, loading, syncing, statusMessage, setStatusMessage, deletingId, triggerSync, handleDeleteDraft, showDuplicateModal, setShowDuplicateModal, scanningDuplicates, duplicateStrategy, duplicateScanResult, selectedDeleteIds, setSelectedDeleteIds, cleaningDuplicates, handleOpenDuplicateModal, handleStrategyChange, handleBatchCleanDuplicates, } = useSocialPublisherDrafts(currentAccountId, socialPublisherRpc);
    useEffect(() => {
        onDraftCountChange?.(drafts.length);
    }, [drafts.length, onDraftCountChange]);
    useEffect(() => {
        if (refreshKey > 0 && currentAccountId) {
            triggerSync();
        }
    }, [refreshKey, currentAccountId, triggerSync]);
    const articleCount = useMemo(() => drafts.filter((d) => d.article_type === "news").length, [drafts]);
    const newspicCount = useMemo(() => drafts.filter((d) => d.article_type === "newspic").length, [drafts]);
    // 自动检测当前账号草稿箱中是否存在同名重复草稿集合
    const duplicateTitleSet = useMemo(() => {
        const counts = new Map();
        for (const d of drafts) {
            const title = d.articles?.[0]?.title || d.title || "";
            const norm = normalizeSocialDraftTitle(title);
            if (norm && norm.length >= 3) {
                counts.set(norm, (counts.get(norm) || 0) + 1);
            }
        }
        const set = new Set();
        for (const [k, count] of counts.entries()) {
            if (count > 1)
                set.add(k);
        }
        return set;
    }, [drafts]);
    const filteredDrafts = useMemo(() => {
        let list = drafts.filter((d) => d.article_type === activeTabType);
        if (searchKeyword.trim()) {
            const kw = searchKeyword.trim().toLowerCase();
            list = list.filter((d) => {
                const inMain = d.articles?.[0]?.title?.toLowerCase()?.includes(kw);
                const inSub = d.articles?.some((a) => a.title?.toLowerCase()?.includes(kw));
                return inMain || inSub;
            });
        }
        return list;
    }, [drafts, activeTabType, searchKeyword]);
    const displayName = accountName || currentAccountId || "默认公众号";
    return (_jsxs("div", { className: "space-y-3.5", "data-testid": "social-plan-drafts-view", children: [_jsx("div", { className: "rounded-xl border border-card-border/80 bg-card/60 p-3.5 shadow-2xs backdrop-blur-md", children: _jsxs("div", { className: "flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3", children: [_jsxs("div", { className: "space-y-0.5", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-ui-sm font-semibold text-foreground tracking-tight", children: "\u5FAE\u4FE1\u516C\u4F17\u5E73\u53F0\u5B98\u65B9\u8349\u7A3F\u5E93" }), _jsxs("span", { className: "inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20", children: [_jsx(CheckCircle2, { className: "size-3" }), "\u540E\u53F0\u76F4\u901A"] })] }), _jsxs("p", { className: "text-[11px] text-foreground-subtle", children: ["\u5F53\u524D\u8D26\u53F7\uFF1A", _jsx("strong", { className: "text-foreground font-medium", children: displayName }), "\uFF08\u5220\u9664\u8349\u7A3F\u4E0D\u4F1A\u5F71\u54CD\u5DF2\u7FA4\u53D1\u6216\u5DF2\u53D1\u8868\u7684\u5185\u5BB9\uFF09"] })] }), _jsxs("div", { className: "relative w-full sm:w-64", children: [_jsx(Search, { className: "size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground-subtle pointer-events-none" }), _jsx("input", { type: "text", placeholder: "\u641C\u7D22\u8349\u7A3F\u6807\u9898\u6216\u6458\u8981...", value: searchKeyword, onChange: (e) => setSearchKeyword(e.target.value), className: "w-full h-8.5 pl-8 pr-7 rounded-lg border border-border/80 bg-background text-ui-xs text-foreground placeholder:text-foreground-subtle/60 focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs" }), searchKeyword ? (_jsx("button", { type: "button", onClick: () => setSearchKeyword(""), className: "absolute right-2 top-1/2 -translate-y-1/2 text-foreground-subtle hover:text-foreground p-0.5 cursor-pointer", title: "\u6E05\u7A7A", children: _jsx(X, { className: "size-3.5" }) })) : null] })] }) }), statusMessage ? (_jsxs("div", { className: cn("flex items-center justify-between gap-3 p-3 rounded-xl text-ui-xs border", statusMessage.type === "success"
                    ? "bg-emerald-500/[0.08] border-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                    : "bg-destructive/[0.08] border-destructive/20 text-destructive"), children: [_jsxs("div", { className: "flex items-center gap-2", children: [statusMessage.type === "success" ? (_jsx(CheckCircle2, { className: "size-4 shrink-0 text-emerald-600 dark:text-emerald-400" })) : (_jsx(AlertCircle, { className: "size-4 shrink-0 text-destructive" })), _jsx("span", { className: "font-medium", children: statusMessage.text })] }), _jsx("button", { type: "button", onClick: () => setStatusMessage(null), className: "text-foreground-subtle hover:text-foreground cursor-pointer", children: _jsx(X, { className: "size-3.5" }) })] })) : null, _jsxs("div", { className: "flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border/70 pb-2.5", children: [_jsxs("div", { className: "flex items-center gap-1 rounded-xl bg-surface/80 p-1 border border-card-border/80 shadow-2xs", children: [_jsxs("button", { type: "button", onClick: () => setActiveTabType("news"), className: cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-ui-xs font-semibold transition-all cursor-pointer", activeTabType === "news"
                                    ? "bg-card text-foreground shadow-2xs border border-border/80"
                                    : "text-foreground-subtle hover:text-foreground"), children: [_jsx(FileText, { className: "size-3.5 text-primary" }), _jsx("span", { children: "\u56FE\u6587\u957F\u6587" }), _jsx("span", { className: "rounded-full bg-surface-active px-1.5 py-0.2 text-[10px] font-mono text-foreground-subtle border border-border/40", children: articleCount })] }), _jsxs("button", { type: "button", onClick: () => setActiveTabType("newspic"), className: cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-ui-xs font-semibold transition-all cursor-pointer", activeTabType === "newspic"
                                    ? "bg-card text-foreground shadow-2xs border border-border/80"
                                    : "text-foreground-subtle hover:text-foreground"), children: [_jsx(ImageIcon, { className: "size-3.5 text-emerald-600 dark:text-emerald-400" }), _jsx("span", { children: "\u5C0F\u7EFF\u4E66/\u8D34\u56FE" }), _jsx("span", { className: "rounded-full bg-surface-active px-1.5 py-0.2 text-[10px] font-mono text-foreground-subtle border border-border/40", children: newspicCount })] })] }), _jsx("div", { className: "flex items-center gap-2 self-end sm:self-auto", children: _jsxs(Button, { type: "button", variant: "outline", size: "sm", onClick: async () => {
                                const gate = await checkFeature("drafts_batch_cleanup");
                                if (!gate.allowed) {
                                    setFeatureGateOpen(true);
                                    return;
                                }
                                handleOpenDuplicateModal();
                            }, disabled: drafts.length === 0 || loading || syncing, className: "h-8 gap-1.5 text-ui-xs border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 rounded-lg shadow-2xs", children: [_jsx(CopyCheck, { className: "size-3.5 text-amber-500" }), _jsx("span", { children: "\u6CBB\u7406\u540C\u540D\u91CD\u590D\u8349\u7A3F" })] }) })] }), loading && drafts.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center p-14 text-foreground-subtle space-y-2 rounded-xl border border-card-border/80 bg-card/40", children: [_jsx(RefreshCw, { className: "size-5 animate-spin text-primary" }), _jsx("span", { className: "text-ui-sm font-medium", children: "\u6B63\u5728\u8BFB\u53D6\u5FAE\u4FE1\u516C\u4F17\u53F7\u8349\u7A3F\u7BB1..." })] })) : filteredDrafts.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center p-14 text-center rounded-xl border border-card-border/80 bg-card/40 space-y-3", children: [_jsx("div", { className: "size-11 rounded-full bg-surface-active/60 flex items-center justify-center text-foreground-subtle border border-border/40", children: _jsx(FileText, { className: "size-5 opacity-60" }) }), _jsxs("div", { className: "space-y-1", children: [_jsx("div", { className: "text-ui-sm font-semibold text-foreground", children: searchKeyword
                                    ? "未搜索到匹配的草稿"
                                    : `当前无「${activeTabType === "news" ? "文章" : "贴图"}」草稿` }), _jsx("p", { className: "text-ui-xs text-foreground-subtle max-w-md mx-auto leading-relaxed", children: searchKeyword
                                    ? `尝试使用其他关键词，或清除搜索框重试。`
                                    : `当前微信公众号后台暂无该类型的草稿。可点击顶部的「一键同步排期与草稿」获取后台最新数据，或在主对话中使用 /gzh 创作全新长文。` })] })] })) : (_jsx("div", { className: "columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-3.5 space-y-3.5", children: filteredDrafts.map((card) => {
                    const headTitle = card.articles?.[0]?.title || card.title || "";
                    const norm = normalizeSocialDraftTitle(headTitle);
                    const isDup = norm.length >= 3 && duplicateTitleSet.has(norm);
                    return (_jsx(SocialPublisherDraftCard, { card: card, isDeleting: deletingId === card.id, onDelete: handleDeleteDraft, hasDuplicate: isDup, onOpenDuplicateClean: handleOpenDuplicateModal }, card.id || card.appmsgid));
                }) })), _jsx(SocialPublisherDraftsDuplicateDialog, { open: showDuplicateModal, onClose: () => setShowDuplicateModal(false), scanning: scanningDuplicates, cleaning: cleaningDuplicates, scanResult: duplicateScanResult, strategy: duplicateStrategy, onStrategyChange: handleStrategyChange, selectedDeleteIds: selectedDeleteIds, onToggleSelect: (appmsgid) => {
                    const next = new Set(selectedDeleteIds);
                    if (next.has(appmsgid))
                        next.delete(appmsgid);
                    else
                        next.add(appmsgid);
                    setSelectedDeleteIds(next);
                }, onConfirmClean: handleBatchCleanDuplicates }), _jsx(ProFeatureGateModal, { open: featureGateOpen, onOpenChange: setFeatureGateOpen, featureId: "drafts_batch_cleanup", featureTitle: "\u5FAE\u4FE1\u516C\u4F17\u53F7\u91CD\u590D\u8349\u7A3F\u6279\u91CF\u5B89\u5168\u6CBB\u7406", description: "\u7CFB\u7EDF\u5C06\u57FA\u4E8E\u6B63\u6587\u6307\u7EB9\u4E0E\u76F8\u4F3C\u5EA6\u7B97\u6CD5\u667A\u80FD\u5F52\u96C6\u91CD\u590D\u8349\u7A3F\uFF0C\u5E76\u63D0\u4F9B\u4E00\u952E\u4FDD\u7559\u6700\u65B0\u7248\u672C\u3001\u6279\u91CF\u5B89\u5168\u6E05\u7406\u7684\u7279\u6743\u6CBB\u7406\u80FD\u529B\u3002", onConfirmTrial: () => {
                    setFeatureGateOpen(false);
                    handleOpenDuplicateModal();
                } })] }));
}
//# sourceMappingURL=SocialPlanDraftsView.js.map