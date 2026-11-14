import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from "react";
import { Calendar, CheckCircle2, AlertCircle, ShieldCheck, RefreshCw, } from "lucide-react";
import { publisherApiFetch, safeParseJson, } from "../../settings/SocialPublisherTypes.js";
import { SocialPublisherTaskCard } from "../../settings/SocialPublisherTaskCard.js";
import { cn } from "../../compat/components/lib/utils.js";
export function SocialPlanScheduledView({ currentAccountId, accountName, socialPublisherRpc, onScheduledCountChange, refreshKey = 0, }) {
    const [scheduledTasks, setScheduledTasks] = useState([]);
    const [loadingScheduled, setLoadingScheduled] = useState(false);
    const [cancelingTaskId, setCancelingTaskId] = useState(null);
    const [activeCancelPopoverId, setActiveCancelPopoverId] = useState(null);
    const [lastSyncTime, setLastSyncTime] = useState(null);
    const [statusMessage, setStatusMessage] = useState(null);
    const fetchScheduledTasks = useCallback(async (accountId) => {
        if (!accountId)
            return;
        setLoadingScheduled(true);
        setStatusMessage(null);
        try {
            const res = await publisherApiFetch(`/api/gzh-publisher/tasks/list?account_id=${encodeURIComponent(accountId)}`, {}, socialPublisherRpc);
            const parsed = await safeParseJson(res);
            if (parsed.ok) {
                const loadedTasks = Array.isArray(parsed.data.tasks)
                    ? parsed.data.tasks
                    : [];
                setScheduledTasks(loadedTasks);
                onScheduledCountChange?.(loadedTasks.length);
                const firstTask = loadedTasks[0];
                if (firstTask?.synced_at) {
                    setLastSyncTime(firstTask.synced_at);
                }
            }
        }
        catch (err) {
            console.warn("[SocialPlanScheduledView] 加载微信排期任务列表失败:", err);
        }
        finally {
            setLoadingScheduled(false);
        }
    }, [socialPublisherRpc, onScheduledCountChange]);
    useEffect(() => {
        fetchScheduledTasks(currentAccountId);
        const handleScheduledUpdated = (e) => {
            const acc = e?.detail?.accountId || e?.detail?.account_id;
            if (!acc || acc === currentAccountId) {
                fetchScheduledTasks(currentAccountId);
            }
        };
        window.addEventListener("social-publisher:scheduled-updated", handleScheduledUpdated);
        return () => {
            window.removeEventListener("social-publisher:scheduled-updated", handleScheduledUpdated);
        };
    }, [fetchScheduledTasks, currentAccountId, refreshKey]);
    const handleCancelScheduledTask = async (task) => {
        if (!task.id || !currentAccountId)
            return;
        setCancelingTaskId(task.id);
        setStatusMessage(null);
        try {
            const res = await publisherApiFetch("/api/gzh-publisher/tasks/cancel", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    account_id: currentAccountId,
                    task_id: task.id,
                    title: task.articles?.[0]?.title,
                    display_time: task.display_time,
                }),
            }, socialPublisherRpc);
            const parsed = await safeParseJson(res);
            if (parsed.ok && (parsed.data?.ok || parsed.data?.success)) {
                setScheduledTasks((prev) => {
                    const updated = prev.filter((t) => t.id !== task.id);
                    onScheduledCountChange?.(updated.length);
                    return updated;
                });
                setStatusMessage({
                    type: "success",
                    text: `已在微信公众平台注销「${task.display_time}」的排期任务，群发通知配额已返还。`,
                });
            }
            else {
                setStatusMessage({
                    type: "error",
                    text: `取消排期失败: ${parsed.error || parsed.data?.error || "请确认微信授权登录态有效"}`,
                });
            }
        }
        catch (err) {
            setStatusMessage({
                type: "error",
                text: `取消排期异常: ${err.message || "请求取消接口失败"}`,
            });
        }
        finally {
            setCancelingTaskId(null);
        }
    };
    const displayName = accountName || currentAccountId || "默认公众号";
    return (_jsxs("div", { className: "space-y-3.5", "data-testid": "social-plan-scheduled-view", children: [_jsxs("div", { className: "flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 rounded-xl border border-card-border/80 bg-card/60 px-4 py-3 shadow-2xs backdrop-blur-md", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Calendar, { className: "size-4 text-emerald-600 dark:text-emerald-400" }), _jsx("span", { className: "text-ui-sm font-semibold text-foreground", children: "\u5FAE\u4FE1\u516C\u4F17\u5E73\u53F0\u5B98\u65B9\u6392\u671F\u6E05\u5355" }), _jsxs("span", { className: "rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-mono font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20", children: [scheduledTasks.length, " \u9879\u6392\u671F\u4E2D"] })] }), _jsxs("div", { className: "flex items-center gap-2 text-[11px] text-foreground-subtle", children: [_jsxs("span", { children: ["\u5F53\u524D\u8D26\u53F7: ", _jsx("strong", { className: "text-foreground font-medium", children: displayName })] }), lastSyncTime ? (_jsxs("span", { className: "hidden md:inline font-mono text-foreground-subtle/70", children: ["\u00B7 \u4E0A\u6B21\u540C\u6B65: ", new Date(lastSyncTime).toLocaleTimeString("zh-CN")] })) : null] })] }), statusMessage ? (_jsx("div", { className: cn("flex items-center justify-between gap-3 p-3 rounded-xl text-ui-xs border", statusMessage.type === "success"
                    ? "bg-emerald-500/[0.08] border-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                    : "bg-destructive/[0.08] border-destructive/20 text-destructive"), children: _jsxs("div", { className: "flex items-center gap-2", children: [statusMessage.type === "success" ? (_jsx(CheckCircle2, { className: "size-4 shrink-0 text-emerald-600 dark:text-emerald-400" })) : (_jsx(AlertCircle, { className: "size-4 shrink-0 text-destructive" })), _jsx("span", { className: "font-medium", children: statusMessage.text })] }) })) : null, _jsxs("div", { className: "flex items-start gap-2.5 rounded-xl border border-sky-500/20 bg-sky-500/[0.04] p-3 text-ui-xs text-foreground-subtle", children: [_jsx(ShieldCheck, { className: "size-4 text-sky-500 mt-0.5 shrink-0" }), _jsxs("div", { className: "leading-relaxed", children: [_jsx("span", { className: "font-semibold text-foreground", children: "\u667A\u80FD\u6392\u671F\u65F6\u6BB5\u9632\u649E\u8F66\u4FDD\u62A4\uFF1A" }), _jsxs("span", { className: "text-foreground-subtle ml-1", children: ["\u6267\u884C ", _jsx("code", { children: "/publish" }), " \u5B9A\u65F6\u53D1\u5E03\u65F6\uFF0C\u7CFB\u7EDF\u81EA\u52A8\u8BC6\u522B\u5E76\u987A\u5EF6\u6392\u671F\uFF0C\u907F\u514D\u4E0E\u4E0B\u65B9\u5FAE\u4FE1\u540E\u53F0\u5DF2\u6709\u4EFB\u52A1\u53D1\u751F\u69FD\u4F4D\u51B2\u7A81\u3002"] })] })] }), _jsx("div", { className: "rounded-xl border border-card-border/80 bg-card/70 overflow-hidden shadow-2xs backdrop-blur-md", children: loadingScheduled && scheduledTasks.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center p-12 text-foreground-subtle space-y-2", children: [_jsx(RefreshCw, { className: "size-5 animate-spin text-primary" }), _jsx("span", { className: "text-ui-sm font-medium", children: "\u6B63\u5728\u8BFB\u53D6\u6392\u671F\u7FA4\u53D1\u4EFB\u52A1..." })] })) : scheduledTasks.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center p-12 text-center space-y-3", children: [_jsx("div", { className: "size-11 rounded-full bg-surface-active/60 flex items-center justify-center text-foreground-subtle border border-border/40", children: _jsx(Calendar, { className: "size-5 opacity-60" }) }), _jsxs("div", { className: "space-y-1", children: [_jsx("div", { className: "text-ui-sm font-semibold text-foreground", children: "\u5F53\u524D\u516C\u4F17\u53F7\u6682\u65E0\u6392\u671F\u7FA4\u53D1\u4EFB\u52A1" }), _jsx("p", { className: "text-ui-xs text-foreground-subtle max-w-md mx-auto leading-relaxed", children: "\u5FAE\u4FE1\u516C\u4F17\u5E73\u53F0\u540E\u53F0\u5F53\u524D\u6CA1\u6709\u5F85\u7FA4\u53D1\u7684\u5B9A\u65F6\u6392\u671F\u3002\u53EF\u5728\u5BF9\u8BDD\u4E2D\u751F\u6210\u7A3F\u4EF6\u540E\u9009\u62E9\u5B9A\u65F6\u53D1\u5E03\uFF0C\u6216\u70B9\u51FB\u9876\u90E8\u7684\u300C\u4E00\u952E\u540C\u6B65\u6392\u671F\u4E0E\u8349\u7A3F\u300D\u83B7\u53D6\u540E\u53F0\u6700\u65B0\u6570\u636E\u3002" })] })] })) : (_jsx("div", { className: "divide-y divide-border/60 p-2 space-y-2", children: scheduledTasks.map((task, index) => (_jsx(SocialPublisherTaskCard, { task: task, index: index, syncing: loadingScheduled, cancelingTaskId: cancelingTaskId, activeCancelPopoverId: activeCancelPopoverId, onToggleCancelPopover: setActiveCancelPopoverId, onCancelTask: handleCancelScheduledTask }, task.id))) })) })] }));
}
//# sourceMappingURL=SocialPlanScheduledView.js.map