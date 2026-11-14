import { useState, useEffect, useCallback } from "react";
import { Button } from "../compat/components/ui/button.js";
import { RefreshCw, Calendar, CheckCircle2, AlertCircle, ShieldCheck, Monitor } from "lucide-react";
import {
  type WechatScheduledTask,
  publisherApiFetch,
  safeParseJson,
} from "./SocialPublisherTypes.js";
import { SocialPublisherTaskCard } from "./SocialPublisherTaskCard.js";
import { SocialPublisherLoginModal } from "./SocialPublisherLoginModal.js";
import { cn } from "../compat/components/lib/utils.js";

interface ScheduledSubTabProps {
  gzhAccounts: any[];
  socialPublisherRpc?: any;
}

export function SocialPublisherScheduledSubTab({
  gzhAccounts,
  socialPublisherRpc,
}: ScheduledSubTabProps) {
  const [scheduledAccountId, setScheduledAccountId] = useState<string>(
    () => gzhAccounts[0]?.id || "default",
  );

  useEffect(() => {
    if (gzhAccounts.length > 0 && !gzhAccounts.some((a) => a.id === scheduledAccountId)) {
      setScheduledAccountId(gzhAccounts[0].id);
    }
  }, [gzhAccounts, scheduledAccountId]);

  const [scheduledTasks, setScheduledTasks] = useState<WechatScheduledTask[]>([]);
  const [loadingScheduled, setLoadingScheduled] = useState(false);
  const [syncingScheduled, setSyncingScheduled] = useState(false);
  const [cancelingTaskId, setCancelingTaskId] = useState<string | null>(null);
  const [activeCancelPopoverId, setActiveCancelPopoverId] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  const fetchScheduledTasks = useCallback(
    async (accountId: string) => {
      if (!accountId) return;
      setLoadingScheduled(true);
      setStatusMessage(null);
      try {
        const res = await publisherApiFetch(
          `/api/gzh-publisher/tasks/list?account_id=${encodeURIComponent(accountId)}`,
          {},
          socialPublisherRpc,
        );
        const parsed = await safeParseJson(res);
        if (parsed.ok) {
          const loadedTasks: WechatScheduledTask[] = Array.isArray(parsed.data.tasks)
            ? parsed.data.tasks
            : [];
          setScheduledTasks(loadedTasks);
          const firstTask = loadedTasks[0];
          if (firstTask?.synced_at) {
            setLastSyncTime(firstTask.synced_at);
          }
        }
      } catch (err: any) {
        console.warn("[SocialPublisherScheduledSubTab] 加载微信排期任务列表失败:", err);
      } finally {
        setLoadingScheduled(false);
      }
    },
    [socialPublisherRpc],
  );

  useEffect(() => {
    fetchScheduledTasks(scheduledAccountId);

    const handleScheduledUpdated = (e: any) => {
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
    if (!scheduledAccountId) return;
    setSyncingScheduled(true);
    setStatusMessage(null);
    try {
      const res = await publisherApiFetch(
        "/api/gzh-publisher/tasks/sync",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account_id: scheduledAccountId }),
        },
        socialPublisherRpc,
      );
      const parsed = await safeParseJson(res);
      if (parsed.ok && parsed.data?.ok) {
        const syncedTasks = parsed.data.tasks || [];
        setScheduledTasks(syncedTasks);
        setLastSyncTime(new Date().toISOString());
        setStatusMessage({
          type: "success",
          text: `同步成功！已从微信后台首页获取到 ${syncedTasks.length} 项定时发表任务。`,
        });
      } else {
        const errText = String(parsed.error || parsed.data?.error || "");
        const displayErr =
          errText && !errText.includes("fetch failed")
            ? errText
            : "微信公众号排期同步响应超时，请稍后重试";
        setStatusMessage({
          type: "error",
          text: `同步失败: ${displayErr}`,
        });
      }
    } catch (e: any) {
      const errText = String(e?.message || "");
      const displayErr =
        errText && !errText.includes("fetch failed") ? errText : "微信后台同步服务连接超时，请重试";
      setStatusMessage({
        type: "error",
        text: `同步异常: ${displayErr}`,
      });
    } finally {
      setSyncingScheduled(false);
    }
  };

  const handleCancelScheduledTask = async (task: WechatScheduledTask) => {
    if (!task.id || !scheduledAccountId) return;
    setCancelingTaskId(task.id);
    setStatusMessage(null);
    try {
      const res = await publisherApiFetch(
        "/api/gzh-publisher/tasks/cancel",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account_id: scheduledAccountId,
            task_id: task.id,
            title: task.articles?.[0]?.title,
            display_time: task.display_time,
          }),
        },
        socialPublisherRpc,
      );
      const parsed = await safeParseJson(res);
      if (parsed.ok && (parsed.data?.ok || parsed.data?.success)) {
        setScheduledTasks((prev) => prev.filter((t) => t.id !== task.id));
        setStatusMessage({
          type: "success",
          text: `取消成功！已在微信后台与本地注销「${task.display_time}」的定时发表任务，群发通知次数已恢复。`,
        });
      } else {
        setStatusMessage({
          type: "error",
          text: `取消发表失败: ${parsed.error || parsed.data?.error || "微信后台执行取消失败，请确认微信登录态有效"}`,
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: `取消发表异常: ${err.message || "请求取消接口失败"}`,
      });
    } finally {
      setCancelingTaskId(null);
    }
  };

  const currentGzhAccount =
    gzhAccounts.find((a: any) => a.id === scheduledAccountId) || gzhAccounts[0] || {};

  return (
    <div className="space-y-4" data-testid="social-publisher-scheduled-subtab">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-card-border bg-card/60 p-4 shadow-2xs backdrop-blur-md">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-ui-base font-bold text-foreground">微信公众平台官方排期任务</h3>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-ui-xs font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              微信后台直连托管
            </span>
          </div>
          <p className="text-ui-xs text-foreground-subtle">
            直通微信公众平台首页定时发表卡片。排期发布时将自动读取已有排期，杜绝时间撞车与文章重复发表。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {gzhAccounts.length > 1 && (
            <select
              aria-label="选择微信公众号账号"
              className="h-8 rounded-lg border border-border bg-background px-2.5 text-ui-xs text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-primary"
              value={scheduledAccountId}
              onChange={(e) => setScheduledAccountId(e.target.value)}
            >
              {gzhAccounts.map((acc: any) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name || acc.id} ({acc.id})
                </option>
              ))}
            </select>
          )}

          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => setLoginModalOpen(true)}
            className="h-8 text-ui-xs gap-1.5 shrink-0"
          >
            <Monitor className="size-3.5" />
            <span>内置浏览器登录</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={triggerSyncScheduled}
            disabled={syncingScheduled || loadingScheduled}
            className="h-8 text-ui-xs gap-1.5 shrink-0"
          >
            <RefreshCw className={cn("size-3.5", syncingScheduled && "animate-spin")} />
            <span>{syncingScheduled ? "同步中..." : "立即同步微信排期"}</span>
          </Button>
        </div>
      </div>

      {statusMessage && (
        <div
          className={cn(
            "flex items-center justify-between gap-3 p-3 rounded-xl text-ui-xs border",
            statusMessage.type === "success"
              ? "bg-emerald-500/[0.08] border-emerald-500/20 text-emerald-700 dark:text-emerald-300"
              : "bg-destructive/[0.08] border-destructive/20 text-destructive",
          )}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === "success" ? (
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertCircle className="size-4 shrink-0 text-destructive" />
            )}
            <span className="font-medium">{statusMessage.text}</span>
          </div>
          {statusMessage.type === "error" &&
            (statusMessage.text.includes("未登录") || statusMessage.text.includes("失效")) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLoginModalOpen(true)}
                className="h-7 text-ui-xs shrink-0 bg-background/60 hover:bg-background border-destructive/30 text-destructive"
              >
                <Monitor className="size-3 mr-1" />
                <span>扫码登录该公众号</span>
              </Button>
            )}
        </div>
      )}

      {/* 防重防撞联动提示卡片 */}
      <div className="flex items-start gap-2.5 rounded-xl border border-sky-500/20 bg-sky-500/[0.04] p-3 text-ui-xs text-foreground-subtle">
        <ShieldCheck className="size-4 text-sky-500 mt-0.5 shrink-0" />
        <div>
          <span className="font-semibold text-foreground">智能排期与配额避让保护已激活：</span>
          <span className="text-foreground-subtle ml-1">
            系统执行 <code>/gzh</code>、<code>/publish</code>{" "}
            或定时发布时，会优先比对下列排期任务。若检测到时间冲突或群发通知配额已占满，系统将自动顺延至下一个空闲槽位。
            {lastSyncTime && (
              <span className="ml-2 text-foreground-subtle">
                (上次同步时间: {new Date(lastSyncTime).toLocaleTimeString("zh-CN")})
              </span>
            )}
          </span>
        </div>
      </div>

      {/* 任务列表展示卡片 */}
      <div className="rounded-xl border border-card-border bg-card/70 overflow-hidden shadow-2xs backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-border/70 bg-surface/60 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-ui-sm text-foreground">微信后台排期列表</span>
            <span className="text-ui-xs text-foreground-subtle">
              ({scheduledTasks.length} 项排期托管中)
            </span>
          </div>
          <span className="text-ui-xs text-foreground-subtle">
            当前账号：{currentGzhAccount.name || currentGzhAccount.id}
          </span>
        </div>

        {loadingScheduled && scheduledTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-foreground-subtle space-y-2">
            <RefreshCw className="size-6 animate-spin text-primary" />
            <span className="text-ui-sm">正在加载排期任务列表...</span>
          </div>
        ) : scheduledTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center space-y-3">
            <div className="size-12 rounded-full bg-surface-active/60 flex items-center justify-center text-foreground-subtle">
              <Calendar className="size-6 opacity-40" />
            </div>
            <div className="space-y-1">
              <div className="text-ui-sm font-semibold text-foreground">暂无微信平台排期任务</div>
              <p className="text-ui-xs text-foreground-subtle max-w-md">
                微信公众平台后台当前没有排期的定时任务。在会话中通过 <code>/gzh</code>{" "}
                生成长文并选择定时发布，微信官方后台将直接接管排期，任务将在此处完整展示。
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={triggerSyncScheduled}
              disabled={syncingScheduled}
              className="mt-2 text-ui-xs"
            >
              <RefreshCw className={cn("size-3.5 mr-1.5", syncingScheduled && "animate-spin")} />
              立即拉取微信后台首页排期
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {scheduledTasks.map((task, idx) => (
              <SocialPublisherTaskCard
                key={task.id || idx}
                task={task}
                index={idx}
                syncing={syncingScheduled}
                cancelingTaskId={cancelingTaskId}
                activeCancelPopoverId={activeCancelPopoverId}
                onToggleCancelPopover={setActiveCancelPopoverId}
                onCancelTask={handleCancelScheduledTask}
              />
            ))}
          </div>
        )}
      </div>

      {/* 内置浏览器专属隔离扫码登录窗口 */}
      <SocialPublisherLoginModal
        open={loginModalOpen}
        onOpenChange={setLoginModalOpen}
        platform="gzh"
        accountId={scheduledAccountId}
        accountName={currentGzhAccount.name || scheduledAccountId}
        onLoginSuccess={() => {
          triggerSyncScheduled();
        }}
      />
    </div>
  );
}
