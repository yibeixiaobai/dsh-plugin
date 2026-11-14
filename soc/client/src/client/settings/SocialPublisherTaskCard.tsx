import { Button } from "../compat/components/ui/button.js";
import { Popover, PopoverTrigger, PopoverContent } from "../compat/components/ui/popover.js";
import {
  Clock,
  Send,
  FileText,
  ExternalLink,
  Layers,
  Image as ImageIcon,
  RefreshCw,
  XCircle,
} from "lucide-react";
import type { WechatScheduledTask } from "./SocialPublisherTypes.js";

interface TaskCardProps {
  task: WechatScheduledTask;
  index: number;
  syncing: boolean;
  cancelingTaskId: string | null;
  activeCancelPopoverId: string | null;
  onToggleCancelPopover: (id: string | null) => void;
  onCancelTask: (task: WechatScheduledTask) => void;
}

export function SocialPublisherTaskCard({
  task,
  index,
  syncing,
  cancelingTaskId,
  activeCancelPopoverId,
  onToggleCancelPopover,
  onCancelTask,
}: TaskCardProps) {
  const cardId = task.id || String(index);
  const isCanceling = cancelingTaskId === task.id;
  const isPopoverOpen = activeCancelPopoverId === cardId;

  return (
    <div
      data-testid="social-publisher-task-card"
      className={`p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-border/60 last:border-b-0 hover:bg-surface/50 transition-colors ${
        isCanceling ? "opacity-50 pointer-events-none" : ""
      }`}
    >
      {/* 左侧：时间与通知状态标签（对齐微信官方后台） */}
      <div className="space-y-2 md:w-56 shrink-0">
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-emerald-600 dark:text-emerald-400" />
          <span className="text-ui-base font-bold text-foreground tracking-tight">
            {task.display_time || "待排期"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {task.has_notification ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-ui-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <Send className="size-3" /> 已开启群发通知
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-ui-xs font-medium bg-muted text-muted-foreground border border-border">
              未开启通知 (仅主页发表)
            </span>
          )}

          {task.article_type === "newspic" ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-ui-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <ImageIcon className="size-3" /> 贴图 / 小绿书
            </span>
          ) : task.articles && task.articles.length > 1 ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-ui-xs font-medium bg-primary/10 text-primary border border-primary/20">
              <Layers className="size-3" /> 多图文 · {task.articles.length} 篇
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-ui-xs font-medium bg-surface-active text-foreground-subtle border border-border">
              单篇图文
            </span>
          )}
        </div>
      </div>

      {/* 中间/右侧：文章卡片列表（支持多图文展开与外链预览） */}
      <div className="flex-1 w-full space-y-2.5">
        {task.articles && task.articles.length > 0 ? (
          task.articles.map((art, aIdx) => (
            <div
              key={aIdx}
              className="flex items-center gap-3 p-2.5 rounded-xl border border-border/70 bg-background/60 shadow-2xs group hover:border-primary/40 transition-colors"
            >
              {art.cover_url ? (
                <img
                  src={art.cover_url}
                  alt=""
                  className="size-11 rounded-lg object-cover bg-muted shrink-0 border border-border/50"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                <div className="size-11 rounded-lg bg-surface-active/50 flex items-center justify-center shrink-0 border border-border/50">
                  <FileText className="size-5 text-foreground-subtle" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                {art.url ? (
                  <a
                    href={art.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-ui-sm font-medium text-foreground hover:text-primary transition-colors line-clamp-2 inline-flex items-center gap-1.5"
                    title={`${art.title} (点击在新窗口预览文章)`}
                  >
                    <span>{art.title}</span>
                    <ExternalLink className="size-3 text-foreground-subtle group-hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </a>
                ) : (
                  <span
                    className="text-ui-sm font-medium text-foreground line-clamp-2"
                    title={art.title}
                  >
                    {art.title}
                  </span>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="text-ui-xs text-foreground-subtle">已排期图文内容</div>
        )}
      </div>

      {/* [中文修复依据]：采用标准 Radix Portal 顶层渲染的 Popover 组件，彻底避免由于父容器 overflow-hidden 裁切导致的显示不全问题 */}
      {task.can_cancel !== false && (
        <div className="shrink-0 self-start md:self-center">
          <Popover
            open={isPopoverOpen}
            onOpenChange={(open) => onToggleCancelPopover(open ? cardId : null)}
          >
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isCanceling || syncing}
                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 text-ui-xs h-8 px-2.5 rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                title="取消发表"
              >
                {isCanceling ? (
                  <>
                    <RefreshCw className="size-3.5 animate-spin text-destructive" />
                    <span>取消中...</span>
                  </>
                ) : (
                  <>
                    <XCircle className="size-3.5 text-muted-foreground" />
                    <span>取消发表</span>
                  </>
                )}
              </Button>
            </PopoverTrigger>

            <PopoverContent
              align="end"
              side="bottom"
              sideOffset={6}
              collisionPadding={16}
              className="w-64 rounded-xl border border-popover-border bg-popover/95 p-3.5 shadow-2xl z-[100] text-left animate-in fade-in zoom-in-95 backdrop-blur-xl"
            >
              <div className="space-y-1 mb-3">
                <div className="text-ui-xs font-semibold text-foreground flex items-center gap-1.5 text-destructive">
                  <XCircle className="size-3.5 shrink-0" />
                  <span>确定取消发表？</span>
                </div>
                <p className="text-ui-2xs text-foreground-subtle leading-relaxed">
                  取消后，内容将不会发表。如果使用了通知次数也会恢复。
                </p>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/40">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-ui-xs cursor-pointer"
                  onClick={() => onToggleCancelPopover(null)}
                >
                  暂不取消
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 px-2.5 text-ui-xs bg-destructive hover:bg-destructive/90 text-destructive-foreground font-medium cursor-pointer shadow-xs"
                  onClick={() => {
                    onToggleCancelPopover(null);
                    onCancelTask(task);
                  }}
                >
                  确认取消
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}
