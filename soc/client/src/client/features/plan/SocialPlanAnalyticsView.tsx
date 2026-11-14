import { useState, useEffect, useCallback } from "react";
import { TrendingUp, Eye, Heart, MessageSquare, Bookmark, Share2, Sparkles, RefreshCw } from "lucide-react";
import { useOptionalServices } from "../../compat/hooks/useServices.js";
import { publisherApiFetch, safeParseJson } from "../../settings/SocialPublisherTypes.js";
import { Button } from "../../compat/components/ui/button.js";
import { toast } from "../../compat/components/ui/toast.js";

interface ArticleMetrics {
  id: string;
  title: string;
  platform: string;
  accountId: string;
  publishedAt: string;
  reads: number;
  likes: number;
  comments: number;
  collects: number;
  shares: number;
  viralScore: number;
  hookAngle?: string;
  lastUpdated: string;
}

interface AnalyticsSummary {
  totalReads: number;
  totalEngagements: number;
  avgEngagementRate: number;
  topArticles: ArticleMetrics[];
  topHookAngles: Array<{ angle: string; avgScore: number; count: number }>;
}

interface SocialPlanAnalyticsViewProps {
  selectedAccountId?: string;
  onRefresh?: () => void;
}

export function SocialPlanAnalyticsView({
  selectedAccountId,
  onRefresh: _unusedRefresh,
}: SocialPlanAnalyticsViewProps) {
  const services = useOptionalServices();
  const socialPublisherRpc = services?.socialPublisherService ?? null;

  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [summary, setSummary] = useState<AnalyticsSummary>({
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
    } catch (err) {
      console.warn("[SocialPlanAnalyticsView] 加载数据表现失败:", err);
    } finally {
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
      const res = await publisherApiFetch(
        "/api/gzh-publisher/analytics/sync",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account_id: selectedAccountId || "default" }),
        },
        socialPublisherRpc,
      );
      const parsed = await safeParseJson(res);
      if (parsed.ok) {
        toast("已成功从各平台按需同步最新数据表现！");
        await fetchMetrics();
      } else {
        toast("同步数据表现未完成，请重试");
      }
    } catch (err) {
      toast("拉取数据异常: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div data-testid="social-plan-analytics-view" className="space-y-6">
      {/* 顶部指标统计看板 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-xl border border-card-border bg-card shadow-sm space-y-1">
          <div className="flex items-center justify-between text-ui-2xs font-medium text-foreground-muted">
            <span>总阅读/播放量</span>
            <Eye className="size-3.5 text-primary/70" />
          </div>
          <p className="text-ui-xl font-bold font-mono tracking-tight text-foreground">
            {summary.totalReads.toLocaleString()}
          </p>
        </div>

        <div className="p-4 rounded-xl border border-card-border bg-card shadow-sm space-y-1">
          <div className="flex items-center justify-between text-ui-2xs font-medium text-foreground-muted">
            <span>总互动总量</span>
            <Heart className="size-3.5 text-rose-500/70" />
          </div>
          <p className="text-ui-xl font-bold font-mono tracking-tight text-foreground">
            {summary.totalEngagements.toLocaleString()}
          </p>
        </div>

        <div className="p-4 rounded-xl border border-card-border bg-card shadow-sm space-y-1">
          <div className="flex items-center justify-between text-ui-2xs font-medium text-foreground-muted">
            <span>平均互动转化率</span>
            <TrendingUp className="size-3.5 text-emerald-500/70" />
          </div>
          <p className="text-ui-xl font-bold font-mono tracking-tight text-foreground">
            {summary.avgEngagementRate}%
          </p>
        </div>

        <div className="p-4 rounded-xl border border-card-border bg-card shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-ui-2xs font-medium text-foreground-muted">
            <span>按需同步</span>
            <Sparkles className="size-3.5 text-amber-500/70" />
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={syncing || loading}
            onClick={handleSyncLatest}
            className="w-full h-8 text-ui-2xs gap-1.5 mt-2 border-border/80"
          >
            <RefreshCw className={`size-3 ${syncing ? "animate-spin text-primary" : ""}`} />
            {syncing ? "拉取中..." : "拉取最新表现"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧：爆款切角加权榜（反哺选题雷达） */}
        <div className="lg:col-span-1 p-5 rounded-2xl border border-card-border bg-card shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h4 className="text-ui-sm font-semibold text-foreground">高热度切角排行</h4>
          </div>
          <p className="text-ui-2xs text-foreground-muted">
            系统根据以下高互动切角在选题推荐中自动给予 +15% 爆款加权。
          </p>

          <div className="space-y-2.5">
            {summary.topHookAngles.length === 0 ? (
              <p className="text-ui-2xs text-foreground-muted py-4 text-center">暂无切角统计数据</p>
            ) : (
              summary.topHookAngles.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-surface-subtle border border-border/50 text-ui-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="size-5 rounded-full bg-primary/10 text-primary text-ui-2xs font-bold flex items-center justify-center flex-shrink-0">
                      {idx + 1}
                    </span>
                    <span className="font-medium text-foreground truncate">{item.angle}</span>
                  </div>
                  <span className="text-ui-2xs font-mono font-semibold text-primary flex-shrink-0 ml-2">
                    {item.avgScore} 分
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 右侧：文章互动表现清单 */}
        <div className="lg:col-span-2 p-5 rounded-2xl border border-card-border bg-card shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-primary" />
              <h4 className="text-ui-sm font-semibold text-foreground">已发图文表现清单</h4>
            </div>
            <span className="text-ui-2xs text-foreground-muted font-mono">
              共 {summary.topArticles.length} 篇
            </span>
          </div>

          <div className="space-y-2.5">
            {summary.topArticles.length === 0 ? (
              <p className="text-ui-2xs text-foreground-muted py-8 text-center">暂无发布图文表现数据</p>
            ) : (
              summary.topArticles.map((art) => (
                <div
                  key={art.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl bg-surface-subtle border border-border/50 gap-2 hover:border-border transition-colors"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-ui-xs font-semibold text-foreground truncate">{art.title}</p>
                    <div className="flex items-center gap-2 text-ui-2xs text-foreground-muted">
                      <span className="uppercase px-1 py-0.2 rounded bg-surface border border-border text-[10px]">
                        {art.platform}
                      </span>
                      <span>发布于 {art.publishedAt.slice(0, 10)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3.5 text-ui-2xs text-foreground-muted font-mono flex-shrink-0">
                    <span className="flex items-center gap-1" title="阅读">
                      <Eye className="size-3 text-foreground-muted/70" />
                      {art.reads}
                    </span>
                    <span className="flex items-center gap-1" title="赞">
                      <Heart className="size-3 text-rose-500/70" />
                      {art.likes}
                    </span>
                    <span className="flex items-center gap-1" title="评论">
                      <MessageSquare className="size-3 text-blue-500/70" />
                      {art.comments}
                    </span>
                    <span className="flex items-center gap-1" title="收藏">
                      <Bookmark className="size-3 text-amber-500/70" />
                      {art.collects}
                    </span>
                    <span className="flex items-center gap-1" title="分享">
                      <Share2 className="size-3 text-emerald-500/70" />
                      {art.shares}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
