import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from "react";
import { TrendingUp, Eye, Heart, MessageSquare, Bookmark, Share2, Sparkles, RefreshCw } from "lucide-react";
import { useOptionalServices } from "../../compat/hooks/useServices.js";
import { publisherApiFetch, safeParseJson } from "../../settings/SocialPublisherTypes.js";
import { Button } from "../../compat/components/ui/button.js";
import { toast } from "../../compat/components/ui/toast.js";
export function SocialPlanAnalyticsView({ selectedAccountId, onRefresh: _unusedRefresh, }) {
    const services = useOptionalServices();
    const socialPublisherRpc = services?.socialPublisherService ?? null;
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [summary, setSummary] = useState({
        totalReads: 0,
        totalEngagements: 0,
        avgEngagementRate: 0,
        topArticles: [],
        topHookAngles: [],
    });
    const fetchMetrics = useCallback(async () => {
        setLoading(true);
        try {
            const q = selectedAccountId && selectedAccountId !== "all" ? `?account_id=${selectedAccountId}` : "";
            const res = await publisherApiFetch(`/api/gzh-publisher/analytics/metrics${q}`, {}, socialPublisherRpc);
            const parsed = await safeParseJson(res);
            if (parsed.ok && parsed.data.summary) {
                setSummary(parsed.data.summary);
            }
        }
        catch (err) {
            console.warn("[SocialPlanAnalyticsView] 加载数据表现失败:", err);
        }
        finally {
            setLoading(false);
        }
    }, [selectedAccountId, socialPublisherRpc]);
    useEffect(() => {
        fetchMetrics();
    }, [fetchMetrics]);
    // 按需从平台拉取最新数据
    const handleSyncLatest = async () => {
        setSyncing(true);
        try {
            const res = await publisherApiFetch("/api/gzh-publisher/analytics/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ account_id: selectedAccountId || "default" }),
            }, socialPublisherRpc);
            const parsed = await safeParseJson(res);
            if (parsed.ok) {
                toast("已成功从各平台按需同步最新数据表现！");
                await fetchMetrics();
            }
            else {
                toast("同步数据表现未完成，请重试");
            }
        }
        catch (err) {
            toast("拉取数据异常: " + (err instanceof Error ? err.message : String(err)));
        }
        finally {
            setSyncing(false);
        }
    };
    return (_jsxs("div", { "data-testid": "social-plan-analytics-view", className: "space-y-6", children: [_jsxs("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-3.5", children: [_jsxs("div", { className: "p-4 rounded-xl border border-card-border bg-card shadow-sm space-y-1", children: [_jsxs("div", { className: "flex items-center justify-between text-ui-2xs font-medium text-foreground-muted", children: [_jsx("span", { children: "\u603B\u9605\u8BFB/\u64AD\u653E\u91CF" }), _jsx(Eye, { className: "size-3.5 text-primary/70" })] }), _jsx("p", { className: "text-ui-xl font-bold font-mono tracking-tight text-foreground", children: summary.totalReads.toLocaleString() })] }), _jsxs("div", { className: "p-4 rounded-xl border border-card-border bg-card shadow-sm space-y-1", children: [_jsxs("div", { className: "flex items-center justify-between text-ui-2xs font-medium text-foreground-muted", children: [_jsx("span", { children: "\u603B\u4E92\u52A8\u603B\u91CF" }), _jsx(Heart, { className: "size-3.5 text-rose-500/70" })] }), _jsx("p", { className: "text-ui-xl font-bold font-mono tracking-tight text-foreground", children: summary.totalEngagements.toLocaleString() })] }), _jsxs("div", { className: "p-4 rounded-xl border border-card-border bg-card shadow-sm space-y-1", children: [_jsxs("div", { className: "flex items-center justify-between text-ui-2xs font-medium text-foreground-muted", children: [_jsx("span", { children: "\u5E73\u5747\u4E92\u52A8\u8F6C\u5316\u7387" }), _jsx(TrendingUp, { className: "size-3.5 text-emerald-500/70" })] }), _jsxs("p", { className: "text-ui-xl font-bold font-mono tracking-tight text-foreground", children: [summary.avgEngagementRate, "%"] })] }), _jsxs("div", { className: "p-4 rounded-xl border border-card-border bg-card shadow-sm flex flex-col justify-between", children: [_jsxs("div", { className: "flex items-center justify-between text-ui-2xs font-medium text-foreground-muted", children: [_jsx("span", { children: "\u6309\u9700\u540C\u6B65" }), _jsx(Sparkles, { className: "size-3.5 text-amber-500/70" })] }), _jsxs(Button, { size: "sm", variant: "outline", disabled: syncing || loading, onClick: handleSyncLatest, className: "w-full h-8 text-ui-2xs gap-1.5 mt-2 border-border/80", children: [_jsx(RefreshCw, { className: `size-3 ${syncing ? "animate-spin text-primary" : ""}` }), syncing ? "拉取中..." : "拉取最新表现"] })] })] }), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-6", children: [_jsxs("div", { className: "lg:col-span-1 p-5 rounded-2xl border border-card-border bg-card shadow-sm space-y-4", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Sparkles, { className: "size-4 text-primary" }), _jsx("h4", { className: "text-ui-sm font-semibold text-foreground", children: "\u9AD8\u70ED\u5EA6\u5207\u89D2\u6392\u884C" })] }), _jsx("p", { className: "text-ui-2xs text-foreground-muted", children: "\u7CFB\u7EDF\u6839\u636E\u4EE5\u4E0B\u9AD8\u4E92\u52A8\u5207\u89D2\u5728\u9009\u9898\u63A8\u8350\u4E2D\u81EA\u52A8\u7ED9\u4E88 +15% \u7206\u6B3E\u52A0\u6743\u3002" }), _jsx("div", { className: "space-y-2.5", children: summary.topHookAngles.length === 0 ? (_jsx("p", { className: "text-ui-2xs text-foreground-muted py-4 text-center", children: "\u6682\u65E0\u5207\u89D2\u7EDF\u8BA1\u6570\u636E" })) : (summary.topHookAngles.map((item, idx) => (_jsxs("div", { className: "flex items-center justify-between p-2.5 rounded-lg bg-surface-subtle border border-border/50 text-ui-xs", children: [_jsxs("div", { className: "flex items-center gap-2 min-w-0", children: [_jsx("span", { className: "size-5 rounded-full bg-primary/10 text-primary text-ui-2xs font-bold flex items-center justify-center flex-shrink-0", children: idx + 1 }), _jsx("span", { className: "font-medium text-foreground truncate", children: item.angle })] }), _jsxs("span", { className: "text-ui-2xs font-mono font-semibold text-primary flex-shrink-0 ml-2", children: [item.avgScore, " \u5206"] })] }, idx)))) })] }), _jsxs("div", { className: "lg:col-span-2 p-5 rounded-2xl border border-card-border bg-card shadow-sm space-y-4", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(TrendingUp, { className: "size-4 text-primary" }), _jsx("h4", { className: "text-ui-sm font-semibold text-foreground", children: "\u5DF2\u53D1\u56FE\u6587\u8868\u73B0\u6E05\u5355" })] }), _jsxs("span", { className: "text-ui-2xs text-foreground-muted font-mono", children: ["\u5171 ", summary.topArticles.length, " \u7BC7"] })] }), _jsx("div", { className: "space-y-2.5", children: summary.topArticles.length === 0 ? (_jsx("p", { className: "text-ui-2xs text-foreground-muted py-8 text-center", children: "\u6682\u65E0\u53D1\u5E03\u56FE\u6587\u8868\u73B0\u6570\u636E" })) : (summary.topArticles.map((art) => (_jsxs("div", { className: "flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl bg-surface-subtle border border-border/50 gap-2 hover:border-border transition-colors", children: [_jsxs("div", { className: "min-w-0 flex-1 space-y-1", children: [_jsx("p", { className: "text-ui-xs font-semibold text-foreground truncate", children: art.title }), _jsxs("div", { className: "flex items-center gap-2 text-ui-2xs text-foreground-muted", children: [_jsx("span", { className: "uppercase px-1 py-0.2 rounded bg-surface border border-border text-[10px]", children: art.platform }), _jsxs("span", { children: ["\u53D1\u5E03\u4E8E ", art.publishedAt.slice(0, 10)] })] })] }), _jsxs("div", { className: "flex items-center gap-3.5 text-ui-2xs text-foreground-muted font-mono flex-shrink-0", children: [_jsxs("span", { className: "flex items-center gap-1", title: "\u9605\u8BFB", children: [_jsx(Eye, { className: "size-3 text-foreground-muted/70" }), art.reads] }), _jsxs("span", { className: "flex items-center gap-1", title: "\u8D5E", children: [_jsx(Heart, { className: "size-3 text-rose-500/70" }), art.likes] }), _jsxs("span", { className: "flex items-center gap-1", title: "\u8BC4\u8BBA", children: [_jsx(MessageSquare, { className: "size-3 text-blue-500/70" }), art.comments] }), _jsxs("span", { className: "flex items-center gap-1", title: "\u6536\u85CF", children: [_jsx(Bookmark, { className: "size-3 text-amber-500/70" }), art.collects] }), _jsxs("span", { className: "flex items-center gap-1", title: "\u5206\u4EAB", children: [_jsx(Share2, { className: "size-3 text-emerald-500/70" }), art.shares] })] })] }, art.id)))) })] })] })] }));
}
//# sourceMappingURL=SocialPlanAnalyticsView.js.map