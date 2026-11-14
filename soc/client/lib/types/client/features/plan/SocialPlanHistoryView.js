import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from "react";
import { Button } from "../../compat/components/ui/button.js";
import { RefreshCw, History, Calendar, Layers, Clock, Search, Check, AlertCircle, ChevronDown, ChevronUp, X, } from "lucide-react";
import { publisherApiFetch, safeParseJson, } from "../../settings/SocialPublisherTypes.js";
import { cn } from "../../compat/components/lib/utils.js";
const PLATFORM_LABELS = {
    gzh: "微信公众号",
    xiaohongshu: "小红书",
    zhihu: "知乎",
    baijiahao: "百家号",
    toutiao: "今日头条",
};
export function SocialPlanHistoryView({ allAccounts, socialPublisherRpc, onSummaryChange, }) {
    const [selectedAccountId, setSelectedAccountId] = useState("all");
    const [selectedPlatform, setSelectedPlatform] = useState("all");
    const [keyword, setKeyword] = useState("");
    const [historyRecords, setHistoryRecords] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [expandedBatchIds, setExpandedBatchIds] = useState(new Set());
    const fetchHistory = useCallback(async () => {
        setLoadingHistory(true);
        try {
            const params = new URLSearchParams();
            if (selectedAccountId && selectedAccountId !== "all") {
                params.append("account_id", selectedAccountId);
            }
            if (selectedPlatform && selectedPlatform !== "all") {
                params.append("platform", selectedPlatform);
            }
            if (keyword.trim()) {
                params.append("keyword", keyword.trim());
            }
            const qs = params.toString() ? `?${params.toString()}` : "";
            const res = await publisherApiFetch(`/api/gzh-publisher/publish-history${qs}`, {}, socialPublisherRpc);
            const parsed = await safeParseJson(res);
            if (parsed.ok && parsed.data) {
                const records = Array.isArray(parsed.data.records)
                    ? parsed.data.records
                    : [];
                setHistoryRecords(records);
                const s = parsed.data.summary || {};
                const totalBatches = parsed.data.total_batches ?? records.length;
                const totalArticles = parsed.data.total_articles ??
                    records.reduce((acc, r) => acc + (r.article_count || 0), 0);
                const scheduledCount = s.scheduled_count ??
                    records.filter((r) => r.publish_action === "schedule" || r.publish_status === "scheduled")
                        .length;
                const draftSavedCount = s.draft_saved_count ??
                    records.filter((r) => r.publish_action === "draft" || r.publish_status === "draft_saved")
                        .length;
                onSummaryChange?.({
                    totalBatches,
                    totalArticles,
                    scheduledCount,
                    draftSavedCount,
                });
            }
        }
        catch (err) {
            console.warn("[SocialPlanHistoryView] 加载发布历史失败:", err);
        }
        finally {
            setLoadingHistory(false);
        }
    }, [selectedAccountId, selectedPlatform, keyword, socialPublisherRpc, onSummaryChange]);
    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);
    const toggleExpandBatch = (batchId) => {
        setExpandedBatchIds((prev) => {
            const next = new Set(prev);
            if (next.has(batchId))
                next.delete(batchId);
            else
                next.add(batchId);
            return next;
        });
    };
    return (_jsxs("div", { className: "space-y-4", "data-testid": "social-plan-history-view", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-card-border/80 bg-card/60 p-3 text-ui-xs shadow-2xs backdrop-blur-md", children: [_jsxs("div", { className: "flex items-center gap-2 flex-wrap flex-1 min-w-[240px]", children: [_jsxs("select", { "aria-label": "\u7B5B\u9009\u6267\u884C\u8D26\u53F7", className: "h-8.5 rounded-lg border border-border/80 bg-background px-2.5 text-ui-xs text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs", value: selectedAccountId, onChange: (e) => setSelectedAccountId(e.target.value), children: [_jsx("option", { value: "all", children: "\u5168\u90E8\u6267\u884C\u8D26\u53F7" }), allAccounts.map((acc) => (_jsxs("option", { value: acc.id, children: [acc.name || acc.id, " (", PLATFORM_LABELS[acc.platform] || acc.platform || "gzh", ")"] }, acc.id)))] }), _jsxs("select", { "aria-label": "\u7B5B\u9009\u53D1\u5E03\u5E73\u53F0", className: "h-8.5 rounded-lg border border-border/80 bg-background px-2.5 text-ui-xs text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs", value: selectedPlatform, onChange: (e) => setSelectedPlatform(e.target.value), children: [_jsx("option", { value: "all", children: "\u5168\u90E8\u793E\u5A92\u5E73\u53F0" }), _jsx("option", { value: "gzh", children: "\u5FAE\u4FE1\u516C\u4F17\u53F7" }), _jsx("option", { value: "xiaohongshu", children: "\u5C0F\u7EA2\u4E66" }), _jsx("option", { value: "zhihu", children: "\u77E5\u4E4E" }), _jsx("option", { value: "baijiahao", children: "\u767E\u5BB6\u53F7" }), _jsx("option", { value: "toutiao", children: "\u4ECA\u65E5\u5934\u6761" })] }), _jsxs("div", { className: "relative flex-1 min-w-[180px] max-w-sm", children: [_jsx(Search, { className: "size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground-subtle pointer-events-none" }), _jsx("input", { type: "text", placeholder: "\u641C\u7D22\u6279\u6B21\u6807\u9898\u3001\u8D26\u53F7\u6216\u5173\u952E\u8BCD...", value: keyword, onChange: (e) => setKeyword(e.target.value), className: "h-8.5 w-full rounded-lg border border-border/80 bg-background pl-8 pr-7 text-ui-xs text-foreground placeholder:text-foreground-subtle/60 focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs" }), keyword ? (_jsx("button", { type: "button", onClick: () => setKeyword(""), className: "absolute right-2 top-1/2 -translate-y-1/2 text-foreground-subtle hover:text-foreground p-0.5 cursor-pointer", title: "\u6E05\u7A7A\u641C\u7D22", children: _jsx(X, { className: "size-3.5" }) })) : null] })] }), _jsxs("div", { className: "flex items-center gap-2.5", children: [_jsxs("span", { className: "text-ui-xs text-foreground-subtle font-mono hidden sm:inline", children: ["\u5171 ", historyRecords.length, " \u6279\u6B21"] }), _jsxs(Button, { type: "button", variant: "outline", size: "sm", onClick: fetchHistory, disabled: loadingHistory, className: "h-8.5 text-ui-xs gap-1.5 rounded-lg", children: [_jsx(RefreshCw, { className: cn("size-3.5", loadingHistory && "animate-spin") }), _jsx("span", { children: "\u5237\u65B0\u5BA1\u8BA1" })] })] })] }), loadingHistory && historyRecords.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center p-12 text-foreground-subtle space-y-2 rounded-xl border border-card-border/80 bg-card/40", children: [_jsx(RefreshCw, { className: "size-5 animate-spin text-primary" }), _jsx("span", { className: "text-ui-sm font-medium", children: "\u6B63\u5728\u8BFB\u53D6\u6D41\u6C34\u7EBF\u6267\u884C\u5BA1\u8BA1\u8BB0\u5F55..." })] })) : historyRecords.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center p-12 text-center space-y-3 rounded-xl border border-card-border/80 bg-card/40", children: [_jsx("div", { className: "size-11 rounded-full bg-surface-active/60 flex items-center justify-center text-foreground-subtle border border-border/40", children: _jsx(History, { className: "size-5 opacity-60" }) }), _jsxs("div", { className: "space-y-1", children: [_jsx("div", { className: "text-ui-sm font-semibold text-foreground", children: "\u6682\u65E0\u751F\u4EA7\u6D41\u6C34\u7EBF\u8BB0\u5F55" }), _jsxs("p", { className: "text-ui-xs text-foreground-subtle max-w-md mx-auto leading-relaxed", children: ["\u5728\u4E3B\u5BF9\u8BDD\u533A\u4F7F\u7528 ", _jsx("code", { className: "rounded bg-black/5 dark:bg-white/10 px-1 py-0.5 font-mono", children: "/gzh" }), " \u6216\u9009\u62E9\u793E\u5A92\u77E9\u9635\u53D1\u8D77\u6392\u7248\uFF0C\u7CFB\u7EDF\u5C06\u81EA\u52A8\u8BB0\u5F55\u6D41\u6C34\u7EBF\u6267\u884C\u65E5\u5FD7\u3001\u6210\u7A3F\u6587\u7AE0\u4E0E\u53D1\u5E03\u51ED\u8BC1\u3002"] })] })] })) : (_jsx("div", { className: "space-y-2.5", children: historyRecords.map((batch) => {
                    const isExpanded = expandedBatchIds.has(batch.id);
                    const isScheduled = batch.publish_action === "schedule" || batch.publish_status === "scheduled";
                    const isFailed = batch.status === "failed" || batch.publish_status === "failed";
                    const timeStr = batch.timestamp
                        ? new Date(batch.timestamp).toLocaleString("zh-CN")
                        : "刚刚";
                    const platformName = PLATFORM_LABELS[batch.platform || "gzh"] || batch.platform || "微信";
                    return (_jsxs("div", { className: "overflow-hidden rounded-xl border border-card-border/80 bg-card/70 hover:bg-card transition-all shadow-2xs backdrop-blur-md", children: [_jsxs("div", { onClick: () => toggleExpandBatch(batch.id), className: "flex items-center justify-between gap-3 p-3.5 cursor-pointer select-none", children: [_jsxs("div", { className: "flex items-center gap-3 min-w-0", children: [_jsx("div", { className: cn("flex size-8 shrink-0 items-center justify-center rounded-lg border", isFailed
                                                    ? "bg-destructive/10 border-destructive/25 text-destructive"
                                                    : isScheduled
                                                        ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400"
                                                        : "bg-primary/10 border-primary/25 text-primary"), children: isFailed ? (_jsx(AlertCircle, { className: "size-4" })) : isScheduled ? (_jsx(Calendar, { className: "size-4" })) : (_jsx(Check, { className: "size-4" })) }), _jsxs("div", { className: "min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [_jsx("span", { className: "font-semibold text-ui-sm text-foreground truncate max-w-xs sm:max-w-md", children: batch.articles?.[0] || "社媒流水线生产批次" }), batch.article_count > 1 && (_jsxs("span", { className: "rounded-full bg-surface-active px-2 py-0.5 text-[11px] font-medium text-foreground-subtle border border-border/60", children: ["\u5171 ", batch.article_count, " \u7BC7"] })), _jsx("span", { className: cn("rounded-full px-2 py-0.5 text-[11px] font-medium border", isFailed
                                                                    ? "bg-destructive/10 border-destructive/25 text-destructive"
                                                                    : isScheduled
                                                                        ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400"
                                                                        : "bg-sky-500/10 border-sky-500/25 text-sky-600 dark:text-sky-400"), children: isFailed ? "执行异常" : isScheduled ? "已官方排期" : "已入草稿箱" })] }), _jsxs("div", { className: "flex items-center gap-2 text-[11px] text-foreground-subtle mt-1 flex-wrap", children: [_jsx("span", { className: "font-medium text-foreground/80", children: platformName }), _jsx("span", { children: "\u00B7" }), _jsxs("span", { children: ["\u8D26\u53F7: ", batch.account_id || "默认"] }), _jsx("span", { children: "\u00B7" }), _jsxs("span", { className: "flex items-center gap-1 font-mono", children: [_jsx(Clock, { className: "size-3 text-foreground-subtle/80" }), _jsx("span", { children: timeStr })] })] })] })] }), _jsx("div", { className: "flex items-center gap-1.5 shrink-0", children: _jsx(Button, { type: "button", variant: "ghost", size: "sm", className: "size-7 p-0 text-foreground-subtle hover:text-foreground", title: isExpanded ? "收起批次" : "展开批次清单", children: isExpanded ? (_jsx(ChevronUp, { className: "size-4" })) : (_jsx(ChevronDown, { className: "size-4" })) }) })] }), isExpanded && (_jsxs("div", { className: "border-t border-border/60 bg-surface/40 p-3.5 space-y-2 text-ui-xs", children: [_jsxs("div", { className: "font-semibold text-foreground flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx(Layers, { className: "size-3.5 text-primary" }), _jsxs("span", { children: ["\u6279\u6B21\u6587\u7AE0\u6210\u679C\u6E05\u5355 (", batch.article_count || batch.articles?.length || 0, " \u7BC7)"] })] }), _jsxs("span", { className: "text-[11px] text-foreground-subtle", children: ["\u6267\u884C\u6A21\u5F0F: ", batch.publish_action === "schedule" ? "官方定时排期" : "官方草稿落盘"] })] }), _jsx("div", { className: "space-y-1.5", children: batch.articles && batch.articles.length > 0 ? (batch.articles.map((artTitle, aIdx) => (_jsxs("div", { className: "flex items-center justify-between gap-3 p-2 rounded-lg border border-border/60 bg-background/70 hover:bg-background transition-colors", children: [_jsx("span", { className: "font-medium text-foreground truncate", children: artTitle }), _jsxs("span", { className: "text-[11px] text-foreground-subtle font-mono shrink-0", children: ["#", aIdx + 1] })] }, aIdx)))) : (_jsx("div", { className: "text-foreground-subtle p-2", children: "\u672A\u8BB0\u5F55\u5230\u660E\u7EC6\u6761\u76EE" })) })] }))] }, batch.id));
                }) }))] }));
}
//# sourceMappingURL=SocialPlanHistoryView.js.map