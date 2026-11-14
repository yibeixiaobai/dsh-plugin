import { Button } from "../compat/components/ui/button.js";
import { RefreshCw, X, CopyCheck, CheckCircle2, Trash2 } from "lucide-react";
import type { DuplicateScanResult } from "./SocialPublisherTypes.js";

interface DuplicateDialogProps {
  open: boolean;
  onClose: () => void;
  scanning: boolean;
  cleaning: boolean;
  scanResult: DuplicateScanResult | null;
  strategy: "keep_latest" | "keep_complete" | "keep_oldest";
  onStrategyChange: (strategy: "keep_latest" | "keep_complete" | "keep_oldest") => void;
  selectedDeleteIds: Set<string>;
  onToggleSelect: (appmsgid: string) => void;
  onConfirmClean: () => void;
}

export function SocialPublisherDraftsDuplicateDialog({
  open,
  onClose,
  scanning,
  cleaning,
  scanResult,
  strategy,
  onStrategyChange,
  selectedDeleteIds,
  onToggleSelect,
  onConfirmClean,
}: DuplicateDialogProps) {
  if (!open) return null;

  return (
    <div
      data-testid="social-publisher-duplicate-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in"
    >
      <div className="w-full max-w-2xl max-h-[85vh] rounded-2xl border border-card-border bg-popover shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 backdrop-blur-2xl">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-border/80 flex items-center justify-between bg-surface/60">
          <div className="flex items-center gap-2">
            <CopyCheck className="size-5 text-amber-500" />
            <h3 className="text-ui-base font-bold text-foreground">重复草稿智能治理看板</h3>
            <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-ui-xs font-semibold text-amber-600 dark:text-amber-400 border border-amber-500/20">
              安全预检模式
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-foreground-subtle hover:text-foreground p-1 rounded transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {scanning ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-2 text-foreground-subtle">
              <RefreshCw className="size-6 animate-spin text-amber-500" />
              <span className="text-ui-sm font-medium">正在扫描并比对重复草稿...</span>
            </div>
          ) : !scanResult || scanResult.groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-2">
              <CheckCircle2 className="size-10 text-emerald-500" />
              <div className="text-ui-sm font-semibold text-foreground">未发现重复草稿</div>
              <p className="text-ui-xs text-foreground-subtle max-w-sm">
                当前草稿箱内所有文章标题均唯一独立，没有需要清理的冗余历史版本。
              </p>
            </div>
          ) : (
            <>
              {/* 统计指标与策略选择 */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.04]">
                <div className="text-ui-xs text-foreground space-y-0.5">
                  <div>
                    共扫描 <strong>{scanResult.total_drafts_scanned}</strong> 篇草稿，发现{" "}
                    <strong className="text-amber-600 dark:text-amber-400">
                      {scanResult.duplicate_groups_count}
                    </strong>{" "}
                    组同名草稿。
                  </div>
                  <div className="text-foreground-subtle">
                    预计可安全清理{" "}
                    <strong className="text-destructive">{selectedDeleteIds.size}</strong>{" "}
                    篇冗余草稿。
                  </div>
                </div>

                {/* 策略切换 */}
                <div className="flex items-center gap-2">
                  <span className="text-ui-xs text-foreground-subtle font-medium shrink-0">
                    保留策略:
                  </span>
                  <select
                    value={strategy}
                    onChange={(e) => onStrategyChange(e.target.value as any)}
                    className="h-8 rounded-lg border border-border bg-background px-2 text-ui-xs text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
                  >
                    <option value="keep_latest">保留最新更新 (推荐)</option>
                    <option value="keep_complete">保留完整无报错</option>
                    <option value="keep_oldest">保留最早创建</option>
                  </select>
                </div>
              </div>

              {/* 分组清单 */}
              <div className="space-y-3">
                {scanResult.groups.map((group, gIdx) => (
                  <div
                    key={gIdx}
                    className="rounded-xl border border-border/70 bg-surface/50 overflow-hidden text-ui-xs"
                  >
                    <div className="bg-surface-active/60 px-3.5 py-2 font-semibold text-foreground flex items-center justify-between border-b border-border/40">
                      <span className="truncate max-w-md">同名组：{group.normalized_title}</span>
                      <span className="text-ui-xs text-foreground-subtle font-normal">
                        共 {group.items.length} 篇 (建议清理 {group.redundant_count} 篇)
                      </span>
                    </div>

                    <div className="divide-y divide-border/40 p-2 space-y-1.5">
                      {group.items.map((item) => {
                        const isChecked = selectedDeleteIds.has(item.appmsgid);
                        return (
                          <div
                            key={item.appmsgid}
                            className={`flex items-center justify-between gap-3 p-2 rounded-lg transition-colors ${
                              item.is_recommended_keep
                                ? "bg-emerald-500/10 border border-emerald-500/20"
                                : isChecked
                                  ? "bg-destructive/5"
                                  : "bg-surface"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => onToggleSelect(item.appmsgid)}
                                className="size-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                              />

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-foreground truncate">
                                    {item.title}
                                  </span>
                                  {item.is_recommended_keep && (
                                    <span className="shrink-0 rounded bg-emerald-600 text-white px-1.5 py-0.2 text-ui-xs font-bold">
                                      推荐保留
                                    </span>
                                  )}
                                  {!item.is_complete && (
                                    <span className="shrink-0 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 px-1.5 py-0.2 text-ui-xs font-semibold">
                                      不完整
                                    </span>
                                  )}
                                </div>
                                <div className="text-foreground-subtle text-ui-xs mt-0.5">
                                  {item.update_time_str} · {item.article_count} 篇图文 · ID:{" "}
                                  {item.appmsgid}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 sm:p-4 border-t border-border/80 flex items-center justify-between bg-surface/60">
          <span className="text-ui-xs text-foreground-subtle">
            已选定清理 {selectedDeleteIds.size} 篇重复草稿
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 text-ui-xs"
            >
              取消
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={cleaning || selectedDeleteIds.size === 0}
              onClick={onConfirmClean}
              className="h-8 text-ui-xs bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-1.5 font-medium"
            >
              <Trash2 className="size-3.5" />
              <span>
                {cleaning ? "批量清理中..." : `确认清理选中的 (${selectedDeleteIds.size}) 篇草稿`}
              </span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
