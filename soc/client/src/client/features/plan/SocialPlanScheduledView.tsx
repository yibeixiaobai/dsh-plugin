import { useState, useEffect, useCallback } from "react";
import {
  Calendar,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import {
  type WechatScheduledTask,
  publisherApiFetch,
  safeParseJson,
} from "../../settings/SocialPublisherTypes.js";
import { SocialPublisherTaskCard } from "../../settings/SocialPublisherTaskCard.js";
import { cn } from "../../compat/components/lib/utils.js";

interface SocialPlanScheduledViewProps {
  currentAccountId: string;
  accountName?: string;
  socialPublisherRpc?: any;
  onScheduledCountChange?: (count: number) => void;
  refreshKey?: number;
}

export function SocialPlanScheduledView({
  currentAccountId,
  accountName,
  socialPublisherRpc,
  onScheduledCountChange,
  refreshKey = 0,
}: SocialPlanScheduledViewProps) {
  const [scheduledTasks, setScheduledTasks] = useState<WechatScheduledTask[]>([]);
  const [loadingScheduled, setLoadingScheduled] = useState(false);
  const [cancelingTaskId, setCancelingTaskId] = useState<string | null>(null);
  const [activeCancelPopoverId, setActiveCancelPopoverId] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

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
          onScheduledCountChange?.(loadedTasks.length);
          const firstTask = loadedTasks[0];
          if (firstTask?.synced_at) {
            setLastSyncTime(firstTask.synced_at);
          }
        }
      } catch (err: any) {
        console.warn("[SocialPlanScheduledView] 加载微信排期任务列表失败:", err);
      } finally {
        setLoadingScheduled(false);
      }
    },
    [socialPublisherRpc, onScheduledCountChange],
  );

  useEffect(() => {
    fetchScheduledTasks(currentAccountId);

    const handleScheduledUpdated = (e: any) => {
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

  const handleCancelScheduledTask = async (task: WechatScheduledTask) => {
    if (!task.id || !currentAccountId) return;
    setCancelingTaskId(task.id);
    setStatusMessage(null);
    try {
      const res = await publisherApiFetch(
        "/api/gzh-publisher/tasks/cancel",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account_id: currentAccountId,
            task_id: task.id,
            title: task.articles?.[0]?.title,
            display_time: task.display_time,
          }),
        },
        socialPublisherRpc,
      );
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
      } else {
        setStatusMessage({
          type: "error",
          text: `取消排期失败: ${parsed.error || parsed.data?.error || "请确认微信授权登录态有效"}`,
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: `取消排期异常: ${err.message || "请求取消接口失败"}`,
      });
    } finally {
      setCancelingTaskId(null);
    }
  };

  const displayName = accountName || currentAccountId || "默认公众号";

  return (
    <div className="space-y-3.5" data-testid="social-plan-scheduled-view">
      {/* 头部信息摘要横幅 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 rounded-xl border border-card-border/80 bg-card/60 px-4 py-3 shadow-2xs backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Calendar className="size-4 text-emerald-600 dark:text-emerald-400" />
          <span className="text-ui-sm font-semibold text-foreground">微信公众平台官方排期清单</span>
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-mono font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            {scheduledTasks.length} 项排期中
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-foreground-subtle">
          <span>当前账号: <strong className="text-foreground font-medium">{displayName}</strong></span>
          {lastSyncTime ? (
            <span className="hidden md:inline font-mono text-foreground-subtle/70">
              · 上次同步: {new Date(lastSyncTime).toLocaleTimeString("zh-CN")}
            </span>
          ) : null}
        </div>
      </div>

      {statusMessage ? (
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
        </div>
      ) : null}

      {/* 配额与避让防护提示 */}
      <div className="flex items-start gap-2.5 rounded-xl border border-sky-500/20 bg-sky-500/[0.04] p-3 text-ui-xs text-foreground-subtle">
        <ShieldCheck className="size-4 text-sky-500 mt-0.5 shrink-0" />
        <div className="leading-relaxed">
          <span className="font-semibold text-foreground">智能排期时段防撞车保护：</span>
          <span className="text-foreground-subtle ml-1">
            执行 <code>/publish</code> 定时发布时，系统自动识别并顺延排期，避免与下方微信后台已有任务发生槽位冲突。
          </span>
        </div>
      </div>

      {/* 排期任务列表 */}
      <div className="rounded-xl border border-card-border/80 bg-card/70 overflow-hidden shadow-2xs backdrop-blur-md">
        {loadingScheduled && scheduledTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-foreground-subtle space-y-2">
            <RefreshCw className="size-5 animate-spin text-primary" />
            <span className="text-ui-sm font-medium">正在读取排期群发任务...</span>
          </div>
        ) : scheduledTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center space-y-3">
            <div className="size-11 rounded-full bg-surface-active/60 flex items-center justify-center text-foreground-subtle border border-border/40">
              <Calendar className="size-5 opacity-60" />
            </div>
            <div className="space-y-1">
              <div className="text-ui-sm font-semibold text-foreground">当前公众号暂无排期群发任务</div>
              <p className="text-ui-xs text-foreground-subtle max-w-md mx-auto leading-relaxed">
                微信公众平台后台当前没有待群发的定时排期。可在对话中生成稿件后选择定时发布，或点击顶部的「一键同步排期与草稿」获取后台最新数据。
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border/60 p-2 space-y-2">
            {scheduledTasks.map((task: WechatScheduledTask, index: number) => (
              <SocialPublisherTaskCard
                key={task.id}
                task={task}
                index={index}
                syncing={loadingScheduled}
                cancelingTaskId={cancelingTaskId}
                activeCancelPopoverId={activeCancelPopoverId}
                onToggleCancelPopover={setActiveCancelPopoverId}
                onCancelTask={handleCancelScheduledTask}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
