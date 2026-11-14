import { useState, useMemo, useEffect } from "react";
import { Button } from "../../compat/components/ui/button.js";
import {
  Search,
  X,
  CopyCheck,
  CheckCircle2,
  AlertCircle,
  FileText,
  Image as ImageIcon,
  RefreshCw,
} from "lucide-react";
import { type WechatDraftCard } from "../../settings/SocialPublisherTypes.js";
import { SocialPublisherDraftCard } from "../../settings/SocialPublisherDraftCard.js";
import { SocialPublisherDraftsDuplicateDialog } from "../../settings/SocialPublisherDraftsDuplicateDialog.js";
import { useSocialPublisherDrafts } from "../../settings/useSocialPublisherDrafts.js";
import { normalizeSocialDraftTitle } from "../../settings/socialPublisherTitleHelper.js";
import { useMembership } from "../../compat/hooks/useMembership.js";
import { ProFeatureGateModal } from "../../settings/ProFeatureGateModal.js";
import { cn } from "../../compat/components/lib/utils.js";

interface SocialPlanDraftsViewProps {
  currentAccountId: string;
  accountName?: string;
  socialPublisherRpc?: any;
  onDraftCountChange?: (count: number) => void;
  refreshKey?: number;
}

export function SocialPlanDraftsView({
  currentAccountId,
  accountName,
  socialPublisherRpc,
  onDraftCountChange,
  refreshKey = 0,
}: SocialPlanDraftsViewProps) {
  const { checkFeature } = useMembership();
  const [featureGateOpen, setFeatureGateOpen] = useState(false);
  const [activeTabType, setActiveTabType] = useState<"news" | "newspic">("news");
  const [searchKeyword, setSearchKeyword] = useState("");

  const {
    drafts,
    loading,
    syncing,
    statusMessage,
    setStatusMessage,
    deletingId,
    triggerSync,
    handleDeleteDraft,
    showDuplicateModal,
    setShowDuplicateModal,
    scanningDuplicates,
    duplicateStrategy,
    duplicateScanResult,
    selectedDeleteIds,
    setSelectedDeleteIds,
    cleaningDuplicates,
    handleOpenDuplicateModal,
    handleStrategyChange,
    handleBatchCleanDuplicates,
  } = useSocialPublisherDrafts(currentAccountId, socialPublisherRpc);

  useEffect(() => {
    onDraftCountChange?.(drafts.length);
  }, [drafts.length, onDraftCountChange]);

  useEffect(() => {
    if (refreshKey > 0 && currentAccountId) {
      triggerSync();
    }
  }, [refreshKey, currentAccountId, triggerSync]);

  const articleCount = useMemo(
    () => (drafts as any[]).filter((d: any) => d.article_type === "news").length,
    [drafts],
  );
  const newspicCount = useMemo(
    () => (drafts as any[]).filter((d: any) => d.article_type === "newspic").length,
    [drafts],
  );

  // 自动检测当前账号草稿箱中是否存在同名重复草稿集合
  const duplicateTitleSet = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of drafts as any[]) {
      const title = d.articles?.[0]?.title || d.title || "";
      const norm = normalizeSocialDraftTitle(title);
      if (norm && norm.length >= 3) {
        counts.set(norm, (counts.get(norm) || 0) + 1);
      }
    }
    const set = new Set<string>();
    for (const [k, count] of counts.entries()) {
      if (count > 1) set.add(k);
    }
    return set;
  }, [drafts]);

  const filteredDrafts = useMemo(() => {
    let list = (drafts as any[]).filter((d: any) => d.article_type === activeTabType);
    if (searchKeyword.trim()) {
      const kw = searchKeyword.trim().toLowerCase();
      list = list.filter((d: any) => {
        const inMain = d.articles?.[0]?.title?.toLowerCase()?.includes(kw);
        const inSub = d.articles?.some((a: any) => a.title?.toLowerCase()?.includes(kw));
        return inMain || inSub;
      });
    }
    return list;
  }, [drafts, activeTabType, searchKeyword]);

  const displayName = accountName || currentAccountId || "默认公众号";

  return (
    <div className="space-y-3.5" data-testid="social-plan-drafts-view">
      {/* 头部面板 */}
      <div className="rounded-xl border border-card-border/80 bg-card/60 p-3.5 shadow-2xs backdrop-blur-md">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-ui-sm font-semibold text-foreground tracking-tight">
                微信公众平台官方草稿库
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="size-3" />
                后台直通
              </span>
            </div>
            <p className="text-[11px] text-foreground-subtle">
              当前账号：<strong className="text-foreground font-medium">{displayName}</strong>（删除草稿不会影响已群发或已发表的内容）
            </p>
          </div>

          {/* 实时搜索框 */}
          <div className="relative w-full sm:w-64">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground-subtle pointer-events-none" />
            <input
              type="text"
              placeholder="搜索草稿标题或摘要..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="w-full h-8.5 pl-8 pr-7 rounded-lg border border-border/80 bg-background text-ui-xs text-foreground placeholder:text-foreground-subtle/60 focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
            />
            {searchKeyword ? (
              <button
                type="button"
                onClick={() => setSearchKeyword("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-foreground-subtle hover:text-foreground p-0.5 cursor-pointer"
                title="清空"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
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
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-foreground-subtle hover:text-foreground cursor-pointer"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}

      {/* 分类切换器与治理操作条 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border/70 pb-2.5">
        <div className="flex items-center gap-1 rounded-xl bg-surface/80 p-1 border border-card-border/80 shadow-2xs">
          <button
            type="button"
            onClick={() => setActiveTabType("news")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-ui-xs font-semibold transition-all cursor-pointer",
              activeTabType === "news"
                ? "bg-card text-foreground shadow-2xs border border-border/80"
                : "text-foreground-subtle hover:text-foreground",
            )}
          >
            <FileText className="size-3.5 text-primary" />
            <span>图文长文</span>
            <span className="rounded-full bg-surface-active px-1.5 py-0.2 text-[10px] font-mono text-foreground-subtle border border-border/40">
              {articleCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTabType("newspic")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-ui-xs font-semibold transition-all cursor-pointer",
              activeTabType === "newspic"
                ? "bg-card text-foreground shadow-2xs border border-border/80"
                : "text-foreground-subtle hover:text-foreground",
            )}
          >
            <ImageIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>小绿书/贴图</span>
            <span className="rounded-full bg-surface-active px-1.5 py-0.2 text-[10px] font-mono text-foreground-subtle border border-border/40">
              {newspicCount}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
              const gate = await checkFeature("drafts_batch_cleanup");
              if (!gate.allowed) {
                setFeatureGateOpen(true);
                return;
              }
              handleOpenDuplicateModal();
            }}
            disabled={drafts.length === 0 || loading || syncing}
            className="h-8 gap-1.5 text-ui-xs border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 rounded-lg shadow-2xs"
          >
            <CopyCheck className="size-3.5 text-amber-500" />
            <span>治理同名重复草稿</span>
          </Button>
        </div>
      </div>

      {/* 草稿卡片瀑布流 */}
      {loading && drafts.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-14 text-foreground-subtle space-y-2 rounded-xl border border-card-border/80 bg-card/40">
          <RefreshCw className="size-5 animate-spin text-primary" />
          <span className="text-ui-sm font-medium">正在读取微信公众号草稿箱...</span>
        </div>
      ) : filteredDrafts.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-14 text-center rounded-xl border border-card-border/80 bg-card/40 space-y-3">
          <div className="size-11 rounded-full bg-surface-active/60 flex items-center justify-center text-foreground-subtle border border-border/40">
            <FileText className="size-5 opacity-60" />
          </div>
          <div className="space-y-1">
            <div className="text-ui-sm font-semibold text-foreground">
              {searchKeyword
                ? "未搜索到匹配的草稿"
                : `当前无「${activeTabType === "news" ? "文章" : "贴图"}」草稿`}
            </div>
            <p className="text-ui-xs text-foreground-subtle max-w-md mx-auto leading-relaxed">
              {searchKeyword
                ? `尝试使用其他关键词，或清除搜索框重试。`
                : `当前微信公众号后台暂无该类型的草稿。可点击顶部的「一键同步排期与草稿」获取后台最新数据，或在主对话中使用 /gzh 创作全新长文。`}
            </p>
          </div>
        </div>
      ) : (
        <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-3.5 space-y-3.5">
          {filteredDrafts.map((card: WechatDraftCard) => {
            const headTitle = card.articles?.[0]?.title || (card as any).title || "";
            const norm = normalizeSocialDraftTitle(headTitle);
            const isDup = norm.length >= 3 && duplicateTitleSet.has(norm);
            return (
              <SocialPublisherDraftCard
                key={card.id || card.appmsgid}
                card={card}
                isDeleting={deletingId === card.id}
                onDelete={handleDeleteDraft}
                hasDuplicate={isDup}
                onOpenDuplicateClean={handleOpenDuplicateModal}
              />
            );
          })}
        </div>
      )}

      {/* 清理重复草稿看板弹窗 */}
      <SocialPublisherDraftsDuplicateDialog
        open={showDuplicateModal}
        onClose={() => setShowDuplicateModal(false)}
        scanning={scanningDuplicates}
        cleaning={cleaningDuplicates}
        scanResult={duplicateScanResult}
        strategy={duplicateStrategy}
        onStrategyChange={handleStrategyChange}
        selectedDeleteIds={selectedDeleteIds}
        onToggleSelect={(appmsgid: string) => {
          const next = new Set(selectedDeleteIds);
          if (next.has(appmsgid)) next.delete(appmsgid);
          else next.add(appmsgid);
          setSelectedDeleteIds(next);
        }}
        onConfirmClean={handleBatchCleanDuplicates}
      />

      <ProFeatureGateModal
        open={featureGateOpen}
        onOpenChange={setFeatureGateOpen}
        featureId="drafts_batch_cleanup"
        featureTitle="微信公众号重复草稿批量安全治理"
        description="系统将基于正文指纹与相似度算法智能归集重复草稿，并提供一键保留最新版本、批量安全清理的特权治理能力。"
        onConfirmTrial={() => {
          setFeatureGateOpen(false);
          handleOpenDuplicateModal();
        }}
      />
    </div>
  );
}
