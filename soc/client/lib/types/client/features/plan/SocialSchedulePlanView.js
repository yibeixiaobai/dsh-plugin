import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback, useMemo } from "react";
import { History, Calendar, Archive, RefreshCw, CheckCircle2, BarChart3 } from "lucide-react";
import { useOptionalServices } from "../../compat/hooks/useServices.js";
import { publisherApiFetch, safeParseJson, normalizeAccountsList, DEFAULT_PUBLISHER_SECTION_CONFIG, } from "../../settings/SocialPublisherTypes.js";
import { SocialPublisherLoginModal } from "../../settings/SocialPublisherLoginModal.js";
import { SocialPlanAccountSelector } from "./SocialPlanAccountSelector.js";
import { SocialPlanMetrics } from "./SocialPlanMetrics.js";
import { SocialPlanHistoryView } from "./SocialPlanHistoryView.js";
import { SocialPlanScheduledView } from "./SocialPlanScheduledView.js";
import { SocialPlanDraftsView } from "./SocialPlanDraftsView.js";
import { SocialPlanAnalyticsView } from "./SocialPlanAnalyticsView.js";
import { Button } from "../../compat/components/ui/button.js";
import { cn } from "../../compat/components/lib/utils.js";
import { useWinCodeIntl } from "../../compat/i18n/IntlProvider.js";
export function SocialSchedulePlanView({ workspacePath: _unusedPath, workspaceIdentity: _unusedIdentity, }) {
    const { intl } = useWinCodeIntl();
    const services = useOptionalServices();
    const socialPublisherRpc = services?.socialPublisherService ?? null;
    const [activeTab, setActiveTab] = useState("scheduled");
    const [config, setConfig] = useState(DEFAULT_PUBLISHER_SECTION_CONFIG);
    const [selectedAccountId, setSelectedAccountId] = useState("default");
    const [loginModalOpen, setLoginModalOpen] = useState(false);
    const [loginModalAccountId, setLoginModalAccountId] = useState("default");
    // 全局唯一同步状态与结果提示
    const [globalSyncing, setGlobalSyncing] = useState(false);
    const [syncFeedback, setSyncFeedback] = useState(null);
    const [syncRefreshKey, setSyncRefreshKey] = useState(0);
    // 顶层看板统计
    const [summary, setSummary] = useState({
        totalBatches: 0,
        totalArticles: 0,
        scheduledCount: 0,
        draftSavedCount: 0,
    });
    const [scheduledCountsByAccount, setScheduledCountsByAccount] = useState({});
    const [draftCountsByAccount, setDraftCountsByAccount] = useState({});
    const fetchConfig = useCallback(async () => {
        try {
            const res = await publisherApiFetch("/api/gzh-publisher/config/export?include_secrets=true&download=false", {}, socialPublisherRpc);
            const parsed = await safeParseJson(res);
            if (parsed.ok) {
                const loadedCfg = parsed.data.config || parsed.data;
                if (loadedCfg && typeof loadedCfg === "object") {
                    setConfig(loadedCfg);
                    const list = normalizeAccountsList(loadedCfg.accounts);
                    if (list.length > 0) {
                        setSelectedAccountId((prev) => prev && list.some((a) => a.id === prev)
                            ? prev
                            : loadedCfg.default_account || list[0].id);
                    }
                }
            }
        }
        catch (err) {
            console.warn("[SocialSchedulePlanView] 拉取社媒配置失败:", err);
        }
    }, [socialPublisherRpc]);
    useEffect(() => {
        fetchConfig();
    }, [fetchConfig]);
    const allAccounts = useMemo(() => normalizeAccountsList(config?.accounts), [config?.accounts]);
    const gzhAccounts = useMemo(() => allAccounts.filter((a) => (a.platform || "gzh") === "gzh"), [allAccounts]);
    const currentAccount = useMemo(() => {
        return gzhAccounts.find((a) => a.id === selectedAccountId) || gzhAccounts[0] || {};
    }, [gzhAccounts, selectedAccountId]);
    // 全局唯一的“一键同步排期与草稿”
    const handleUnifiedSync = useCallback(async () => {
        const targetAccountId = selectedAccountId || currentAccount?.id || "default";
        setGlobalSyncing(true);
        setSyncFeedback(null);
        try {
            const [scheduledRes, draftsRes] = await Promise.allSettled([
                publisherApiFetch("/api/gzh-publisher/tasks/sync", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ account_id: targetAccountId }),
                }, socialPublisherRpc),
                publisherApiFetch("/api/gzh-publisher/drafts/sync", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ account_id: targetAccountId }),
                }, socialPublisherRpc),
            ]);
            let scheduledFound = 0;
            let draftsFound = 0;
            if (scheduledRes.status === "fulfilled") {
                const p = await safeParseJson(scheduledRes.value);
                if (p.ok && Array.isArray(p.data?.tasks)) {
                    scheduledFound = p.data.tasks.length;
                    setScheduledCountsByAccount((prev) => ({ ...prev, [targetAccountId]: scheduledFound }));
                    setSummary((prev) => ({ ...prev, scheduledCount: scheduledFound }));
                }
            }
            if (draftsRes.status === "fulfilled") {
                const p = await safeParseJson(draftsRes.value);
                if (p.ok && Array.isArray(p.data?.drafts)) {
                    draftsFound = p.data.drafts.length;
                    setDraftCountsByAccount((prev) => ({ ...prev, [targetAccountId]: draftsFound }));
                    setSummary((prev) => ({ ...prev, draftSavedCount: draftsFound }));
                }
            }
            setSyncRefreshKey((k) => k + 1);
            setSyncFeedback(`同步成功！当前公众号已完成同步：发现 ${scheduledFound} 项官方排期，${draftsFound} 篇官方草稿。`);
        }
        catch (err) {
            setSyncFeedback(`同步完成，部分网络响应延迟：${err?.message || "可直接刷新查看"}`);
        }
        finally {
            setGlobalSyncing(false);
        }
    }, [selectedAccountId, currentAccount?.id, socialPublisherRpc]);
    const handleOpenAccountLogin = useCallback((accountId) => {
        setLoginModalAccountId(accountId);
        setLoginModalOpen(true);
    }, []);
    const handleHistorySummaryChange = useCallback((s) => {
        setSummary((prev) => ({
            ...prev,
            totalBatches: s.totalBatches,
            totalArticles: s.totalArticles,
            scheduledCount: s.scheduledCount || prev.scheduledCount,
            draftSavedCount: s.draftSavedCount || prev.draftSavedCount,
        }));
    }, []);
    const handleScheduledCountChange = useCallback((count) => {
        setSummary((prev) => ({ ...prev, scheduledCount: count }));
        if (selectedAccountId) {
            setScheduledCountsByAccount((prev) => ({ ...prev, [selectedAccountId]: count }));
        }
    }, [selectedAccountId]);
    const handleDraftCountChange = useCallback((count) => {
        setSummary((prev) => ({ ...prev, draftSavedCount: count }));
        if (selectedAccountId) {
            setDraftCountsByAccount((prev) => ({ ...prev, [selectedAccountId]: count }));
        }
    }, [selectedAccountId]);
    const tabs = [
        {
            id: "scheduled",
            label: intl.formatMessage({ id: "workspace.socialTaskPlan.tab.scheduled" }),
            icon: Calendar,
            count: summary.scheduledCount,
        },
        {
            id: "drafts",
            label: intl.formatMessage({ id: "workspace.socialTaskPlan.tab.drafts" }),
            icon: Archive,
            count: summary.draftSavedCount,
        },
        {
            id: "history",
            label: intl.formatMessage({ id: "workspace.socialTaskPlan.tab.tasks" }),
            icon: History,
            count: summary.totalBatches,
        },
        {
            id: "analytics",
            label: "数据表现",
            icon: BarChart3,
        },
    ];
    return (_jsxs("div", { className: "mx-auto flex w-full max-w-5xl flex-col px-4 py-5 md:px-6 md:py-6 space-y-5", "data-testid": "social-schedule-plan-view", children: [_jsxs("div", { className: "flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-ui-xl font-bold tracking-tight text-foreground", children: intl.formatMessage({ id: "workspace.socialTaskPlan.title" }) }), _jsx("p", { className: "mt-1 text-ui-xs text-foreground-subtle", children: "\u5FAE\u4FE1\u516C\u4F17\u5E73\u53F0\u5B98\u65B9\u6392\u671F\u7FA4\u53D1\u4E0E\u8349\u7A3F\u8D44\u4EA7\u96C6\u4E2D\u6258\u7BA1\uFF0C\u4EE5\u8D26\u53F7\u4E3A\u5355\u4F4D\u7EDF\u4E00\u7BA1\u63A7" })] }), _jsxs(Button, { type: "button", variant: "default", size: "sm", onClick: handleUnifiedSync, disabled: globalSyncing, className: "self-start sm:self-center h-8.5 gap-2 px-3 text-ui-xs font-semibold rounded-lg shadow-xs", children: [_jsx(RefreshCw, { className: cn("size-3.5", globalSyncing && "animate-spin") }), _jsx("span", { children: globalSyncing ? "正在同步排期与草稿..." : "一键同步排期与草稿" })] })] }), syncFeedback ? (_jsxs("div", { className: "flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3 text-ui-xs text-emerald-700 dark:text-emerald-300", children: [_jsx(CheckCircle2, { className: "size-4 shrink-0 text-emerald-600 dark:text-emerald-400" }), _jsx("span", { className: "font-medium", children: syncFeedback })] })) : null, _jsx(SocialPlanAccountSelector, { accounts: gzhAccounts, selectedAccountId: selectedAccountId, onSelectAccount: setSelectedAccountId, onOpenLoginModal: handleOpenAccountLogin, scheduledCountsByAccount: scheduledCountsByAccount, draftCountsByAccount: draftCountsByAccount }), _jsx(SocialPlanMetrics, { totalBatches: summary.totalBatches, totalArticles: summary.totalArticles, scheduledCount: summary.scheduledCount, draftSavedCount: summary.draftSavedCount, loading: globalSyncing }), _jsx("div", { className: "flex items-center gap-1.5 rounded-xl bg-surface/80 p-1 border border-card-border/80 shadow-2xs backdrop-blur-md", children: tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (_jsxs("button", { type: "button", onClick: () => setActiveTab(tab.id), className: cn("flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-ui-xs font-semibold transition-all cursor-pointer", isActive
                            ? "bg-card text-foreground shadow-xs border border-border/80 font-bold"
                            : "text-foreground-subtle hover:text-foreground hover:bg-surface-hover/40"), children: [_jsx(Icon, { className: cn("size-3.5", isActive ? "text-primary" : "text-foreground-subtle") }), _jsx("span", { children: tab.label }), _jsx("span", { className: cn("rounded-full px-1.5 py-0.2 text-[10px] font-mono", isActive
                                    ? "bg-primary/10 text-primary border border-primary/20"
                                    : "bg-surface-active text-foreground-subtle border border-border/40"), children: tab.count })] }, tab.id));
                }) }), _jsxs("div", { className: "min-h-[400px]", children: [activeTab === "scheduled" && (_jsx(SocialPlanScheduledView, { currentAccountId: selectedAccountId, accountName: currentAccount?.name, socialPublisherRpc: socialPublisherRpc, onScheduledCountChange: handleScheduledCountChange, refreshKey: syncRefreshKey })), activeTab === "drafts" && (_jsx(SocialPlanDraftsView, { currentAccountId: selectedAccountId, accountName: currentAccount?.name, socialPublisherRpc: socialPublisherRpc, onDraftCountChange: handleDraftCountChange, refreshKey: syncRefreshKey })), activeTab === "history" && (_jsx(SocialPlanHistoryView, { allAccounts: allAccounts, socialPublisherRpc: socialPublisherRpc, onSummaryChange: handleHistorySummaryChange })), activeTab === "analytics" && (_jsx(SocialPlanAnalyticsView, { selectedAccountId: selectedAccountId, onRefresh: fetchConfig }))] }), _jsx(SocialPublisherLoginModal, { open: loginModalOpen, onOpenChange: setLoginModalOpen, platform: "gzh", accountId: loginModalAccountId, onLoginSuccess: handleUnifiedSync })] }));
}
//# sourceMappingURL=SocialSchedulePlanView.js.map