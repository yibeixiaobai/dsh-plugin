import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from "react";
import { Button } from "../compat/components/ui/button.js";
import { RefreshCw, History, Calendar, Layers, Clock, Search, Check, AlertCircle, ChevronDown, ChevronUp, } from "lucide-react";
import { publisherApiFetch, safeParseJson, } from "./SocialPublisherTypes.js";
import { cn } from "../compat/components/lib/utils.js";
export function SocialPublisherHistorySubTab({ allAccounts, socialPublisherRpc, }) {
    const [selectedAccountId, setSelectedAccountId] = useState("all");
    const [selectedPlatform, setSelectedPlatform] = useState("all");
    const [keyword, setKeyword] = useState("");
    const [historyRecords, setHistoryRecords] = useState([]);
    const [historySummary, setHistorySummary] = useState({
        total_batches: 0,
        total_articles: 0,
        success_count: 0,
        scheduled_count: 0,
        draft_saved_count: 0,
        failed_count: 0,
    });
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
                setHistorySummary({
                    total_batches: parsed.data.total_batches ?? records.length,
                    total_articles: parsed.data.total_articles ??
                        records.reduce((acc, r) => acc + (r.article_count || 0), 0),
                    success_count: s.success_count ??
                        records.filter((r) => r.status === "success" || r.publish_status === "published")
                            .length,
                    scheduled_count: s.scheduled_count ??
                        records.filter((r) => r.publish_action === "schedule" || r.publish_status === "scheduled").length,
                    draft_saved_count: s.draft_saved_count ??
                        records.filter((r) => r.publish_action === "draft" || r.publish_status === "draft_saved").length,
                    failed_count: s.failed_count ??
                        records.filter((r) => r.status === "failed" || r.publish_status === "failed").length,
                });
            }
        }
        catch (err) {
            console.warn("[SocialPublisherHistorySubTab] 加载发布历史失败:", err);
        }
        finally {
            setLoadingHistory(false);
        }
    }, [selectedAccountId, selectedPlatform, keyword, socialPublisherRpc]);
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
    return (_jsxs("div", { className: "space-y-4", "data-testid": "social-publisher-history-subtab", children: [_jsxs("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-3", children: [_jsxs("div", { className: "rounded-xl border border-card-border bg-card/60 p-3.5 flex flex-col gap-1 shadow-2xs backdrop-blur-md", children: [_jsx("span", { className: "text-ui-xs text-foreground-subtle font-medium", children: "\u7D2F\u8BA1\u6267\u884C\u6279\u6B21" }), _jsxs("div", { className: "flex items-baseline gap-1.5", children: [_jsx("span", { className: "text-ui-lg font-bold text-foreground", children: historySummary.total_batches }), _jsx("span", { className: "text-ui-xs text-foreground-subtle", children: "\u6279\u6B21" })] })] }), _jsxs("div", { className: "rounded-xl border border-card-border bg-card/60 p-3.5 flex flex-col gap-1 shadow-2xs backdrop-blur-md", children: [_jsx("span", { className: "text-ui-xs text-foreground-subtle font-medium", children: "\u4EA7\u51FA\u56FE\u6587\u603B\u91CF" }), _jsxs("div", { className: "flex items-baseline gap-1.5", children: [_jsx("span", { className: "text-ui-lg font-bold text-foreground", children: historySummary.total_articles }), _jsx("span", { className: "text-ui-xs text-foreground-subtle", children: "\u7BC7" })] })] }), _jsxs("div", { className: "rounded-xl border border-emerald-500/25 bg-emerald-500/[0.05] p-3.5 flex flex-col gap-1 shadow-2xs", children: [_jsx("span", { className: "text-ui-xs text-emerald-600 dark:text-emerald-400 font-medium", children: "\u5B98\u65B9\u6392\u671F\u6258\u7BA1" }), _jsxs("div", { className: "flex items-baseline gap-1.5", children: [_jsx("span", { className: "text-ui-lg font-bold text-emerald-600 dark:text-emerald-400", children: historySummary.scheduled_count }), _jsx("span", { className: "text-ui-xs text-emerald-600/70", children: "\u9879" })] })] }), _jsxs("div", { className: "rounded-xl border border-sky-500/25 bg-sky-500/[0.05] p-3.5 flex flex-col gap-1 shadow-2xs", children: [_jsx("span", { className: "text-ui-xs text-sky-600 dark:text-sky-400 font-medium", children: "\u5B58\u5165\u8349\u7A3F\u7BB1" }), _jsxs("div", { className: "flex items-baseline gap-1.5", children: [_jsx("span", { className: "text-ui-lg font-bold text-sky-600 dark:text-sky-400", children: historySummary.draft_saved_count }), _jsx("span", { className: "text-ui-xs text-sky-600/70", children: "\u9879" })] })] })] }), _jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-card-border bg-card/60 p-3 text-ui-xs shadow-2xs backdrop-blur-md", children: [_jsxs("div", { className: "flex items-center gap-2 flex-wrap flex-1 min-w-[240px]", children: [_jsxs("select", { "aria-label": "\u7B5B\u9009\u6267\u884C\u8D26\u53F7", className: "h-8 rounded-lg border border-border bg-background px-2.5 text-ui-xs text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-primary", value: selectedAccountId, onChange: (e) => setSelectedAccountId(e.target.value), children: [_jsx("option", { value: "all", children: "\u5168\u90E8\u6267\u884C\u8D26\u53F7" }), allAccounts.map((acc) => (_jsxs("option", { value: acc.id, children: [acc.name || acc.id, " (", acc.platform || "gzh", ")"] }, acc.id)))] }), _jsxs("select", { "aria-label": "\u7B5B\u9009\u53D1\u5E03\u5E73\u53F0", className: "h-8 rounded-lg border border-border bg-background px-2.5 text-ui-xs text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-primary", value: selectedPlatform, onChange: (e) => setSelectedPlatform(e.target.value), children: [_jsx("option", { value: "all", children: "\u5168\u90E8\u793E\u5A92\u5E73\u53F0" }), _jsx("option", { value: "gzh", children: "\u5FAE\u4FE1\u516C\u4F17\u53F7" }), _jsx("option", { value: "xiaohongshu", children: "\u5C0F\u7EA2\u4E66" }), _jsx("option", { value: "zhihu", children: "\u77E5\u4E4E" }), _jsx("option", { value: "baijiahao", children: "\u767E\u5BB6\u53F7" }), _jsx("option", { value: "toutiao", children: "\u4ECA\u65E5\u5934\u6761" })] }), _jsxs("div", { className: "relative flex-1 min-w-[160px] max-w-xs", children: [_jsx(Search, { className: "size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground-subtle pointer-events-none" }), _jsx("input", { type: "text", placeholder: "\u641C\u7D22\u6587\u7AE0\u6807\u9898\u6216\u8D26\u53F7...", value: keyword, onChange: (e) => setKeyword(e.target.value), className: "h-8 w-full rounded-lg border border-border bg-background pl-8 pr-2.5 text-ui-xs text-foreground placeholder:text-foreground-subtle/60 focus:outline-none focus:ring-1 focus:ring-primary" })] })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("span", { className: "text-ui-xs text-foreground-subtle hidden sm:inline", children: ["\u5171 ", historyRecords.length, " \u9879\u4F1A\u8BDD\u6279\u6B21"] }), _jsxs(Button, { type: "button", variant: "outline", size: "sm", onClick: fetchHistory, disabled: loadingHistory, className: "h-8 text-ui-xs gap-1.5", children: [_jsx(RefreshCw, { className: cn("size-3.5", loadingHistory && "animate-spin") }), _jsx("span", { children: "\u5237\u65B0" })] })] })] }), loadingHistory && historyRecords.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center p-12 text-foreground-subtle space-y-2 rounded-2xl border border-card-border bg-card/40", children: [_jsx(RefreshCw, { className: "size-6 animate-spin text-primary" }), _jsx("span", { className: "text-ui-sm", children: "\u6B63\u5728\u52A0\u8F7D\u4EFB\u52A1\u6267\u884C\u4F1A\u8BDD\u8BB0\u5F55..." })] })) : historyRecords.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center p-12 text-center space-y-3 rounded-2xl border border-card-border bg-card/40", children: [_jsx("div", { className: "size-12 rounded-full bg-surface-active/60 flex items-center justify-center text-foreground-subtle", children: _jsx(History, { className: "size-6 opacity-40" }) }), _jsxs("div", { className: "space-y-1", children: [_jsx("div", { className: "text-ui-sm font-semibold text-foreground", children: "\u6682\u65E0\u793E\u5A92\u4EFB\u52A1\u6267\u884C\u8BB0\u5F55" }), _jsxs("p", { className: "text-ui-xs text-foreground-subtle max-w-md", children: ["\u5728\u4E3B\u5BF9\u8BDD\u6846\u4E2D\u4F7F\u7528 ", _jsx("code", { children: "/gzh" }), " \u6216 ", _jsx("code", { children: "/publish" }), " ", "\u53D1\u8D77\u5185\u5BB9\u751F\u4EA7\u4E0E\u53D1\u5E03\uFF0C\u7CFB\u7EDF\u4F1A\u81EA\u52A8\u8BB0\u5F55\u5B8C\u6574\u7684\u6267\u884C\u6279\u6B21\u3001\u6587\u7AE0\u6210\u679C\u3001\u6392\u671F\u65F6\u95F4\u4E0E\u5B98\u65B9\u56DE\u6267\u51ED\u8BC1\u3002"] })] })] })) : (_jsx("div", { className: "space-y-3", children: historyRecords.map((batch) => {
                    const isExpanded = expandedBatchIds.has(batch.id);
                    const isScheduled = batch.publish_action === "schedule" || batch.publish_status === "scheduled";
                    const isFailed = batch.status === "failed" || batch.publish_status === "failed";
                    const timeStr = batch.timestamp
                        ? new Date(batch.timestamp).toLocaleString("zh-CN")
                        : "刚刚";
                    return (_jsxs("div", { className: "overflow-hidden rounded-xl border border-card-border bg-card/70 hover:bg-card transition-all shadow-2xs backdrop-blur-md", children: [_jsxs("div", { onClick: () => toggleExpandBatch(batch.id), className: "flex items-center justify-between gap-3 p-3.5 cursor-pointer select-none", children: [_jsxs("div", { className: "flex items-center gap-3 min-w-0", children: [_jsx("div", { className: cn("flex size-8 shrink-0 items-center justify-center rounded-lg border", isFailed
                                                    ? "bg-destructive/10 border-destructive/25 text-destructive"
                                                    : isScheduled
                                                        ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400"
                                                        : "bg-primary/10 border-primary/25 text-primary"), children: isFailed ? (_jsx(AlertCircle, { className: "size-4" })) : isScheduled ? (_jsx(Calendar, { className: "size-4" })) : (_jsx(Check, { className: "size-4" })) }), _jsxs("div", { className: "min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [_jsx("span", { className: "font-semibold text-ui-sm text-foreground truncate max-w-xs sm:max-w-md", children: batch.articles?.[0] || "社媒图文内容批次" }), batch.article_count > 1 && (_jsxs("span", { className: "rounded-full bg-surface-active px-2 py-0.5 text-ui-xs font-medium text-foreground-subtle border border-border/60", children: ["\u5171 ", batch.article_count, " \u7BC7"] })), _jsx("span", { className: cn("rounded-full px-2 py-0.5 text-ui-xs font-medium border", isFailed
                                                                    ? "bg-destructive/10 border-destructive/25 text-destructive"
                                                                    : isScheduled
                                                                        ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400"
                                                                        : "bg-sky-500/10 border-sky-500/25 text-sky-600 dark:text-sky-400"), children: isFailed ? "执行失败" : isScheduled ? "已排期" : "已入草稿箱" })] }), _jsxs("div", { className: "flex items-center gap-2 text-ui-xs text-foreground-subtle mt-0.5 flex-wrap", children: [_jsxs("span", { children: ["\u8D26\u53F7: ", batch.account_id || "default"] }), _jsx("span", { children: "\u00B7" }), _jsxs("span", { children: ["\u5E73\u53F0: ", batch.platform || "gzh"] }), _jsx("span", { children: "\u00B7" }), _jsxs("span", { className: "flex items-center gap-1", children: [_jsx(Clock, { className: "size-3" }), _jsx("span", { children: timeStr })] })] })] })] }), _jsx("div", { className: "flex items-center gap-2 shrink-0", children: _jsx(Button, { type: "button", variant: "ghost", size: "sm", className: "size-7 p-0 text-foreground-subtle", title: isExpanded ? "收起详情" : "展开详情", children: isExpanded ? (_jsx(ChevronUp, { className: "size-4" })) : (_jsx(ChevronDown, { className: "size-4" })) }) })] }), isExpanded && (_jsxs("div", { className: "border-t border-border/60 bg-surface/40 p-4 space-y-3 text-ui-xs", children: [_jsxs("div", { className: "font-semibold text-foreground flex items-center gap-1.5", children: [_jsx(Layers, { className: "size-3.5 text-primary" }), _jsxs("span", { children: ["\u6279\u6B21\u6587\u7AE0\u6E05\u5355 (", batch.article_count, " \u7BC7)"] })] }), _jsx("div", { className: "space-y-2", children: batch.articles && batch.articles.length > 0 ? (batch.articles.map((artTitle, aIdx) => (_jsxs("div", { className: "flex items-center justify-between gap-3 p-2.5 rounded-lg border border-border/60 bg-background/60", children: [_jsx("span", { className: "font-medium text-foreground truncate", children: artTitle }), _jsxs("span", { className: "text-foreground-subtle shrink-0", children: ["\u7B2C ", aIdx + 1, " \u7BC7"] })] }, aIdx)))) : (_jsx("div", { className: "text-foreground-subtle", children: "\u6682\u65E0\u8BE6\u7EC6\u6587\u7AE0\u8BB0\u5F55" })) })] }))] }, batch.id));
                }) }))] }));
}
//# sourceMappingURL=SocialPublisherHistorySubTab.js.map