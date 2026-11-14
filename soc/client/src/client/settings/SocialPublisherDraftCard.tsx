import { useState } from "react";
import { Button } from "../compat/components/ui/button.js";
import { Popover, PopoverTrigger, PopoverContent } from "../compat/components/ui/popover.js";
import { Trash2, Send, AlertTriangle, Image as ImageIcon, Clock, Layers } from "lucide-react";
import type { WechatDraftCard } from "./SocialPublisherTypes.js";

interface DraftCardProps {
  card: WechatDraftCard;
  isDeleting: boolean;
  onDelete: (draftId: string, appmsgid: string, articleType?: "news" | "newspic") => void;
  hasDuplicate?: boolean;
  onOpenDuplicateClean?: () => void;
}

export function SocialPublisherDraftCard({
  card,
  isDeleting,
  onDelete,
  hasDuplicate,
  onOpenDuplicateClean,
}: DraftCardProps) {
  const [activeDeletePopover, setActiveDeletePopover] = useState(false);
  const isNewspic = card.article_type === "newspic";
  const headArticle = card.articles?.[0] || { title: "无标题", cover_url: "" };
  const isTemplateJunk = Boolean(
    headArticle.title && (/^SP-TEMPLATE/i.test(headArticle.title.trim()) || headArticle.title.trim() === "SP-TEMPLATE")
  );
  const subArticles = card.articles?.slice(1) || [];

  return (
    <div
      data-testid="social-publisher-draft-card"
      className={`break-inside-avoid rounded-xl border border-card-border bg-card/80 overflow-hidden shadow-2xs hover:shadow-md transition-all relative group flex flex-col justify-between backdrop-blur-md ${
        isDeleting ? "opacity-40 pointer-events-none scale-98" : ""
      }`}
    >
      <div>
        {/* 卡片封面图区域 */}
        <div
          className={`relative ${
            isNewspic ? "aspect-[3/4]" : "aspect-[2.35/1]"
          } bg-surface-active overflow-hidden border-b border-border/60`}
        >
          {headArticle.cover_url ? (
            <img
              src={headArticle.cover_url}
              alt={headArticle.title}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-102"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-foreground-subtle bg-surface/60">
              <ImageIcon className="size-6 opacity-35 mb-1" />
              <span className="text-ui-xs">无封面图</span>
            </div>
          )}

          {/* 顶部标签栏 */}
          <div className="absolute inset-x-2.5 top-2.5 z-20 flex items-center justify-between gap-1.5 pointer-events-none">
            <div className="pointer-events-auto">
              {isTemplateJunk ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-destructive/90 backdrop-blur-md text-white text-ui-xs font-semibold shadow-xs animate-pulse">
                  <AlertTriangle className="size-3" />
                  历史模板废稿
                </span>
              ) : isNewspic ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-600/85 backdrop-blur-md text-white text-ui-xs font-semibold shadow-xs">
                  贴图 · 小绿书
                </span>
              ) : subArticles.length > 0 ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/85 backdrop-blur-md text-white text-ui-xs font-semibold shadow-xs">
                  <Layers className="size-3" />
                  多图文 · {card.articles.length} 篇
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-background/80 backdrop-blur-md text-foreground text-ui-xs font-medium border border-border/60 shadow-xs">
                  图文长文
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 pointer-events-auto">
              {/* 重复草稿指示 */}
              {hasDuplicate && (
                <button
                  type="button"
                  title="该草稿在草稿箱中存在同名重复版本，点击前往智能清理"
                  onClick={onOpenDuplicateClean}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/90 hover:bg-amber-600 text-white text-ui-xs font-medium shadow-xs transition-colors cursor-pointer"
                >
                  <AlertTriangle className="size-3" />
                  <span>重复</span>
                </button>
              )}

              {/* [中文修复依据]：采用标准 Radix Portal 顶层渲染的 Popover 组件，彻底避免父容器 overflow-hidden 裁切导致的显示不全问题 */}
              <Popover open={activeDeletePopover} onOpenChange={setActiveDeletePopover}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    title="删除草稿"
                    className="size-7 rounded-md bg-background/85 backdrop-blur-md text-foreground-subtle hover:text-destructive hover:bg-background flex items-center justify-center transition-colors shadow-xs border border-border/60 cursor-pointer"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
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
                      <AlertTriangle className="size-3.5 shrink-0" />
                      <span>确认删除该草稿？</span>
                    </div>
                    <p className="text-ui-2xs text-foreground-subtle leading-relaxed">
                      删除草稿不会影响已公开发表的内容，但草稿箱记录不可恢复。
                    </p>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/40">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6.5 px-2.5 text-ui-xs cursor-pointer"
                      onClick={() => setActiveDeletePopover(false)}
                    >
                      取消
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-6.5 px-2.5 text-ui-xs bg-destructive hover:bg-destructive/90 text-destructive-foreground font-medium cursor-pointer shadow-xs"
                      onClick={() => {
                        setActiveDeletePopover(false);
                        onDelete(card.id, card.appmsgid, card.article_type);
                      }}
                    >
                      确认删除
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>

        {/* 卡片下部：标题与主体描述 */}
        <div className="p-3.5 space-y-2">
          <h3
            className="text-ui-sm font-semibold text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors"
            title={headArticle.title}
          >
            {headArticle.title}
            {/* 【中文修复依据】：明确标识微信自动化占位草稿，避免用户将其与排版组件库模板混淆 */}
            {/^SP-TEMPLATE$/i.test(headArticle.title || "") && (
              <span
                className="ml-1.5 inline-block text-[10px] font-normal px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                title="这是系统自动化检测或占位生成的微信空草稿，非排版组件模板；可在草稿箱查重中一键安全清理"
              >
                占位草稿
              </span>
            )}
          </h3>

          <div className="flex items-center justify-between gap-2 text-ui-xs text-foreground-subtle pt-1">
            <span className="flex items-center gap-1">
              <Clock className="size-3" />
              <span>{card.update_time_str || "刚刚更新"}</span>
            </span>

            {card.can_publish ? (
              <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-ui-xs font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <Send className="size-3" />
                <span>可发表</span>
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-ui-xs font-medium text-amber-600 dark:text-amber-400 border border-amber-500/20"
                title={card.incomplete_reason || "内容不完整"}
              >
                <AlertTriangle className="size-3" />
                <span>不完整</span>
              </span>
            )}
          </div>
        </div>

        {/* 次条图文列表（第 2 ~ 8 篇） */}
        {subArticles.length > 0 && (
          <div className="border-t border-border/60 bg-surface/30 px-3.5 py-2 space-y-1.5">
            <div className="text-ui-xs font-medium text-foreground-subtle">
              合辑附带文章 ({subArticles.length} 篇):
            </div>
            {subArticles.map((sub, sIdx) => (
              <div
                key={sIdx}
                className="flex items-center gap-2 text-ui-xs text-foreground truncate"
                title={sub.title}
              >
                <span className="size-1.5 rounded-full bg-primary shrink-0" />
                <span className="truncate">{sub.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
