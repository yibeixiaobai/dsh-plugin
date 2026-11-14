import React, { useState, useMemo, useCallback } from "react";
import { Sparkles, GripVertical, Image as ImageIcon, Hash, FileText } from "lucide-react";
import type { ArticleItem } from "../../core/socialPublisherWorkflowExtractor.js";
import { resolveSafeMediaPreviewUrl } from "../../core/slices/sandboxedMediaResolver.js";
import { Button } from "../../../compat/components/ui/button.js";
import { cn } from "../../../compat/components/lib/utils.js";

interface XhsInteractiveCanvasProps {
  article: ArticleItem;
  workspacePath?: string;
  workspaceIdentity?: string;
  sessionId?: string;
  taskId?: string;
  onUpdateArticle?: (updated: ArticleItem) => void;
}

export function XhsInteractiveCanvas({
  article,
  workspacePath,
  workspaceIdentity,
  sessionId,
  taskId: _taskId,
  onUpdateArticle,
}: XhsInteractiveCanvasProps) {
  const [selectedCardIdx, setSelectedCardIdx] = useState(0);
  const [draggedCardIdx, setDraggedCardIdx] = useState<number | null>(null);

  // 聚合所有图片（首图封面 + 正文卡片图）
  const allImages = useMemo(() => {
    const list: string[] = [];
    if (article.coverUrl) list.push(article.coverUrl);
    for (const img of article.images || []) {
      if (!list.includes(img)) list.push(img);
    }
    return list;
  }, [article.coverUrl, article.images]);

  // 解析安全本地预览 URL 列表
  const resolvedImageUrls = useMemo(() => {
    return allImages.map((raw) =>
      resolveSafeMediaPreviewUrl({
        rawUrlOrPath: raw,
        workspacePath,
        workspaceIdentity,
        sessionId,
        scriptsDir: article.scriptsDir,
      }) || raw,
    );
  }, [allImages, workspacePath, workspaceIdentity, sessionId, article.scriptsDir]);

  // 拖拽重排
  const handleDragStart = (idx: number) => {
    setDraggedCardIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (draggedCardIdx === null || draggedCardIdx === targetIdx) return;
    const nextImages = [...allImages];
    const [moved] = nextImages.splice(draggedCardIdx, 1);
    if (moved) {
      nextImages.splice(targetIdx, 0, moved);
      setDraggedCardIdx(targetIdx);
      if (onUpdateArticle) {
        onUpdateArticle({
          ...article,
          coverUrl: nextImages[0] || article.coverUrl,
          images: nextImages,
        });
      }
    }
  };

  const handleDragEnd = () => {
    setDraggedCardIdx(null);
  };

  // 触发全局单图 AI 重新生成弹窗
  const handleRegenerateImage = useCallback((idx: number) => {
    window.dispatchEvent(
      new CustomEvent("wincode:social-studio-regenerate-image", {
        detail: {
          articleIndex: article.index || 1,
          slotId: `slot_${idx + 1}`,
          kind: idx === 0 ? "pic_cover" : "pic_card",
          ratio: "3:4",
          article,
        },
      }),
    );
  }, [article]);

  return (
    <div
      data-testid="xhs-interactive-canvas"
      className="flex flex-col lg:flex-row gap-6 max-w-6xl mx-auto h-full min-h-0 select-none"
    >
      {/* 左侧：3:4 竖版多图画廊与卡片轮播 */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-0">
        <div className="relative w-full max-w-[360px] aspect-[3/4] rounded-2xl overflow-hidden shadow-2xl border border-border/80 bg-surface-subtle group">
          {resolvedImageUrls[selectedCardIdx] ? (
            <img
              src={resolvedImageUrls[selectedCardIdx]}
              alt={`卡片 ${selectedCardIdx + 1}`}
              className="w-full h-full object-cover select-none pointer-events-none"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-6 text-foreground-muted bg-surface/80">
              <ImageIcon className="size-10 stroke-1 opacity-60 animate-pulse" />
              <p className="text-ui-xs font-medium">3:4 竖版海报卡片生成中</p>
            </div>
          )}

          {/* 首图大字报标题底衬浮层 */}
          {selectedCardIdx === 0 && (
            <div className="absolute top-6 left-4 right-4 p-3 rounded-lg bg-black/75 backdrop-blur-md border border-white/10 text-white shadow-lg">
              <span className="text-ui-2xs font-semibold px-1.5 py-0.5 rounded bg-primary text-primary-foreground mr-2">
                爆款首图
              </span>
              <span className="text-ui-sm font-bold tracking-tight">
                {article.title || "未命名小红书笔记"}
              </span>
            </div>
          )}

          {/* 右上角 AI 重新生图热键 */}
          <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              size="sm"
              variant="secondary"
              className="h-7 px-2 text-ui-2xs gap-1 bg-surface/90 backdrop-blur shadow-sm hover:bg-surface-hover"
              onClick={() => handleRegenerateImage(selectedCardIdx)}
            >
              <Sparkles className="size-3 text-primary" />
              重新设计
            </Button>
          </div>

          {/* 底部张数指示器 */}
          {resolvedImageUrls.length > 0 && (
            <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded-full bg-black/60 text-white text-ui-2xs font-mono backdrop-blur-sm">
              {selectedCardIdx + 1} / {resolvedImageUrls.length}
            </div>
          )}
        </div>

        {/* 缩略图横向可拖拽排序条 */}
        {resolvedImageUrls.length > 1 && (
          <div className="flex gap-2 mt-4 p-1.5 bg-surface-subtle rounded-xl border border-border/60 overflow-x-auto max-w-full custom-scrollbar">
            {resolvedImageUrls.map((url, idx) => (
              <div
                key={idx}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                onClick={() => setSelectedCardIdx(idx)}
                className={cn(
                  "relative w-14 aspect-[3/4] rounded-lg overflow-hidden border cursor-pointer transition-all flex-shrink-0 group/item",
                  selectedCardIdx === idx
                    ? "border-primary ring-2 ring-primary/20 shadow-md scale-105"
                    : "border-border/60 hover:border-foreground-muted opacity-80 hover:opacity-100",
                  draggedCardIdx === idx && "opacity-40",
                )}
              >
                <img src={url} alt={`缩略图 ${idx + 1}`} className="w-full h-full object-cover" />
                <div className="absolute top-0.5 left-0.5 p-0.5 bg-black/60 rounded text-white text-[9px] font-mono leading-none">
                  {idx === 0 ? "封面" : idx + 1}
                </div>
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/item:opacity-100 bg-black/30 transition-opacity">
                  <GripVertical className="size-3.5 text-white" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 右侧：小红书文案与话题标签排版编辑器 */}
      <div className="w-full lg:w-[420px] flex flex-col gap-4 p-4 bg-surface rounded-2xl border border-border/70 overflow-hidden shadow-sm">
        <div className="flex items-center gap-2 border-b border-border/60 pb-3">
          <FileText className="size-4 text-primary" />
          <h4 className="text-ui-sm font-semibold text-foreground">小红书文案与热门话题</h4>
          <span className="text-ui-2xs text-foreground-muted ml-auto font-mono">
            {article.content ? article.content.length : 0} 字
          </span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
          {/* 标题 */}
          <div className="space-y-1.5">
            <label className="text-ui-2xs font-medium text-foreground-muted">爆款标题 (≤20字)</label>
            <input
              type="text"
              maxLength={20}
              value={article.title || ""}
              onChange={(e) => {
                if (onUpdateArticle) {
                  onUpdateArticle({ ...article, title: e.target.value });
                }
              }}
              className="w-full px-3 py-2 rounded-lg bg-surface-subtle border border-border/60 text-ui-sm font-bold focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="输入小红书爆款标题..."
            />
          </div>

          {/* 正文文案 */}
          <div className="space-y-1.5 flex-1">
            <label className="text-ui-2xs font-medium text-foreground-muted">文案正文</label>
            <textarea
              rows={12}
              value={article.content || ""}
              onChange={(e) => {
                if (onUpdateArticle) {
                  onUpdateArticle({ ...article, content: e.target.value });
                }
              }}
              className="w-full px-3 py-2 rounded-lg bg-surface-subtle border border-border/60 text-ui-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary resize-none custom-scrollbar"
              placeholder="正文内容..."
            />
          </div>

          {/* 标签 */}
          {article.tags && article.tags.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-ui-2xs font-medium text-foreground-muted flex items-center gap-1">
                <Hash className="size-3 text-primary" />
                推荐热门话题
              </label>
              <div className="flex flex-wrap gap-1.5">
                {article.tags.map((tag, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-ui-2xs font-medium"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
