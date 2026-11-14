import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from "react";
import { Button } from "../compat/components/ui/button.js";
import { RefreshCw, Calendar, CheckCircle2, AlertCircle, ShieldCheck, Monitor } from "lucide-react";
import { publisherApiFetch, safeParseJson, } from "./SocialPublisherTypes.js";
import { SocialPublisherTaskCard } from "./SocialPublisherTaskCard.js";
import { SocialPublisherLoginModal } from "./SocialPublisherLoginModal.js";
import { cn } from "../compat/components/lib/utils.js";
export function SocialPublisherScheduledSubTab({ gzhAccounts, socialPublisherRpc, }) {
    const [scheduledAccountId, setScheduledAccountId] = useState(() => gzhAccounts[0]?.id || "default");
    useEffect(() => {
        if (gzhAccounts.length > 0 && !gzhAccounts.some((a) => a.id === scheduledAccountId)) {
            setScheduledAccountId(gzhAccounts[0].id);
        }
    }, [gzhAccounts, scheduledAccountId]);
    const [scheduledTasks, setScheduledTasks] = useState([]);
    const [loadingScheduled, setLoadingScheduled] = useState(false);
    const [syncingScheduled, setSyncingScheduled] = useState(false);
    const [cancelingTaskId, setCancelingTaskId] = useState(null);
    const [activeCancelPopoverId, setActiveCancelPopoverId] = useState(null);
    const [lastSyncTime, setLastSyncTime] = useState(null);
    const [statusMessage, setStatusMessage] = useState(null);
    const [loginModalOpen, setLoginModalOpen] = useState(false);
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
                const firstTask = loadedTasks[0];
                if (firstTask?.synced_at) {
                    setLastSyncTime(firstTask.synced_at);
                }
            }
        }
        catch (err) {
            console.warn("[SocialPublisherScheduledSubTab] 加载微信排期任务列表失败:", err);
        }
        finally {
            setLoadingScheduled(false);
        }
    }, [socialPublisherRpc]);
    useEffect(() => {
        fetchScheduledTasks(scheduledAccountId);
        const handleScheduledUpdated = (e) => {
            const acc = e?.detail?.accountId || e?.detail?.account_id;
            if (!acc || acc === scheduledAccountId) {
                fetchScheduledTasks(scheduledAccountId);
            }
        };
        window.addEventListener("social-publisher:scheduled-updated", handleScheduledUpdated);
        return () => {
            window.removeEventListener("social-publisher:scheduled-updated", handleScheduledUpdated);
        };
    }, [fetchScheduledTasks, scheduledAccountId]);
    const triggerSyncScheduled = async () => {
        if (!scheduledAccountId)
            return;
        setSyncingScheduled(true);
        setStatusMessage(null);
        try {
            const res = await publisherApiFetch("/api/gzh-publisher/tasks/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ account_id: scheduledAccountId }),
            }, socialPublisherRpc);
            const parsed = await safeParseJson(res);
            if (parsed.ok && parsed.data?.ok) {
                const syncedTasks = parsed.data.tasks || [];
                setScheduledTasks(syncedTasks);
                setLastSyncTime(new Date().toISOString());
                setStatusMessage({
                    type: "success",
                    text: `同步成功！已从微信后台首页获取到 ${syncedTasks.length} 项定时发表任务。`,
                });
            }
            else {
                const errText = String(parsed.error || parsed.data?.error || "");
                const displayErr = errText && !errText.includes("fetch failed")
                    ? errText
                    : "微信公众号排期同步响应超时，请稍后重试";
                setStatusMessage({
                    type: "error",
                    text: `同步失败: ${displayErr}`,
                });
            }
        }
        catch (e) {
            const errText = String(e?.message || "");
            const displayErr = errText && !errText.includes("fetch failed") ? errText : "微信后台同步服务连接超时，请重试";
            setStatusMessage({
                type: "error",
                text: `同步异常: ${displayErr}`,
            });
        }
        finally {
            setSyncingScheduled(false);
        }
    };
    const handleCancelScheduledTask = async (task) => {
        if (!task.id || !scheduledAccountId)
            return;
        setCancelingTaskId(task.id);
        setStatusMessage(null);
        try {
            const res = await publisherApiFetch("/api/gzh-publisher/tasks/cancel", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    account_id: scheduledAccountId,
                    task_id: task.id,
                    title: task.articles?.[0]?.title,
                    display_time: task.display_time,
                }),
            }, socialPublisherRpc);
            const parsed = await safeParseJson(res);
            if (parsed.ok && (parsed.data?.ok || parsed.data?.success)) {
                setScheduledTasks((prev) => prev.filter((t) => t.id !== task.id));
                setStatusMessage({
                    type: "success",
                    text: `取消成功！已在微信后台与本地注销「${task.display_time}」的定时发表任务，群发通知次数已恢复。`,
                });
            }
            else {
                setStatusMessage({
                    type: "error",
                    text: `取消发表失败: ${parsed.error || parsed.data?.error || "微信后台执行取消失败，请确认微信登录态有效"}`,
                });
            }
        }
        catch (err) {
            setStatusMessage({
                type: "error",
                text: `取消发表异常: ${err.message || "请求取消接口失败"}`,
            });
        }
        finally {
            setCancelingTaskId(null);
        }
    };
    const currentGzhAccount = gzhAccounts.find((a) => a.id === scheduledAccountId) || gzhAccounts[0] || {};
    return (_jsxs("div", { className: "space-y-4", "data-testid": "social-publisher-scheduled-subtab", children: [_jsxs("div", { className: "flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-card-border bg-card/60 p-4 shadow-2xs backdrop-blur-md", children: [_jsxs("div", { className: "space-y-1", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Calendar, { className: "size-4 text-emerald-600 dark:text-emerald-400" }), _jsx("h3", { className: "text-ui-base font-bold text-foreground", children: "\u5FAE\u4FE1\u516C\u4F17\u5E73\u53F0\u5B98\u65B9\u6392\u671F\u4EFB\u52A1" }), _jsx("span", { className: "rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-ui-xs font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20", children: "\u5FAE\u4FE1\u540E\u53F0\u76F4\u8FDE\u6258\u7BA1" })] }), _jsx("p", { className: "text-ui-xs text-foreground-subtle", children: "\u76F4\u901A\u5FAE\u4FE1\u516C\u4F17\u5E73\u53F0\u9996\u9875\u5B9A\u65F6\u53D1\u8868\u5361\u7247\u3002\u6392\u671F\u53D1\u5E03\u65F6\u5C06\u81EA\u52A8\u8BFB\u53D6\u5DF2\u6709\u6392\u671F\uFF0C\u675C\u7EDD\u65F6\u95F4\u649E\u8F66\u4E0E\u6587\u7AE0\u91CD\u590D\u53D1\u8868\u3002" })] }), _jsxs("div", { className: "flex flex-wrap items-center gap-2 w-full sm:w-auto", children: [gzhAccounts.length > 1 && (_jsx("select", { "aria-label": "\u9009\u62E9\u5FAE\u4FE1\u516C\u4F17\u53F7\u8D26\u53F7", className: "h-8 rounded-lg border border-border bg-background px-2.5 text-ui-xs text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-primary", value: scheduledAccountId, onChange: (e) => setScheduledAccountId(e.target.value), children: gzhAccounts.map((acc) => (_jsxs("option", { value: acc.id, children: [acc.name || acc.id, " (", acc.id, ")"] }, acc.id))) })), _jsxs(Button, { type: "button", variant: "default", size: "sm", onClick: () => setLoginModalOpen(true), className: "h-8 text-ui-xs gap-1.5 shrink-0", children: [_jsx(Monitor, { className: "size-3.5" }), _jsx("span", { children: "\u5185\u7F6E\u6D4F\u89C8\u5668\u767B\u5F55" })] }), _jsxs(Button, { type: "button", variant: "outline", size: "sm", onClick: triggerSyncScheduled, disabled: syncingScheduled || loadingScheduled, className: "h-8 text-ui-xs gap-1.5 shrink-0", children: [_jsx(RefreshCw, { className: cn("size-3.5", syncingScheduled && "animate-spin") }), _jsx("span", { children: syncingScheduled ? "同步中..." : "立即同步微信排期" })] })] })] }), statusMessage && (_jsxs("div", { className: cn("flex items-center justify-between gap-3 p-3 rounded-xl text-ui-xs border", statusMessage.type === "success"
                    ? "bg-emerald-500/[0.08] border-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                    : "bg-destructive/[0.08] border-destructive/20 text-destructive"), children: [_jsxs("div", { className: "flex items-center gap-2", children: [statusMessage.type === "success" ? (_jsx(CheckCircle2, { className: "size-4 shrink-0 text-emerald-600 dark:text-emerald-400" })) : (_jsx(AlertCircle, { className: "size-4 shrink-0 text-destructive" })), _jsx("span", { className: "font-medium", children: statusMessage.text })] }), statusMessage.type === "error" &&
                        (statusMessage.text.includes("未登录") || statusMessage.text.includes("失效")) && (_jsxs(Button, { type: "button", variant: "outline", size: "sm", onClick: () => setLoginModalOpen(true), className: "h-7 text-ui-xs shrink-0 bg-background/60 hover:bg-background border-destructive/30 text-destructive", children: [_jsx(Monitor, { className: "size-3 mr-1" }), _jsx("span", { children: "\u626B\u7801\u767B\u5F55\u8BE5\u516C\u4F17\u53F7" })] }))] })), _jsxs("div", { className: "flex items-start gap-2.5 rounded-xl border border-sky-500/20 bg-sky-500/[0.04] p-3 text-ui-xs text-foreground-subtle", children: [_jsx(ShieldCheck, { className: "size-4 text-sky-500 mt-0.5 shrink-0" }), _jsxs("div", { children: [_jsx("span", { className: "font-semibold text-foreground", children: "\u667A\u80FD\u6392\u671F\u4E0E\u914D\u989D\u907F\u8BA9\u4FDD\u62A4\u5DF2\u6FC0\u6D3B\uFF1A" }), _jsxs("span", { className: "text-foreground-subtle ml-1", children: ["\u7CFB\u7EDF\u6267\u884C ", _jsx("code", { children: "/gzh" }), "\u3001", _jsx("code", { children: "/publish" }), " ", "\u6216\u5B9A\u65F6\u53D1\u5E03\u65F6\uFF0C\u4F1A\u4F18\u5148\u6BD4\u5BF9\u4E0B\u5217\u6392\u671F\u4EFB\u52A1\u3002\u82E5\u68C0\u6D4B\u5230\u65F6\u95F4\u51B2\u7A81\u6216\u7FA4\u53D1\u901A\u77E5\u914D\u989D\u5DF2\u5360\u6EE1\uFF0C\u7CFB\u7EDF\u5C06\u81EA\u52A8\u987A\u5EF6\u81F3\u4E0B\u4E00\u4E2A\u7A7A\u95F2\u69FD\u4F4D\u3002", lastSyncTime && (_jsxs("span", { className: "ml-2 text-foreground-subtle", children: ["(\u4E0A\u6B21\u540C\u6B65\u65F6\u95F4: ", new Date(lastSyncTime).toLocaleTimeString("zh-CN"), ")"] }))] })] })] }), _jsxs("div", { className: "rounded-xl border border-card-border bg-card/70 overflow-hidden shadow-2xs backdrop-blur-md", children: [_jsxs("div", { className: "flex items-center justify-between border-b border-border/70 bg-surface/60 px-4 py-2.5", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "font-semibold text-ui-sm text-foreground", children: "\u5FAE\u4FE1\u540E\u53F0\u6392\u671F\u5217\u8868" }), _jsxs("span", { className: "text-ui-xs text-foreground-subtle", children: ["(", scheduledTasks.length, " \u9879\u6392\u671F\u6258\u7BA1\u4E2D)"] })] }), _jsxs("span", { className: "text-ui-xs text-foreground-subtle", children: ["\u5F53\u524D\u8D26\u53F7\uFF1A", currentGzhAccount.name || currentGzhAccount.id] })] }), loadingScheduled && scheduledTasks.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center p-12 text-foreground-subtle space-y-2", children: [_jsx(RefreshCw, { className: "size-6 animate-spin text-primary" }), _jsx("span", { className: "text-ui-sm", children: "\u6B63\u5728\u52A0\u8F7D\u6392\u671F\u4EFB\u52A1\u5217\u8868..." })] })) : scheduledTasks.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center p-12 text-center space-y-3", children: [_jsx("div", { className: "size-12 rounded-full bg-surface-active/60 flex items-center justify-center text-foreground-subtle", children: _jsx(Calendar, { className: "size-6 opacity-40" }) }), _jsxs("div", { className: "space-y-1", children: [_jsx("div", { className: "text-ui-sm font-semibold text-foreground", children: "\u6682\u65E0\u5FAE\u4FE1\u5E73\u53F0\u6392\u671F\u4EFB\u52A1" }), _jsxs("p", { className: "text-ui-xs text-foreground-subtle max-w-md", children: ["\u5FAE\u4FE1\u516C\u4F17\u5E73\u53F0\u540E\u53F0\u5F53\u524D\u6CA1\u6709\u6392\u671F\u7684\u5B9A\u65F6\u4EFB\u52A1\u3002\u5728\u4F1A\u8BDD\u4E2D\u901A\u8FC7 ", _jsx("code", { children: "/gzh" }), " ", "\u751F\u6210\u957F\u6587\u5E76\u9009\u62E9\u5B9A\u65F6\u53D1\u5E03\uFF0C\u5FAE\u4FE1\u5B98\u65B9\u540E\u53F0\u5C06\u76F4\u63A5\u63A5\u7BA1\u6392\u671F\uFF0C\u4EFB\u52A1\u5C06\u5728\u6B64\u5904\u5B8C\u6574\u5C55\u793A\u3002"] })] }), _jsxs(Button, { type: "button", variant: "outline", size: "sm", onClick: triggerSyncScheduled, disabled: syncingScheduled, className: "mt-2 text-ui-xs", children: [_jsx(RefreshCw, { className: cn("size-3.5 mr-1.5", syncingScheduled && "animate-spin") }), "\u7ACB\u5373\u62C9\u53D6\u5FAE\u4FE1\u540E\u53F0\u9996\u9875\u6392\u671F"] })] })) : (_jsx("div", { className: "divide-y divide-border/60", children: scheduledTasks.map((task, idx) => (_jsx(SocialPublisherTaskCard, { task: task, index: idx, syncing: syncingScheduled, cancelingTaskId: cancelingTaskId, activeCancelPopoverId: activeCancelPopoverId, onToggleCancelPopover: setActiveCancelPopoverId, onCancelTask: handleCancelScheduledTask }, task.id || idx))) }))] }), _jsx(SocialPublisherLoginModal, { open: loginModalOpen, onOpenChange: setLoginModalOpen, platform: "gzh", accountId: scheduledAccountId, accountName: currentGzhAccount.name || scheduledAccountId, onLoginSuccess: () => {
                    triggerSyncScheduled();
                } })] }));
}
//# sourceMappingURL=SocialPublisherScheduledSubTab.js.map