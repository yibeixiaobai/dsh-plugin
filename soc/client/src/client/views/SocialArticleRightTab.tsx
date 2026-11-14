import { useState, useMemo, useEffect, useCallback, type ReactNode } from 'react'
import type { PropsRuntime, PropsLocale } from '@winkoo/client-ui-slots'
import {
  FileText,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  Layers,
} from 'lucide-react'
import { SocialArticlePlatformPreview } from '../features/core/components/SocialArticlePlatformPreview.js'
import { WechatMultiArticleOverview } from '../features/core/components/WechatMultiArticleOverview.js'
import { copySocialArticleContent } from '../features/core/utils/socialClipboard.js'
import { useSocialWorkflow } from '../features/core/useSocialWorkflow.js'
import type { ArticleItem } from '../features/core/socialPublisherWorkflowExtractor.js'
import css from './SocialArticleRightTab.module.css'

export const SOCIAL_ARTICLE_TAB_ID = 'social-publisher/article-preview'

/**
 * Tab title chip for the right sidebar social article preview tab.
 *
 * @returns Tab icon and label element.
 */
export function SocialArticleRightTabTitle(_props: PropsRuntime<'sidebar.right.pane.tab.title'>): ReactNode {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
      <FileText size={14} />
      <span>文章预览与排版</span>
    </span>
  )
}

/**
 * Computes platform-aware slot labels for multi-article navigation pills.
 */
function getArticleSlotLabel(art: ArticleItem, idx: number, allArticles: ArticleItem[] = []): string {
  const isXhs = art.platform === 'xiaohongshu'
  const isNewspic = art.articleType === 'newspic'
  const isGzhNews = art.platform === 'gzh' && !isNewspic
  const isToutiao = art.platform === 'toutiao'
  const isZhihu = art.platform === 'zhihu'
  const slotNum = typeof art.index === 'number' && art.index > 0 ? art.index : idx + 1

  if (isNewspic) {
    const sameAccountNewspics = allArticles.filter(
      a => a.articleType === 'newspic' && (a.accountId || '') === (art.accountId || ''),
    )
    if (sameAccountNewspics.length > 1) {
      const nIdx = sameAccountNewspics.findIndex(a => a.id === art.id) + 1
      return `小绿书 #${nIdx > 0 ? nIdx : slotNum} (3:4)`
    }
    return `小绿书 (3:4)`
  }
  if (isXhs) {
    return `#${slotNum} 小红书笔记`
  }
  if (isGzhNews) {
    const sameNews = allArticles.filter(a => a.platform === 'gzh' && a.articleType !== 'newspic')
    if (sameNews.length > 1) {
      return `#${slotNum} 公众号长文`
    }
    return `公众号长文`
  }
  if (isToutiao) {
    return `#${slotNum} 今日头条`
  }
  if (isZhihu) {
    return `#${slotNum} 知乎文章`
  }
  return `#${slotNum} ${art.platformName || '稿件'}`
}

/**
 * Right sidebar tab for live multi-platform article preview, inspection, and review.
 * Connects directly to active session workflow articles and supports
 * multi-article navigation pills, previous/next cycling, and one-click copy.
 *
 * @param props - Slot runtime and locale props.
 * @returns Right pane preview body.
 */
export function SocialArticleRightTab(props: PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<'socialPublisher'>): ReactNode {
  let sessionId: string | undefined
  try {
    const tabInfo = props.useTabInfo?.()
    sessionId = (tabInfo as { sessionId?: string } | undefined)?.sessionId
  } catch {
    // Tab info hook fallback
  }

  const { workflow } = useSocialWorkflow(sessionId)
  const articles = useMemo(() => (Array.isArray(workflow.articles) ? workflow.articles : []), [workflow.articles])

  const [currentIndex, setCurrentIndex] = useState<number>(0)
  const [localArticles, setLocalArticles] = useState<ArticleItem[]>(articles)
  const [copied, setCopied] = useState<boolean>(false)

  // Sync external workflow articles into local state
  useEffect(() => {
    if (Array.isArray(workflow.articles) && workflow.articles.length > 0) {
      setLocalArticles(workflow.articles)
    }
  }, [workflow.articles])

  const totalCount = localArticles.length
  const currentArticle = localArticles[currentIndex] || localArticles[0] || null

  const hasMultipleGzhNews = useMemo(() => {
    const gzhArticles = localArticles.filter(a => a.platform === 'gzh' && a.articleType !== 'newspic')
    return gzhArticles.length > 1
  }, [localArticles])

  const handleCopyCurrent = useCallback(async (): Promise<void> => {
    if (!currentArticle) return
    const ok = await copySocialArticleContent(currentArticle)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [currentArticle])

  const handleTitleChange = useCallback((newTitle: string): void => {
    setLocalArticles(prev =>
      prev.map((art, idx) => (idx === currentIndex ? { ...art, title: newTitle } : art)),
    )
  }, [currentIndex])

  const handleDigestChange = useCallback((newDigest: string): void => {
    setLocalArticles(prev =>
      prev.map((art, idx) => (idx === currentIndex ? { ...art, digest: newDigest } : art)),
    )
  }, [currentIndex])

  const handleContentChange = useCallback((newContent: string): void => {
    setLocalArticles(prev =>
      prev.map((art, idx) => (idx === currentIndex ? { ...art, content: newContent } : art)),
    )
  }, [currentIndex])

  // Empty state when no articles exist in the active session
  if (!currentArticle || totalCount === 0) {
    return (
      <div className={css.container}>
        <div className={css.emptyState}>
          <FileText className={css.emptyIcon} />
          <div className={css.emptyTitle}>暂无社媒图文内容</div>
          <div className={css.emptySub}>
            请在主对话中启动社媒发布任务，生成的多平台图文将在此实时拟真呈现与审校。
          </div>
        </div>
      </div>
    )
  }

  const isOverviewSelected = currentIndex === -1

  return (
    <div className={css.container}>
      {/* 顶部多篇导航与快捷操作栏 */}
      <div className={css.header}>
        <div className={css.navPillsScroll}>
          {hasMultipleGzhNews && (
            <button
              type="button"
              onClick={() => setCurrentIndex(-1)}
              className={`${css.navPill} ${isOverviewSelected ? css.navPillActive : ''}`}
              title="查看多图文消息流合辑总览"
            >
              <Layers style={{ width: '12px', height: '12px' }} />
              <span>合辑总览</span>
            </button>
          )}

          {localArticles.map((art, idx) => {
            const isSelected = !isOverviewSelected && currentIndex === idx
            const label = getArticleSlotLabel(art, idx, localArticles)
            return (
              <button
                key={art.id || idx}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                className={`${css.navPill} ${isSelected ? css.navPillActive : ''}`}
                title={art.title || label}
              >
                <span>{label}</span>
              </button>
            )
          })}
        </div>

        {/* 右侧上下篇翻页与一键复制 */}
        <div className={css.actionsGroup}>
          <button
            type="button"
            onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
            disabled={currentIndex <= 0}
            className={css.iconBtn}
            title="查看上一篇"
            aria-label="查看上一篇"
          >
            <ChevronLeft style={{ width: '14px', height: '14px' }} />
          </button>
          <button
            type="button"
            onClick={() => setCurrentIndex(prev => Math.min(totalCount - 1, prev + 1))}
            disabled={currentIndex >= totalCount - 1}
            className={css.iconBtn}
            title="查看下一篇"
            aria-label="查看下一篇"
          >
            <ChevronRight style={{ width: '14px', height: '14px' }} />
          </button>

          {!isOverviewSelected && (
            <button
              type="button"
              onClick={handleCopyCurrent}
              className={`${css.copyBtn} ${copied ? css.copyBtnSuccess : ''}`}
              title="复制当前文章文案与排版"
            >
              {copied ? (
                <>
                  <Check style={{ width: '13px', height: '13px' }} />
                  <span>已复制</span>
                </>
              ) : (
                <>
                  <Copy style={{ width: '13px', height: '13px' }} />
                  <span>复制</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* 主体画布呈现区 */}
      <div className={css.bodyArea}>
        {isOverviewSelected ? (
          <WechatMultiArticleOverview
            articles={localArticles}
            onSelectArticle={(idx) => setCurrentIndex(idx)}
          />
        ) : (
          <SocialArticlePlatformPreview
            article={currentArticle}
            workspacePath=""
            onTitleChange={handleTitleChange}
            onDigestChange={handleDigestChange}
            onContentChange={handleContentChange}
          />
        )}
      </div>
    </div>
  )
}
