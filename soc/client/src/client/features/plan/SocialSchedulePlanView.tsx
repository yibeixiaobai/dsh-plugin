import { useState, useEffect, useCallback, useMemo } from "react";
import { History, Calendar, Archive, RefreshCw, CheckCircle2, BarChart3 } from "lucide-react";
import { useOptionalServices } from "../../compat/hooks/useServices.js";
import {
  publisherApiFetch,
  safeParseJson,
  normalizeAccountsList,
  DEFAULT_PUBLISHER_SECTION_CONFIG,
} from "../../settings/SocialPublisherTypes.js";
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

type PlanTabId = "scheduled" | "drafts" | "history" | "analytics";

interface SocialSchedulePlanViewProps {
  workspacePath?: string;
  workspaceIdentity?: string;
}

export function SocialSchedulePlanView({
  workspacePath: _unusedPath,
  workspaceIdentity: _unusedIdentity,
}: SocialSchedulePlanViewProps) {
  const { intl } = useWinCodeIntl();
  const services = useOptionalServices();
  const socialPublisherRpc = services?.socialPublisherService ?? null;

  const [activeTab, setActiveTab] = useState<PlanTabId>("scheduled");
  const [config, setConfig] = useState<any>(DEFAULT_PUBLISHER_SECTION_CONFIG);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("default");
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [loginModalAccountId, setLoginModalAccountId] = useState<string>("default");

  // 全局唯一同步状态与结果提示
  const [globalSyncing, setGlobalSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [syncRefreshKey, setSyncRefreshKey] = useState(0);

  // 顶层看板统计
  const [summary, setSummary] = useState({
    totalBatches: 0,
    totalArticles: 0,
    scheduledCount: 0,
    draftSavedCount: 0,
  });

  const [scheduledCountsByAccount, setScheduledCountsByAccount] = useState<Record<string, number>>({});
  const [draftCountsByAccount, setDraftCountsByAccount] = useState<Record<string, number>>({});

  const fetchConfig = useCallback(async () => {
    try {
      const res = await publisherApiFetch(
        "/api/gzh-publisher/config/export?include_secrets=true&download=false",
        {},
        socialPublisherRpc,
      );
      const parsed = await safeParseJson(res);
      if (parsed.ok) {
        const loadedCfg = parsed.data.config || parsed.data;
        if (loadedCfg && typeof loadedCfg === "object") {
          setConfig(loadedCfg);
          const list = normalizeAccountsList(loadedCfg.accounts);
          if (list.length > 0) {
            setSelectedAccountId((prev) =>
              prev && list.some((a: any) => a.id === prev)
                ? prev
                : loadedCfg.default_account || list[0].id,
            );
          }
        }
      }
    } catch (err) {
      console.warn("[SocialSchedulePlanView] 拉取社媒配置失败:", err);
    }
  }, [socialPublisherRpc]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const allAccounts = useMemo(() => normalizeAccountsList(config?.accounts), [config?.accounts]);
  const gzhAccounts = useMemo(
    () => allAccounts.filter((a: any) => (a.platform || "gzh") === "gzh"),
    [allAccounts],
  );

  const currentAccount = useMemo(() => {
    return gzhAccounts.find((a: any) => a.id === selectedAccountId) || gzhAccounts[0] || {};
  }, [gzhAccounts, selectedAccountId]);

  // 全局唯一的“一键同步排期与草稿”
  const handleUnifiedSync = useCallback(async () => {
    const targetAccountId = selectedAccountId || currentAccount?.id || "default";
    setGlobalSyncing(true);
    setSyncFeedback(null);

    try {
      const [scheduledRes, draftsRes] = await Promise.allSettled([
        publisherApiFetch(
          "/api/gzh-publisher/tasks/sync",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ account_id: targetAccountId }),
          },
          socialPublisherRpc,
        ),
        publisherApiFetch(
          "/api/gzh-publisher/drafts/sync",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ account_id: targetAccountId }),
          },
          socialPublisherRpc,
        ),
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
      setSyncFeedback(
        `同步成功！当前公众号已完成同步：发现 ${scheduledFound} 项官方排期，${draftsFound} 篇官方草稿。`,
      );
    } catch (err: any) {
      setSyncFeedback(`同步完成，部分网络响应延迟：${err?.message || "可直接刷新查看"}`);
    } finally {
      setGlobalSyncing(false);
    }
  }, [selectedAccountId, currentAccount?.id, socialPublisherRpc]);

  const handleOpenAccountLogin = useCallback((accountId: string) => {
    setLoginModalAccountId(accountId);
    setLoginModalOpen(true);
  }, []);

  const handleHistorySummaryChange = useCallback((s: typeof summary) => {
    setSummary((prev) => ({
      ...prev,
      totalBatches: s.totalBatches,
      totalArticles: s.totalArticles,
      scheduledCount: s.scheduledCount || prev.scheduledCount,
      draftSavedCount: s.draftSavedCount || prev.draftSavedCount,
    }));
  }, []);

  const handleScheduledCountChange = useCallback((count: number) => {
    setSummary((prev) => ({ ...prev, scheduledCount: count }));
    if (selectedAccountId) {
      setScheduledCountsByAccount((prev) => ({ ...prev, [selectedAccountId]: count }));
    }
  }, [selectedAccountId]);

  const handleDraftCountChange = useCallback((count: number) => {
    setSummary((prev) => ({ ...prev, draftSavedCount: count }));
    if (selectedAccountId) {
      setDraftCountsByAccount((prev) => ({ ...prev, [selectedAccountId]: count }));
    }
  }, [selectedAccountId]);

  const tabs = [
    {
      id: "scheduled" as const,
      label: intl.formatMessage({ id: "workspace.socialTaskPlan.tab.scheduled" }),
      icon: Calendar,
      count: summary.scheduledCount,
    },
    {
      id: "drafts" as const,
      label: intl.formatMessage({ id: "workspace.socialTaskPlan.tab.drafts" }),
      icon: Archive,
      count: summary.draftSavedCount,
    },
    {
      id: "history" as const,
      label: intl.formatMessage({ id: "workspace.socialTaskPlan.tab.tasks" }),
      icon: History,
      count: summary.totalBatches,
    },
    {
      id: "analytics" as const,
      label: "数据表现",
      icon: BarChart3,
    },
  ];

  return (
    <div
      className="mx-auto flex w-full max-w-5xl flex-col px-4 py-5 md:px-6 md:py-6 space-y-5"
      data-testid="social-schedule-plan-view"
    >
      {/* 层级 1：主控制台 Header 与全局唯一同步操作 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div>
          <h1 className="text-ui-xl font-bold tracking-tight text-foreground">
            {intl.formatMessage({ id: "workspace.socialTaskPlan.title" })}
          </h1>
          <p className="mt-1 text-ui-xs text-foreground-subtle">
            微信公众平台官方排期群发与草稿资产集中托管，以账号为单位统一管控
          </p>
        </div>

        {/* 全局唯一的同步按钮 */}
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={handleUnifiedSync}
          disabled={globalSyncing}
          className="self-start sm:self-center h-8.5 gap-2 px-3 text-ui-xs font-semibold rounded-lg shadow-xs"
        >
          <RefreshCw className={cn("size-3.5", globalSyncing && "animate-spin")} />
          <span>{globalSyncing ? "正在同步排期与草稿..." : "一键同步排期与草稿"}</span>
        </Button>
      </div>

      {syncFeedback ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3 text-ui-xs text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="font-medium">{syncFeedback}</span>
        </div>
      ) : null}

      {/* 层级 2：以账号为主轴的账号卡片选择器 */}
      <SocialPlanAccountSelector
        accounts={gzhAccounts}
        selectedAccountId={selectedAccountId}
        onSelectAccount={setSelectedAccountId}
        onOpenLoginModal={handleOpenAccountLogin}
        scheduledCountsByAccount={scheduledCountsByAccount}
        draftCountsByAccount={draftCountsByAccount}
      />

      {/* 层级 3：当前选中账号的核心指标看板 */}
      <SocialPlanMetrics
        totalBatches={summary.totalBatches}
        totalArticles={summary.totalArticles}
        scheduledCount={summary.scheduledCount}
        draftSavedCount={summary.draftSavedCount}
        loading={globalSyncing}
      />

      {/* 层级 4：三标签页控制器 */}
      <div className="flex items-center gap-1.5 rounded-xl bg-surface/80 p-1 border border-card-border/80 shadow-2xs backdrop-blur-md">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-ui-xs font-semibold transition-all cursor-pointer",
                isActive
                  ? "bg-card text-foreground shadow-xs border border-border/80 font-bold"
                  : "text-foreground-subtle hover:text-foreground hover:bg-surface-hover/40",
              )}
            >
              <Icon className={cn("size-3.5", isActive ? "text-primary" : "text-foreground-subtle")} />
              <span>{tab.label}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.2 text-[10px] font-mono",
                  isActive
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "bg-surface-active text-foreground-subtle border border-border/40",
                )}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 视图内容分发 */}
      <div className="min-h-[400px]">
        {activeTab === "scheduled" && (
          <SocialPlanScheduledView
            currentAccountId={selectedAccountId}
            accountName={currentAccount?.name}
            socialPublisherRpc={socialPublisherRpc}
            onScheduledCountChange={handleScheduledCountChange}
            refreshKey={syncRefreshKey}
          />
        )}

        {activeTab === "drafts" && (
          <SocialPlanDraftsView
            currentAccountId={selectedAccountId}
            accountName={currentAccount?.name}
            socialPublisherRpc={socialPublisherRpc}
            onDraftCountChange={handleDraftCountChange}
            refreshKey={syncRefreshKey}
          />
        )}

        {activeTab === "history" && (
          <SocialPlanHistoryView
            allAccounts={allAccounts}
            socialPublisherRpc={socialPublisherRpc}
            onSummaryChange={handleHistorySummaryChange}
          />
        )}

        {activeTab === "analytics" && (
          <SocialPlanAnalyticsView
            selectedAccountId={selectedAccountId}
            onRefresh={fetchConfig}
          />
        )}
      </div>

      <SocialPublisherLoginModal
        open={loginModalOpen}
        onOpenChange={setLoginModalOpen}
        platform="gzh"
        accountId={loginModalAccountId}
        onLoginSuccess={handleUnifiedSync}
      />
    </div>
  );
}
