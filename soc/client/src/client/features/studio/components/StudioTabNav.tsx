import { useState, useRef, useEffect, useCallback } from "react";
import {
  Layers,
  FileText,
  Smartphone,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { type ArticleItem, resolveTargetCardCount } from "../../core/socialPublisherWorkflowExtractor.js";
import css from "./StudioTabNav.module.css";

export interface StudioTabNavProps {
  articles: ArticleItem[];
  currentIndex: number;
  showOverview: boolean;
  hasGzh: boolean;
  onSelectIndex: (idx: number) => void;
  onSelectOverview: () => void;
  imageProgress?: {
    current: number;
    total: number;
    percentage: number;
    currentArticleIndex: number;
    isGenerating: boolean;
  };
}

function getArticleTabLabel(art: ArticleItem, idx: number, allArticles: ArticleItem[]): string {
  const isNewspic = art.articleType === "newspic";
  const isXhs = art.platform === "xiaohongshu";
  const isGzh = art.platform === "gzh";

  if (isNewspic) {
    const sameNewspics = allArticles.filter((a) => a.articleType === "newspic");
    if (sameNewspics.length > 1) {
      const n = sameNewspics.findIndex((a) => a.id === art.id) + 1;
      return `小绿书 #${n > 0 ? n : idx + 1}`;
    }
    return "小绿书";
  }
  if (isGzh) {
    const sameGzh = allArticles.filter((a) => a.platform === "gzh" && a.articleType !== "newspic");
    if (sameGzh.length > 1) {
      const slotNum = typeof art.index === "number" && art.index > 0 ? art.index : sameGzh.findIndex((a) => a.id === art.id) + 1;
      return slotNum === 1 ? "头条" : `#${slotNum} 次条`;
    }
    return "公众号";
  }
  if (isXhs) {
    const sameXhs = allArticles.filter((a) => a.platform === "xiaohongshu");
    if (sameXhs.length > 1) {
      const xIdx = sameXhs.findIndex((a) => a.id === art.id) + 1;
      return `小红书 #${xIdx > 0 ? xIdx : idx + 1}`;
    }
    return "小红书";
  }

  const platformNames: Record<string, string> = {
    zhihu: "知乎",
    toutiao: "头条",
    baijiahao: "百家号",
  };
  return platformNames[art.platform] ?? art.platformName ?? `#${idx + 1}`;
}

/**
 * 顶部篇目分段胶囊导航
 */
export function StudioTabNav({
  articles,
  currentIndex,
  showOverview,
  hasGzh,
  onSelectIndex,
  onSelectOverview,
  imageProgress,
}: StudioTabNavProps) {
  const showOverviewButton = hasGzh && articles.length > 1;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);

  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // 检测可滚动状态
  const checkScrollState = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const hasOverflow = el.scrollWidth > el.clientWidth + 2;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(hasOverflow && el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    checkScrollState();
    const el = scrollContainerRef.current;
    if (!el) return;

    const resizeObserver = new ResizeObserver(() => {
      checkScrollState();
    });
    resizeObserver.observe(el);

    return () => {
      resizeObserver.disconnect();
    };
  }, [checkScrollState, articles.length]);

  // 鼠标滚轮平滑横滑
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (e.deltaY !== 0 && Math.abs(e.deltaX) === 0) {
      el.scrollLeft += e.deltaY;
      checkScrollState();
      e.preventDefault();
    }
  };

  // 选中篇目变化时，自动平滑滚动居中可见
  useEffect(() => {
    if (!showOverview && activeTabRef.current) {
      activeTabRef.current.scrollIntoView?.({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
  }, [currentIndex, showOverview]);

  // 平滑手动微步滚动
  const handleScrollStep = (direction: "left" | "right") => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const step = 140;
    el.scrollBy({ left: direction === "left" ? -step : step, behavior: "smooth" });
  };

  return (
    <div
      data-testid="studio-tab-nav"
      className={css.tabNav}
    >
      {/* 1. 左侧常驻固定区：合辑总览 */}
      {showOverviewButton && (
        <div className={css.overviewSection}>
          <button
            type="button"
            onClick={onSelectOverview}
            className={`${css.overviewBtn} ${showOverview ? css.overviewBtnActive : ""}`}
          >
            <Layers className={css.overviewIcon} />
            <span>合辑总览</span>
          </button>
          <span className={css.overviewDivider} />
        </div>
      )}

      {/* 2. 右侧独立滚动区 */}
      <div className={css.scrollArea}>
        {canScrollLeft && (
          <button
            type="button"
            onClick={() => handleScrollStep("left")}
            className={`${css.scrollArrowBtn} ${css.scrollArrowLeft}`}
            title="向左浏览篇目"
          >
            <ChevronLeft size={13} />
          </button>
        )}

        <div
          ref={scrollContainerRef}
          onScroll={checkScrollState}
          onWheel={handleWheel}
          className={css.scrollRail}
        >
          <div className={css.tabTrack}>
            {articles.map((art, idx) => {
              const isCur = !showOverview && currentIndex === idx;
              const isNewspic = art.articleType === "newspic";
              const isXhs = art.platform === "xiaohongshu";
              const label = getArticleTabLabel(art, idx, articles);
              const artIndex = art.index || idx + 1;

              // 文章正文与配图生成状态
              const isArticleStreaming = Boolean(art.isStreaming || art.status === "streaming");
              const isArticlePending = Boolean(art.status === "pending");
              const isArticleDone = !isArticleStreaming && !isArticlePending && (
                art.status === "completed" ||
                Boolean(art.filePath) ||
                ((art.content?.length ?? 0) >= 60 && !art.content.includes("正文排版落盘产物生成中"))
              );

              const hasCover = Boolean(art.coverUrl);
              const imageCount = art.images?.length ?? 0;
              const targetImageCount = isXhs || isNewspic ? resolveTargetCardCount(art) : 1;
              const isImageDone = isXhs || isNewspic
                ? imageCount >= targetImageCount
                : Boolean(hasCover || imageCount >= targetImageCount);

              const isImageGenerating = isArticleDone && !isImageDone && Boolean(
                imageProgress?.isGenerating &&
                (imageProgress.currentArticleIndex === artIndex || imageProgress.currentArticleIndex === 0)
              );

              return (
                <button
                  key={art.id || idx}
                  ref={isCur ? activeTabRef : undefined}
                  type="button"
                  onClick={() => onSelectIndex(idx)}
                  className={`${css.tabItem} ${isCur ? css.tabItemActive : ""}`}
                >
                  {/* 微状态点指示 */}
                  {isArticleStreaming ? (
                    <span className={`${css.dot} ${css.dotPrimary}`} />
                  ) : isImageGenerating ? (
                    <span className={`${css.dot} ${css.dotAmber}`} />
                  ) : (
                    <span className={`${css.dot} ${css.dotSuccess}`} />
                  )}

                  {isNewspic || isXhs ? (
                    <Smartphone className={css.tabIcon} />
                  ) : (
                    <FileText className={css.tabIcon} />
                  )}

                  <span className={css.tabLabel}>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {canScrollRight && (
          <button
            type="button"
            onClick={() => handleScrollStep("right")}
            className={`${css.scrollArrowBtn} ${css.scrollArrowRight}`}
            title="向右浏览篇目"
          >
            <ChevronRight size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
