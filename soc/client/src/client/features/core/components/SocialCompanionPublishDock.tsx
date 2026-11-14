import { useState, useMemo, useEffect, useCallback, useRef, memo } from 'react'
import {
  Calendar,
  ChevronRight,
  ArrowRight,
  Send,
} from 'lucide-react'
import { toast } from '../../../compat/components/ui/toast.js'
import type { ArticleItem, ExtractedSocialWorkflow } from '../socialPublisherWorkflowExtractor.js'
import { getPlatformCapability } from '../utils/socialPlatformsMeta.js'

export interface SocialCompanionPublishDockProps {
  workflow: ExtractedSocialWorkflow
  workspacePath: string
  workspaceIdentity?: string
  sessionId?: string
}

/**
 * 社媒发布伴随式快捷指令行动条 (Social Companion Quick Action Chips)
 * 【中文优化依据】：
 * 1. 严格响应用户要求，绝不重复展示左侧画布底栏已有的“复制文案”与“去排版”工具；
 * 2. 专注右侧伴随对话栏的发布终局决策，严格在输入框正上方一行显示（Single Row）；
 * 3. 采用标准快捷指令按钮设计：仅发当前篇、定时排期、推送到草稿箱，高度 28px，杜绝换行堆叠。
 */
export const SocialCompanionPublishDock = memo(function SocialCompanionPublishDock({
  workflow,
  workspacePath,
  workspaceIdentity,
  sessionId,
}: SocialCompanionPublishDockProps) {
  const articles = useMemo(
    () => (Array.isArray(workflow.articles) ? workflow.articles : []),
    [workflow.articles],
  )

  const [currentIndex, setCurrentIndex] = useState(0)
  const [isOverview, setIsOverview] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // 跨区域联动：监听中间画布篇目切换自定义事件
  useEffect(() => {
    const handleArticleChange = (e: Event) => {
      const customEvent = e as CustomEvent<{
        index?: number
        article?: ArticleItem | null
        isOverview?: boolean
      }>
      if (customEvent.detail) {
        if (typeof customEvent.detail.index === 'number' && customEvent.detail.index >= 0) {
          setCurrentIndex(customEvent.detail.index)
        }
        if (typeof customEvent.detail.isOverview === 'boolean') {
          setIsOverview(customEvent.detail.isOverview)
        }
      }
    }

    window.addEventListener('wincode:social-studio-current-article', handleArticleChange)
    return () => {
      window.removeEventListener('wincode:social-studio-current-article', handleArticleChange)
    }
  }, [])

  const totalArticlesCount = articles.length
  const newsArticlesCount = articles.filter(a => a.articleType !== 'newspic').length
  const newspicArticlesCount = articles.filter(a => a.articleType === 'newspic').length
  const isMultiArticles = totalArticlesCount > 1
  const currentArticle = articles[currentIndex] ?? articles[0] ?? null

  const capability = useMemo(
    () => getPlatformCapability(currentArticle?.platform, currentArticle?.articleType),
    [currentArticle?.platform, currentArticle?.articleType],
  )

  // 单篇发布处理
  const handlePublishCurrentOnly = useCallback(
    (action: 'draft' | 'schedule' | 'publish_now', scheduleTime?: string) => {
      if (!currentArticle) return
      const platformName = currentArticle.platformName ?? currentArticle.platform ?? '微信公众号'
      const targetTaskId = workflow.taskId || workflow.activeTaskId || ''
      const signedHash = workflow.manifestFingerprint || ''
      const sigMeta =
        targetTaskId || signedHash
          ? ` (taskId: ${targetTaskId || 'auto'}, articleIndex: ${currentIndex + 1}${signedHash ? `, signedHash: ${signedHash}` : ''})`
          : ''

      // 【中文修复依据】：严禁动作与 Prompt 语义分裂，明确传递 publish_action 与参数
      let singleActionDesc: string
      let toastDesc: string
      if (action === 'schedule') {
        const schedText = scheduleTime ? `在 [${scheduleTime}] 定时排期发布` : '自动排期发布'
        singleActionDesc = `定时排期发布至【${platformName}】（调用 gzh_publish_draft，明确传入 publish_action: "schedule", schedule_time: "${scheduleTime || 'auto'}", article_index: ${currentIndex + 1}）`
        toastDesc = `${schedText}至【${platformName}】`
      } else if (action === 'publish_now') {
        singleActionDesc = `公开发布至【${platformName}】（调用 gzh_publish_draft，明确传入 publish_action: "publish_now", article_index: ${currentIndex + 1}）`
        toastDesc = `公开发布至【${platformName}】`
      } else {
        singleActionDesc = `存入【${platformName}】官方草稿箱（调用 gzh_publish_draft，明确传入 publish_action: "draft", article_index: ${currentIndex + 1}）`
        toastDesc = `存入【${platformName}】官方草稿箱`
      }

      const promptText = `【单篇发布确认·版本已终局锁定】已审校确认第 ${currentIndex + 1} 篇《${currentArticle.title}》内容无误${sigMeta}；当前稿件已锁定严禁二次修改，请立即单独执行【${singleActionDesc}】并核验状态。`

      window.dispatchEvent(
        new CustomEvent('wincode:social-publisher-send-prompt', {
          detail: { text: promptText, workspacePath, workspaceIdentity, sessionId },
        }),
      )
      toast(`已发送单篇发布确认：《${currentArticle.title}》→ ${toastDesc}`)
    },
    [currentArticle, currentIndex, workflow, workspacePath, workspaceIdentity, sessionId],
  )

  // 全量/多图文发布处理
  const handleConfirmPublishAll = useCallback(
    (action: 'draft' | 'schedule' | 'publish_now', scheduleTime?: string) => {
      const totalCount = articles.length
      const targetTaskId = workflow.taskId || workflow.activeTaskId || ''
      const signedHash = workflow.manifestFingerprint || ''
      const sigMeta =
        targetTaskId || signedHash
          ? ` (taskId: ${targetTaskId || 'auto'}${signedHash ? `, signedHash: ${signedHash}` : ''})`
          : ''

      // 【中文修复依据】：彻底修复定时排期写死为草稿箱的严重缺陷，根据 action 动态构造真实命令与参数
      let actionDesc: string
      let toastDesc: string
      if (action === 'schedule') {
        const schedText = scheduleTime ? `在 [${scheduleTime}] 定时排期发布` : '自动排期发布'
        actionDesc = `微信公众号多图文组合定时排期发布（调用 gzh_publish_draft，明确传入 publish_action: "schedule", schedule_time: "${scheduleTime || 'auto'}"）`
        toastDesc = `一键${schedText} (共 ${totalCount} 篇)`
      } else if (action === 'publish_now') {
        actionDesc = '多图文组合公开发布（调用 gzh_publish_draft，明确传入 publish_action: "publish_now"）'
        toastDesc = `一键公开发布至各平台 (共 ${totalCount} 篇)`
      } else {
        actionDesc = '多图文组合发布至微信官方草稿箱（调用 gzh_publish_draft，明确传入 publish_action: "draft"）'
        toastDesc = `一键存入各平台官方草稿箱 (共 ${totalCount} 篇)`
      }

      const promptText = `【多图文组合发布·版本已终局锁定】已审校确认当前任务全部 ${totalCount} 篇图文内容无误${sigMeta}；当前稿件已锁定严禁二次修改，请立即一次性执行【${actionDesc}】，严禁拆分成单篇上传，并核验发布状态。`

      window.dispatchEvent(
        new CustomEvent('wincode:social-publisher-send-prompt', {
          detail: { text: promptText, workspacePath, workspaceIdentity, sessionId },
        }),
      )
      toast(`已发送发布确认指令：${toastDesc}`)
    },
    [articles.length, workflow, workspacePath, workspaceIdentity, sessionId],
  )

  // 滚轮直接水平滑动支持
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (scrollRef.current && e.deltaY !== 0 && Math.abs(e.deltaX) === 0) {
      scrollRef.current.scrollLeft += e.deltaY
      e.preventDefault()
    }
  }

  // 【中文修复依据】：状态门禁严禁抢跑挂载，严格断言全部前序工具（选题、撰写、生图、校验）已无运行中任务，且工作流确切进入审校就绪阶段
  const isGeneratingRunning = Boolean(
    workflow.stage === 'generating' ||
      workflow.stage === 'topics' ||
      workflow.pipelineSteps?.some(s => s.status === 'running'),
  )
  const isReadyForPublish =
    articles.length > 0 &&
    !isGeneratingRunning &&
    (workflow.stage === 'review' ||
      workflow.stage === 'publishing' ||
      workflow.stage === 'published' ||
      Boolean(workflow.allPrePublishTasksCompleted))

  if (!isReadyForPublish) {
    return null
  }

  const currentArticleLabel =
    currentIndex === 0
      ? '头条'
      : currentArticle?.articleType === 'newspic'
        ? '小绿书'
        : `#${currentIndex + 1} 次条`

  return (
    <div
      ref={scrollRef}
      onWheel={handleWheel}
      data-testid="social-companion-quick-prompts"
      className="flex items-center justify-end gap-1.5 px-3 mb-1.5 overflow-x-auto scrollbar-hide no-scrollbar [scrollbar-width:none] [&::-webkit-scrollbar]:hidden flex-nowrap select-none py-0.5"
    >
      {/* 微信公众号场景 */}
      {currentArticle?.platform === 'gzh' || (!currentArticle?.platform && totalArticlesCount > 0) ? (
        <>
          {/* 快捷指令 1：仅存当前篇草稿 (多图文且聚焦单篇时呈现) */}
          {isMultiArticles && !isOverview && currentArticle && (
            <button
              type="button"
              onClick={() =>
                handlePublishCurrentOnly(
                  capability.supportsDirectPublish ? 'publish_now' : 'draft',
                )
              }
              className="h-7 shrink-0 inline-flex items-center gap-1 px-2.5 rounded-lg text-ui-2xs font-medium text-foreground-muted hover:text-foreground bg-surface/75 hover:bg-surface-hover border border-border/50 hover:border-border active:scale-[0.97] transition-all cursor-pointer shadow-2xs"
              title={`仅将当前聚焦的《${currentArticle.title || currentArticleLabel}》单独存入微信草稿箱`}
            >
              <span>仅存当前篇草稿 ({currentArticleLabel})</span>
              <ChevronRight className="size-2.5 text-foreground-subtle" />
            </button>
          )}

          {/* 快捷指令 2：公众号定时排期 */}
          {capability.supportsSchedule && (
            <button
              type="button"
              onClick={() => handleConfirmPublishAll('schedule')}
              className="h-7 shrink-0 inline-flex items-center gap-1.5 px-2.5 rounded-lg text-ui-2xs font-medium text-foreground-muted hover:text-foreground bg-surface/75 hover:bg-surface-hover border border-border/50 hover:border-border active:scale-[0.97] transition-all cursor-pointer shadow-2xs"
              title="唤起微信公众号定时排期发布配置"
            >
              <Calendar className="size-3 text-foreground-subtle" />
              <span>公众号定时排期</span>
            </button>
          )}

          {/* 核心主行动快捷指令：推送到公众号草稿箱 */}
          <button
            type="button"
            onClick={() => handleConfirmPublishAll('draft')}
            className="h-7 shrink-0 inline-flex items-center gap-1.5 px-3 rounded-lg text-ui-2xs font-semibold text-white bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 shadow-xs active:scale-[0.97] transition-all cursor-pointer border border-emerald-400/30"
            title="将全部图文组合打包推送到微信公众号官方草稿箱"
          >
            <Send className="size-3 text-white/95" />
            <span>推送到公众号草稿箱</span>
            {isMultiArticles && (
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-black/20 text-white/95 leading-none">
                {newsArticlesCount > 1 ? `多图文 ${newsArticlesCount} 篇` : `图文 ${newsArticlesCount} 篇`}
                {newspicArticlesCount > 0 ? ` + ${newspicArticlesCount} 小绿书` : ''}
              </span>
            )}
            <ArrowRight className="size-2.5 text-white/80" />
          </button>
        </>
      ) : currentArticle?.platform === 'xiaohongshu' ? (
        /* 小红书场景 */
        <>
          <button
            type="button"
            onClick={() => handleConfirmPublishAll('draft')}
            className="h-7 shrink-0 inline-flex items-center gap-1 px-2.5 rounded-lg text-ui-2xs font-medium bg-surface/75 hover:bg-surface-hover border border-border/50 active:scale-[0.97] transition-all cursor-pointer"
          >
            <span>存草稿</span>
          </button>
          <button
            type="button"
            onClick={() => handleConfirmPublishAll('publish_now')}
            className="h-7 shrink-0 inline-flex items-center gap-1.5 px-3 rounded-lg text-ui-2xs font-semibold text-white bg-gradient-to-b from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 shadow-xs active:scale-[0.97] transition-all cursor-pointer border border-rose-400/30"
          >
            <Send className="size-3" />
            <span>发布笔记</span>
            <ArrowRight className="size-2.5 opacity-80" />
          </button>
        </>
      ) : currentArticle?.platform === 'zhihu' ? (
        /* 知乎场景 */
        <>
          <button
            type="button"
            onClick={() => handleConfirmPublishAll('draft')}
            className="h-7 shrink-0 inline-flex items-center gap-1 px-2.5 rounded-lg text-ui-2xs font-medium bg-surface/75 hover:bg-surface-hover border border-border/50 active:scale-[0.97] transition-all cursor-pointer"
          >
            <span>存为草稿</span>
          </button>
          <button
            type="button"
            onClick={() => handleConfirmPublishAll('publish_now')}
            className="h-7 shrink-0 inline-flex items-center gap-1.5 px-3 rounded-lg text-ui-2xs font-semibold text-white bg-gradient-to-b from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 shadow-xs active:scale-[0.97] transition-all cursor-pointer border border-sky-400/30"
          >
            <Send className="size-3" />
            <span>发布专栏</span>
            <ArrowRight className="size-2.5 opacity-80" />
          </button>
        </>
      ) : (
        /* 通用多平台兜底 */
        <button
          type="button"
          onClick={() => handleConfirmPublishAll('draft')}
          className="h-7 shrink-0 inline-flex items-center gap-1.5 px-3 rounded-lg text-ui-2xs font-semibold text-white bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 active:scale-[0.97] transition-all cursor-pointer"
        >
          <Send className="size-3" />
          <span>确认存入草稿箱</span>
          <ArrowRight className="size-2.5 opacity-80" />
        </button>
      )}
    </div>
  )
})
