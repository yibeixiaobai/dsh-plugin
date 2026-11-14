import { useState, useEffect, useCallback } from "react";
import { Button } from "../../compat/components/ui/button.js";
import {
  RefreshCw,
  History,
  Calendar,
  Layers,
  Clock,
  Search,
  Check,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import {
  type SocialPublishBatchRecord,
  publisherApiFetch,
  safeParseJson,
} from "../../settings/SocialPublisherTypes.js";
import { cn } from "../../compat/components/lib/utils.js";

interface SocialPlanHistoryViewProps {
  allAccounts: any[];
  socialPublisherRpc?: any;
  onSummaryChange?: (summary: {
    totalBatches: number;
    totalArticles: number;
    scheduledCount: number;
    draftSavedCount: number;
  }) => void;
}

const PLATFORM_LABELS: Record<string, string> = {
  gzh: "微信公众号",
  xiaohongshu: "小红书",
  zhihu: "知乎",
  baijiahao: "百家号",
  toutiao: "今日头条",
};

export function SocialPlanHistoryView({
  allAccounts,
  socialPublisherRpc,
  onSummaryChange,
}: SocialPlanHistoryViewProps) {
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [selectedPlatform, setSelectedPlatform] = useState<string>("all");
  const [keyword, setKeyword] = useState("");
  const [historyRecords, setHistoryRecords] = useState<SocialPublishBatchRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedBatchIds, setExpandedBatchIds] = useState<Set<string>>(new Set());

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
      const res = await publisherApiFetch(
        `/api/gzh-publisher/publish-history${qs}`,
        {},
        socialPublisherRpc,
      );
      const parsed = await safeParseJson(res);
      if (parsed.ok && parsed.data) {
        const records: SocialPublishBatchRecord[] = Array.isArray(parsed.data.records)
          ? parsed.data.records
          : [];
        setHistoryRecords(records);

        const s = parsed.data.summary || {};
        const totalBatches = parsed.data.total_batches ?? records.length;
        const totalArticles =
          parsed.data.total_articles ??
          records.reduce((acc: number, r: any) => acc + (r.article_count || 0), 0);
        const scheduledCount =
          s.scheduled_count ??
          records.filter((r) => r.publish_action === "schedule" || r.publish_status === "scheduled")
            .length;
        const draftSavedCount =
          s.draft_saved_count ??
          records.filter((r) => r.publish_action === "draft" || r.publish_status === "draft_saved")
            .length;

        onSummaryChange?.({
          totalBatches,
          totalArticles,
          scheduledCount,
          draftSavedCount,
        });
      }
    } catch (err) {
      console.warn("[SocialPlanHistoryView] 加载发布历史失败:", err);
    } finally {
      setLoadingHistory(false);
    }
  }, [selectedAccountId, selectedPlatform, keyword, socialPublisherRpc, onSummaryChange]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const toggleExpandBatch = (batchId: string) => {
    setExpandedBatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId);
      else next.add(batchId);
      return next;
    });
  };

  return (
    <div className="space-y-4" data-testid="social-plan-history-view">
      {/* 紧凑筛选与搜索工具条 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-card-border/80 bg-card/60 p-3 text-ui-xs shadow-2xs backdrop-blur-md">
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-[240px]">
          <select
            aria-label="筛选执行账号"
            className="h-8.5 rounded-lg border border-border/80 bg-background px-2.5 text-ui-xs text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
          >
            <option value="all">全部执行账号</option>
            {allAccounts.map((acc: any) => (
              <option key={acc.id} value={acc.id}>
                {acc.name || acc.id} ({PLATFORM_LABELS[acc.platform] || acc.platform || "gzh"})
              </option>
            ))}
          </select>

          <select
            aria-label="筛选发布平台"
            className="h-8.5 rounded-lg border border-border/80 bg-background px-2.5 text-ui-xs text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
            value={selectedPlatform}
            onChange={(e) => setSelectedPlatform(e.target.value)}
          >
            <option value="all">全部社媒平台</option>
            <option value="gzh">微信公众号</option>
            <option value="xiaohongshu">小红书</option>
            <option value="zhihu">知乎</option>
            <option value="baijiahao">百家号</option>
            <option value="toutiao">今日头条</option>
          </select>

          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground-subtle pointer-events-none" />
            <input
              type="text"
              placeholder="搜索批次标题、账号或关键词..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="h-8.5 w-full rounded-lg border border-border/80 bg-background pl-8 pr-7 text-ui-xs text-foreground placeholder:text-foreground-subtle/60 focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
            />
            {keyword ? (
              <button
                type="button"
                onClick={() => setKeyword("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-foreground-subtle hover:text-foreground p-0.5 cursor-pointer"
                title="清空搜索"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="text-ui-xs text-foreground-subtle font-mono hidden sm:inline">
            共 {historyRecords.length} 批次
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchHistory}
            disabled={loadingHistory}
            className="h-8.5 text-ui-xs gap-1.5 rounded-lg"
          >
            <RefreshCw className={cn("size-3.5", loadingHistory && "animate-spin")} />
            <span>刷新审计</span>
          </Button>
        </div>
      </div>

      {/* 记录卡片流 */}
      {loadingHistory && historyRecords.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-foreground-subtle space-y-2 rounded-xl border border-card-border/80 bg-card/40">
          <RefreshCw className="size-5 animate-spin text-primary" />
          <span className="text-ui-sm font-medium">正在读取流水线执行审计记录...</span>
        </div>
      ) : historyRecords.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center space-y-3 rounded-xl border border-card-border/80 bg-card/40">
          <div className="size-11 rounded-full bg-surface-active/60 flex items-center justify-center text-foreground-subtle border border-border/40">
            <History className="size-5 opacity-60" />
          </div>
          <div className="space-y-1">
            <div className="text-ui-sm font-semibold text-foreground">暂无生产流水线记录</div>
            <p className="text-ui-xs text-foreground-subtle max-w-md mx-auto leading-relaxed">
              在主对话区使用 <code className="rounded bg-black/5 dark:bg-white/10 px-1 py-0.5 font-mono">/gzh</code> 或选择社媒矩阵发起排版，系统将自动记录流水线执行日志、成稿文章与发布凭证。
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {historyRecords.map((batch) => {
            const isExpanded = expandedBatchIds.has(batch.id);
            const isScheduled =
              batch.publish_action === "schedule" || batch.publish_status === "scheduled";
            const isFailed = batch.status === "failed" || batch.publish_status === "failed";
            const timeStr = batch.timestamp
              ? new Date(batch.timestamp).toLocaleString("zh-CN")
              : "刚刚";
            const platformName = PLATFORM_LABELS[batch.platform || "gzh"] || batch.platform || "微信";

            return (
              <div
                key={batch.id}
                className="overflow-hidden rounded-xl border border-card-border/80 bg-card/70 hover:bg-card transition-all shadow-2xs backdrop-blur-md"
              >
                <div
                  onClick={() => toggleExpandBatch(batch.id)}
                  className="flex items-center justify-between gap-3 p-3.5 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-lg border",
                        isFailed
                          ? "bg-destructive/10 border-destructive/25 text-destructive"
                          : isScheduled
                            ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400"
                            : "bg-primary/10 border-primary/25 text-primary",
                      )}
                    >
                      {isFailed ? (
                        <AlertCircle className="size-4" />
                      ) : isScheduled ? (
                        <Calendar className="size-4" />
                      ) : (
                        <Check className="size-4" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-ui-sm text-foreground truncate max-w-xs sm:max-w-md">
                          {batch.articles?.[0] || "社媒流水线生产批次"}
                        </span>
                        {batch.article_count > 1 && (
                          <span className="rounded-full bg-surface-active px-2 py-0.5 text-[11px] font-medium text-foreground-subtle border border-border/60">
                            共 {batch.article_count} 篇
                          </span>
                        )}
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-medium border",
                            isFailed
                              ? "bg-destructive/10 border-destructive/25 text-destructive"
                              : isScheduled
                                ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400"
                                : "bg-sky-500/10 border-sky-500/25 text-sky-600 dark:text-sky-400",
                          )}
                        >
                          {isFailed ? "执行异常" : isScheduled ? "已官方排期" : "已入草稿箱"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-foreground-subtle mt-1 flex-wrap">
                        <span className="font-medium text-foreground/80">{platformName}</span>
                        <span>·</span>
                        <span>账号: {batch.account_id || "默认"}</span>
                        <span>·</span>
                        <span className="flex items-center gap-1 font-mono">
                          <Clock className="size-3 text-foreground-subtle/80" />
                          <span>{timeStr}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="size-7 p-0 text-foreground-subtle hover:text-foreground"
                      title={isExpanded ? "收起批次" : "展开批次清单"}
                    >
                      {isExpanded ? (
                        <ChevronUp className="size-4" />
                      ) : (
                        <ChevronDown className="size-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-border/60 bg-surface/40 p-3.5 space-y-2 text-ui-xs">
                    <div className="font-semibold text-foreground flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Layers className="size-3.5 text-primary" />
                        <span>批次文章成果清单 ({batch.article_count || batch.articles?.length || 0} 篇)</span>
                      </div>
                      <span className="text-[11px] text-foreground-subtle">
                        执行模式: {batch.publish_action === "schedule" ? "官方定时排期" : "官方草稿落盘"}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {batch.articles && batch.articles.length > 0 ? (
                        batch.articles.map((artTitle, aIdx) => (
                          <div
                            key={aIdx}
                            className="flex items-center justify-between gap-3 p-2 rounded-lg border border-border/60 bg-background/70 hover:bg-background transition-colors"
                          >
                            <span className="font-medium text-foreground truncate">{artTitle}</span>
                            <span className="text-[11px] text-foreground-subtle font-mono shrink-0">
                              #{aIdx + 1}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="text-foreground-subtle p-2">未记录到明细条目</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
