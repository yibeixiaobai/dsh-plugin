import { useState, useEffect, useCallback } from "react";
import { Button } from "../compat/components/ui/button.js";
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
} from "lucide-react";
import {
  type SocialPublishBatchRecord,
  publisherApiFetch,
  safeParseJson,
} from "./SocialPublisherTypes.js";
import { cn } from "../compat/components/lib/utils.js";

interface HistorySubTabProps {
  allAccounts: any[];
  socialPublisherRpc?: any;
}

export function SocialPublisherHistorySubTab({
  allAccounts,
  socialPublisherRpc,
}: HistorySubTabProps) {
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [selectedPlatform, setSelectedPlatform] = useState<string>("all");
  const [keyword, setKeyword] = useState("");
  const [historyRecords, setHistoryRecords] = useState<SocialPublishBatchRecord[]>([]);
  const [historySummary, setHistorySummary] = useState({
    total_batches: 0,
    total_articles: 0,
    success_count: 0,
    scheduled_count: 0,
    draft_saved_count: 0,
    failed_count: 0,
  });
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
        setHistorySummary({
          total_batches: parsed.data.total_batches ?? records.length,
          total_articles:
            parsed.data.total_articles ??
            records.reduce((acc: number, r: any) => acc + (r.article_count || 0), 0),
          success_count:
            s.success_count ??
            records.filter((r) => r.status === "success" || r.publish_status === "published")
              .length,
          scheduled_count:
            s.scheduled_count ??
            records.filter(
              (r) => r.publish_action === "schedule" || r.publish_status === "scheduled",
            ).length,
          draft_saved_count:
            s.draft_saved_count ??
            records.filter(
              (r) => r.publish_action === "draft" || r.publish_status === "draft_saved",
            ).length,
          failed_count:
            s.failed_count ??
            records.filter((r) => r.status === "failed" || r.publish_status === "failed").length,
        });
      }
    } catch (err) {
      console.warn("[SocialPublisherHistorySubTab] 加载发布历史失败:", err);
    } finally {
      setLoadingHistory(false);
    }
  }, [selectedAccountId, selectedPlatform, keyword, socialPublisherRpc]);

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
    <div className="space-y-4" data-testid="social-publisher-history-subtab">
      {/* 汇总统计指标卡片 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-card-border bg-card/60 p-3.5 flex flex-col gap-1 shadow-2xs backdrop-blur-md">
          <span className="text-ui-xs text-foreground-subtle font-medium">累计执行批次</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-ui-lg font-bold text-foreground">
              {historySummary.total_batches}
            </span>
            <span className="text-ui-xs text-foreground-subtle">批次</span>
          </div>
        </div>
        <div className="rounded-xl border border-card-border bg-card/60 p-3.5 flex flex-col gap-1 shadow-2xs backdrop-blur-md">
          <span className="text-ui-xs text-foreground-subtle font-medium">产出图文总量</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-ui-lg font-bold text-foreground">
              {historySummary.total_articles}
            </span>
            <span className="text-ui-xs text-foreground-subtle">篇</span>
          </div>
        </div>
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.05] p-3.5 flex flex-col gap-1 shadow-2xs">
          <span className="text-ui-xs text-emerald-600 dark:text-emerald-400 font-medium">
            官方排期托管
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-ui-lg font-bold text-emerald-600 dark:text-emerald-400">
              {historySummary.scheduled_count}
            </span>
            <span className="text-ui-xs text-emerald-600/70">项</span>
          </div>
        </div>
        <div className="rounded-xl border border-sky-500/25 bg-sky-500/[0.05] p-3.5 flex flex-col gap-1 shadow-2xs">
          <span className="text-ui-xs text-sky-600 dark:text-sky-400 font-medium">存入草稿箱</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-ui-lg font-bold text-sky-600 dark:text-sky-400">
              {historySummary.draft_saved_count}
            </span>
            <span className="text-ui-xs text-sky-600/70">项</span>
          </div>
        </div>
      </div>

      {/* 筛选与搜索工具条 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-card-border bg-card/60 p-3 text-ui-xs shadow-2xs backdrop-blur-md">
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-[240px]">
          <select
            aria-label="筛选执行账号"
            className="h-8 rounded-lg border border-border bg-background px-2.5 text-ui-xs text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-primary"
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
          >
            <option value="all">全部执行账号</option>
            {allAccounts.map((acc: any) => (
              <option key={acc.id} value={acc.id}>
                {acc.name || acc.id} ({acc.platform || "gzh"})
              </option>
            ))}
          </select>

          <select
            aria-label="筛选发布平台"
            className="h-8 rounded-lg border border-border bg-background px-2.5 text-ui-xs text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-primary"
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

          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground-subtle pointer-events-none" />
            <input
              type="text"
              placeholder="搜索文章标题或账号..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="h-8 w-full rounded-lg border border-border bg-background pl-8 pr-2.5 text-ui-xs text-foreground placeholder:text-foreground-subtle/60 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-ui-xs text-foreground-subtle hidden sm:inline">
            共 {historyRecords.length} 项会话批次
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchHistory}
            disabled={loadingHistory}
            className="h-8 text-ui-xs gap-1.5"
          >
            <RefreshCw className={cn("size-3.5", loadingHistory && "animate-spin")} />
            <span>刷新</span>
          </Button>
        </div>
      </div>

      {/* 记录列表 */}
      {loadingHistory && historyRecords.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-foreground-subtle space-y-2 rounded-2xl border border-card-border bg-card/40">
          <RefreshCw className="size-6 animate-spin text-primary" />
          <span className="text-ui-sm">正在加载任务执行会话记录...</span>
        </div>
      ) : historyRecords.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center space-y-3 rounded-2xl border border-card-border bg-card/40">
          <div className="size-12 rounded-full bg-surface-active/60 flex items-center justify-center text-foreground-subtle">
            <History className="size-6 opacity-40" />
          </div>
          <div className="space-y-1">
            <div className="text-ui-sm font-semibold text-foreground">暂无社媒任务执行记录</div>
            <p className="text-ui-xs text-foreground-subtle max-w-md">
              在主对话框中使用 <code>/gzh</code> 或 <code>/publish</code>{" "}
              发起内容生产与发布，系统会自动记录完整的执行批次、文章成果、排期时间与官方回执凭证。
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {historyRecords.map((batch) => {
            const isExpanded = expandedBatchIds.has(batch.id);
            const isScheduled =
              batch.publish_action === "schedule" || batch.publish_status === "scheduled";
            const isFailed = batch.status === "failed" || batch.publish_status === "failed";
            const timeStr = batch.timestamp
              ? new Date(batch.timestamp).toLocaleString("zh-CN")
              : "刚刚";

            return (
              <div
                key={batch.id}
                className="overflow-hidden rounded-xl border border-card-border bg-card/70 hover:bg-card transition-all shadow-2xs backdrop-blur-md"
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
                          {batch.articles?.[0] || "社媒图文内容批次"}
                        </span>
                        {batch.article_count > 1 && (
                          <span className="rounded-full bg-surface-active px-2 py-0.5 text-ui-xs font-medium text-foreground-subtle border border-border/60">
                            共 {batch.article_count} 篇
                          </span>
                        )}
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-ui-xs font-medium border",
                            isFailed
                              ? "bg-destructive/10 border-destructive/25 text-destructive"
                              : isScheduled
                                ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400"
                                : "bg-sky-500/10 border-sky-500/25 text-sky-600 dark:text-sky-400",
                          )}
                        >
                          {isFailed ? "执行失败" : isScheduled ? "已排期" : "已入草稿箱"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-ui-xs text-foreground-subtle mt-0.5 flex-wrap">
                        <span>账号: {batch.account_id || "default"}</span>
                        <span>·</span>
                        <span>平台: {batch.platform || "gzh"}</span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" />
                          <span>{timeStr}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="size-7 p-0 text-foreground-subtle"
                      title={isExpanded ? "收起详情" : "展开详情"}
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
                  <div className="border-t border-border/60 bg-surface/40 p-4 space-y-3 text-ui-xs">
                    <div className="font-semibold text-foreground flex items-center gap-1.5">
                      <Layers className="size-3.5 text-primary" />
                      <span>批次文章清单 ({batch.article_count} 篇)</span>
                    </div>

                    <div className="space-y-2">
                      {batch.articles && batch.articles.length > 0 ? (
                        batch.articles.map((artTitle, aIdx) => (
                          <div
                            key={aIdx}
                            className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-border/60 bg-background/60"
                          >
                            <span className="font-medium text-foreground truncate">{artTitle}</span>
                            <span className="text-foreground-subtle shrink-0">
                              第 {aIdx + 1} 篇
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="text-foreground-subtle">暂无详细文章记录</div>
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
