import { useAutomationBrowserStore } from '../../../compat/store/automationBrowserStore.js'
import { useState, useEffect, useMemo } from 'react'
import {
  PanelRight,
  Sparkles,
} from 'lucide-react'
import { Button } from '../../../compat/components/ui/button.js'
import { toast } from '../../../compat/components/ui/toast.js'
import { cn } from '../../../compat/components/lib/utils.js'
import type { ArticleItem } from '../socialPublisherWorkflowExtractor.js'
import { SocialArticleBottomActionBar } from './SocialArticleBottomActionBar.js'
import { SocialArticleFocusStage } from './SocialArticleFocusStage.js'
import { getArticleCopyConfig, copyArticleToClipboard, getPlatformDisplayName } from '../utils/socialClipboard.js'
import { OPEN_SOCIAL_PREVIEW_SIDE_TAB_EVENT } from '../../../compat/lib/workspaceSidePane.js'
import { getPlatformCapability } from '../utils/socialPlatformsMeta.js'

export interface SocialArticleCollapsibleCardProps {
  articles: ArticleItem[]
  workspacePath?: string
  workspaceIdentity?: string
  sessionId?: string
  imageProgress?: {
    current: number
    total: number
    percentage: number
    currentArticleIndex: number
    isGenerating: boolean
  }
  isContentFullyProduced?: boolean
}

/**
 * 社媒文章发布决策总控卡片 (遵循 Level 2 晶透卡片规范与 No AI Slop 原则)
 * 主视口呈现三层式秩序感设计：Header 概览与侧栏入口、Body 篇目切换与聚焦展台、Footer 统一发布控制台
 */
export function SocialArticleCollapsibleCard({
  articles = [],
  workspacePath,
  workspaceIdentity,
  sessionId,
  imageProgress,
  isContentFullyProduced: _isContentFullyProduced,
}: SocialArticleCollapsibleCardProps) {
  // 当前浏览的篇目索引
  const [currentIndex, setCurrentIndex] = useState(0)
  const [copied, setCopied] = useState(false)
  // 内部文章状态
  const [localArticles, setLocalArticles] = useState<ArticleItem[]>(articles)

  useEffect(() => {
    setLocalArticles(articles)
  }, [articles])

  const currentArticle = localArticles[currentIndex] || localArticles[0] || null
  const currentCap = useMemo(
    () => getPlatformCapability(currentArticle?.platform, currentArticle?.articleType),
    [currentArticle?.platform, currentArticle?.articleType],
  )

  // 统计已微调修改的篇目索引
  const modifiedIndices = useMemo(() => {
    const set = new Set<number>()
    localArticles.forEach((art, idx) => {
      const original = articles[idx]
      if (!original) return
      if (
        art.title !== original.title ||
        art.content !== original.content ||
        art.digest !== original.digest
      ) {
        set.add(idx)
      }
    })
    return set
  }, [localArticles, articles])

  // 统计各平台文章分布摘要
  const platformSummary = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const art of localArticles) {
      const name =
        art.articleType === 'newspic'
          ? '微信小绿书'
          : getPlatformDisplayName(art.platform, art.platformName)
      counts[name] = (counts[name] || 0) + 1
    }
    return Object.entries(counts)
      .map(([k, v]) => `${k} ${v}篇`)
      .join(' · ')
  }, [localArticles])

  // 当前文章专属的复制配置（按钮文案与提示）
  const copyConfig = useMemo(() => {
    return getArticleCopyConfig(currentArticle)
  }, [currentArticle])

  // 复制当前文章专属格式内容
  const handleCopyAdaptiveContent = async () => {
    if (!currentArticle) return
    const ok = await copyArticleToClipboard(currentArticle)
    if (ok) {
      setCopied(true)
      toast(copyConfig.toastTip)
      setTimeout(() => setCopied(false), 2500)
    } else {
      toast('写入剪贴板失败，请重试')
    }
  }

  // 打开右侧边栏拟真全尺寸审校工作台
  const handleOpenSidePanePreview = (targetIndex = currentIndex) => {
    // 实施预览：若当前存在活跃的自动化发布推流会话，优先唤起并聚焦内置受控浏览器
    try {
      const bStore = useAutomationBrowserStore.getState()
      // 【中文修复依据】：严格会话隔离与平台匹配！
      // 必须满足平台匹配且明确归属于当前会话 (s.ownerTaskId === sessionId)。
      // 彻底删除全局单例 bStore.session 逻辑，杜绝微信公众号任务呼出小红书浏览器窗口！
      const currentPlat = currentArticle?.platform
      const activeSession: any = Object.values(bStore.sessions as any || {}).find(
        (s: any) =>
          (s.status === 'running' || s.status === 'starting') &&
          (!currentPlat || s.platform === currentPlat || (currentPlat === 'gzh' && (s.platform === 'wechat' || s.platform === 'gzh'))) &&
          (s.ownerTaskId === sessionId || (s.accountId && s.accountId === currentArticle?.accountId && !s.ownerTaskId)),
      )

      if (activeSession) {
        useAutomationBrowserStore.setState({
          pendingOpenRequest: {
            requestId: `open-inspector-${Date.now()}`,
            sessionId: activeSession.sessionId,
            title: activeSession.title,
            platform: activeSession.platform,
            module: activeSession.module || 'social-publisher',
            ownerTaskId: activeSession.ownerTaskId || sessionId,
            accountId: activeSession.accountId ?? null,
            autoReveal: true,
            isTakeoverActive: Boolean(activeSession.isTakeoverActive),
          },
        })
        return
      }
    } catch {}

    window.dispatchEvent(
      new CustomEvent(OPEN_SOCIAL_PREVIEW_SIDE_TAB_EVENT, {
        detail: {
          articles: localArticles,
          initialArticleIndex: targetIndex,
          workspacePath,
          workspaceIdentity,
          parentSessionId: sessionId,
        },
      }),
    )
  }

  // 平台黄金发布时段建议（针对微信公众号、小红书、今日头条、百家号呈现专属黄金时段）
  const primeTimeSuggestions = useMemo(() => {
    if (!currentArticle) return []

    if (!currentCap.showPrimeTime) return []

    const p = currentArticle.platform
    if (p === 'gzh') {
      return [
        { label: '今日 21:00 晚间阅读高峰', timeVal: '21:00' },
        { label: '明日 07:45 晨间通勤', timeVal: 'tomorrow 07:45' },
        { label: '今日 12:15 午休阅读', timeVal: '12:15' },
      ]
    }
    if (p === 'xiaohongshu') {
      return [
        { label: '今日 12:15 午休种草', timeVal: '12:15' },
        { label: '今日 20:00 晚间休闲', timeVal: '20:00' },
      ]
    }
    if (p === 'toutiao' || p === 'baijiahao') {
      return [
        { label: '今日 18:30 晚间热点', timeVal: '18:30' },
        { label: '明日 07:00 早间资讯', timeVal: 'tomorrow 07:00' },
      ]
    }
    return []
  }, [currentArticle, currentCap.showPrimeTime])

  // 单篇局部发布
  const handlePublishCurrentOnly = (action: 'draft' | 'schedule' | 'publish_now', scheduleTime?: string) => {
    if (!currentArticle) return

    const platformName = getPlatformDisplayName(currentArticle.platform, currentArticle.platformName)
    const isWechat = currentArticle.platform === 'gzh'
    const actionDesc =
      action === 'publish_now'
        ? `公开发布至【${platformName}】`
        : action === 'draft'
          ? (isWechat ? '推送到【微信公众号】草稿箱' : `存入【${platformName}】官方草稿箱`)
          : scheduleTime
            ? (isWechat
              ? `通过微信后台自动化模拟操作在 [${scheduleTime}] 定时发表`
              : `在 [${scheduleTime}] 定时排期发布至【${platformName}】`)
            : (isWechat
              ? '通过微信后台自动化模拟操作定时排期发表'
              : `定时排期发布至【${platformName}】`)
    const promptText = `【单篇局部发布确认】已审校确认第 ${currentIndex + 1} 篇《${currentArticle.title}》（平台：${platformName}）内容无误；请立即单独将本篇【${actionDesc}】并核验状态，其余篇目暂存本地草稿箱。`

    window.dispatchEvent(
      new CustomEvent('wincode:social-publisher-send-prompt', {
        detail: {
          text: promptText,
          workspacePath,
          workspaceIdentity,
          sessionId,
        },
      }),
    )
    toast(`已发送单篇发布指令：《${currentArticle.title}》-> ${actionDesc}`)
  }

  // 提交发布确认门禁指令（统筹全任务所有文章）
  const handleConfirmPublishAll = (action: 'draft' | 'schedule' | 'publish_now', scheduleTime?: string) => {
    const totalCount = localArticles.length
    const modifiedCount = modifiedIndices.size

    const platformName = getPlatformDisplayName(currentArticle?.platform, currentArticle?.platformName)
    const isWechat = currentArticle?.platform === 'gzh'

    const actionDesc =
      action === 'publish_now'
        ? `一键公开发布至【${platformName}】`
        : action === 'draft'
          ? (isWechat ? '一键推送到微信公众号官方草稿箱' : '一键存入各平台官方草稿箱')
          : scheduleTime
            ? (isWechat
              ? `一键通过微信后台自动化模拟操作在 [${scheduleTime}] 定时发表`
              : `一键在 [${scheduleTime}] 定时排期发布`)
            : (isWechat
              ? '一键通过微信后台自动化模拟操作定时排期发表'
              : '一键全平台定时排期发布')

    const promptText = `【发布确认】已审校确认当前任务中全部 ${totalCount} 篇图文内容无误${
      modifiedCount > 0 ? `（其中 ${modifiedCount} 篇已完成微调暂存）` : ''
    }；请立即执行【${actionDesc}】并核验发布状态。`

    window.dispatchEvent(
      new CustomEvent('wincode:social-publisher-send-prompt', {
        detail: {
          text: promptText,
          workspacePath,
          workspaceIdentity,
          sessionId,
        },
      }),
    )

    toast(`已向会话发送发布确认指令：${actionDesc} (共 ${totalCount} 篇)`)
  }

  if (!articles || articles.length === 0 || !currentArticle) return null

  return (
    <div
      className="mt-3 overflow-hidden rounded-2xl border border-border/70 bg-card/85 backdrop-blur-xl shadow-md transition-all"
      style={{ boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.06), 0 4px 20px -2px rgba(0,0,0,0.05)' }}
    >
      {/* 1. Header 顶层概览与唯一主入口（无重复全屏图标） */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-surface/50 border-b border-border/50">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={cn('flex size-8 items-center justify-center rounded-lg shrink-0 shadow-2xs transition-colors', currentCap.themeStyle.badgeBg, currentCap.themeStyle.accentColor)}>
            <Sparkles className="size-4" />
          </div>
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="text-ui-sm font-bold text-foreground tracking-tight">
              {imageProgress?.isGenerating ? '正文排版已就绪 · 配图逐篇生成中' : `社媒图文已就绪 · 共 ${localArticles.length} 篇`}
            </span>
            <span className="text-ui-xs text-foreground-muted hidden sm:inline">
              ({platformSummary})
            </span>
            {/* 动态状态徽标与生图进度可视化 */}
            {imageProgress?.isGenerating ? (
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-ui-2xs font-medium text-primary border border-primary/20 animate-pulse">
                <span className="size-1.5 rounded-full bg-primary animate-ping" />
                <span>
                  🎨 AI 配图生成中 ({imageProgress.current}/{imageProgress.total} 张 · 正在生成第 {imageProgress.currentArticleIndex} 篇 · {imageProgress.percentage}%)
                </span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-0.5 text-ui-2xs font-medium text-foreground-muted border border-border/60">
                <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span>待审校确认</span>
                {modifiedIndices.size > 0 && (
                  <span className="text-primary font-semibold ml-0.5">
                    · 已微调 {modifiedIndices.size} 篇
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 右侧操作：唯一的侧边栏拟真审校入口，消除多处重复 */}
        <div className="flex items-center gap-1.5 ml-auto">
          <Button
            type="button"
            size="sm"
            onClick={() => handleOpenSidePanePreview()}
            className="h-8 gap-1.5 px-3.5 text-ui-xs font-semibold cursor-pointer shadow-xs bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.985] transition-all"
            title="在侧边栏中打开完整排版预览与编辑"
          >
            <PanelRight className="size-3.5" />
            <span>在右侧边栏打开预览</span>
          </Button>
        </div>
      </div>

      {/* 2. Body 篇目分段切换与当前文章聚焦展台（内嵌立体 Well 设计，无重复按钮，消除 gzh 缩写） */}
      <SocialArticleFocusStage
        articles={localArticles}
        currentIndex={currentIndex}
        currentArticle={currentArticle}
        modifiedIndices={modifiedIndices}
        onSelectIndex={setCurrentIndex}
        onOpenPreview={handleOpenSidePanePreview}
      />

      {/* 3. Footer 统一决策控制台底栏 */}
      <SocialArticleBottomActionBar
        currentArticle={currentArticle}
        currentIndex={currentIndex}
        totalArticlesCount={localArticles.length}
        primeTimeSuggestions={primeTimeSuggestions}
        copied={copied}
        copyConfig={copyConfig}
        onCopyContent={handleCopyAdaptiveContent}
        onPublishCurrentOnly={handlePublishCurrentOnly}
        onConfirmPublishAll={handleConfirmPublishAll}
      />
    </div>
  )
}
