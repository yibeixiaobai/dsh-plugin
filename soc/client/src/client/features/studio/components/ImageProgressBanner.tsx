import { ImageIcon } from "lucide-react";
import type { ExtractedSocialWorkflow } from "../../core/socialPublisherWorkflowExtractor.js";

export interface ImageProgressBannerProps {
  imageProgress: NonNullable<ExtractedSocialWorkflow["imageProgress"]>;
}

/**
 * 配图生成进度指示槽
 * 【中文修复依据】：彻底移除 Sparkles 与旋转星芒动效，改为出版软件专业低噪的线性微进度槽
 */
export function ImageProgressBanner({ imageProgress }: ImageProgressBannerProps) {
  const pct = Math.round(imageProgress.percentage);
  return (
    <div
      data-testid="studio-image-progress-banner"
      className="flex items-center gap-3 px-4 py-1.5 bg-surface/30 border-b border-border/30 shrink-0 text-ui-2xs text-foreground-muted"
    >
      <div className="flex items-center gap-1.5 shrink-0 font-medium">
        <ImageIcon className="size-3 text-foreground-muted" />
        <span>配图渲染中</span>
      </div>

      <div className="flex-1 min-w-0 flex items-center gap-2">
        <div className="flex-1 h-1 rounded-full bg-border/40 overflow-hidden">
          <div
            className="h-full rounded-full bg-primary/70 transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="font-mono tabular-nums shrink-0 text-[11px]">
          {imageProgress.current}/{imageProgress.total} ({pct}%)
        </span>
      </div>

      {imageProgress.currentArticleIndex > 0 && (
        <span className="font-mono shrink-0 text-[11px]">
          篇目 #{imageProgress.currentArticleIndex}
        </span>
      )}
    </div>
  );
}
