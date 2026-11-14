import { useMemo } from 'react'
import {
  Clock,
  RefreshCw,
  Check,
  Copy,
  Calendar,
  Layers,
  ChevronRight,
  ArrowRight,
  Send,
} from 'lucide-react'
import { Button } from '../../../compat/components/ui/button.js'
import { cn } from '../../../compat/components/lib/utils.js'
import type { ArticleItem } from '../socialPublisherWorkflowExtractor.js'
import { getPlatformCapability } from '../utils/socialPlatformsMeta.js'
import css from './SocialArticleBottomActionBar.module.css'

export interface SocialArticleBottomActionBarProps {
  currentArticle: ArticleItem | null
  currentIndex: number
  totalArticlesCount: number
  primeTimeSuggestions: Array<{ label: string; timeVal: string }>
  copied: boolean
  copyConfig: { buttonLabel: string; toastTip: string }
  saveStatus?: 'idle' | 'saving' | 'saved'
  onOpenTypography?: () => void
  onCopyContent: () => void
  onPublishCurrentOnly: (action: 'draft' | 'schedule' | 'publish_now', scheduleTime?: string) => void
  onConfirmPublishAll: (action: 'draft' | 'schedule' | 'publish_now', scheduleTime?: string) => void
  onResignManifest?: () => void
  isResigning?: boolean
  showPublishActions?: boolean
}

/**
 * 社媒文章统一发布控制坞 (Unified Publisher Dock)
 * 【中文重构依据】：
 * 1. 彻底摒弃粗糙平铺与廉价虚线框，重塑为左侧工具岛、右侧决策岛的清晰双岛布局；
 * 2. 主按钮告别冗长笨重的单行文字，采用【核心动作 + 半透明篇目徽标 + 微反光内阴影】的高级出版质感；
 * 3. 增强按钮点击触觉缩放反馈 (active:scale-[0.982])，提供极致人性化与现代设计感。
 */
export function SocialArticleBottomActionBar({
  currentArticle,
  currentIndex: _currentIndex,
  totalArticlesCount,
  primeTimeSuggestions,
  copied,
  copyConfig,
  saveStatus = 'idle',
  onOpenTypography,
  onCopyContent,
  onPublishCurrentOnly,
  onConfirmPublishAll,
  onResignManifest,
  isResigning,
  showPublishActions = true,
}: SocialArticleBottomActionBarProps) {
  const capability = useMemo(
    () => getPlatformCapability(currentArticle?.platform, currentArticle?.articleType),
    [currentArticle?.platform, currentArticle?.articleType],
  )

  const isMultiArticles = totalArticlesCount > 1

  return (
    <div className={css.dockRoot}>
      {/* 黄金发文时段智能推荐微条（紧凑低噪） */}
      {showPublishActions && capability.showPrimeTime && primeTimeSuggestions.length > 0 && (
        <div className={css.primeTimeBar}>
          <div className={css.primeTimeLeft}>
            <Clock size={12} />
            <span>黄金发文时段推荐：</span>
          </div>
          <div className={css.primeTimeList}>
            {primeTimeSuggestions.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onConfirmPublishAll('schedule', item.timeVal)}
                className={css.primeTimeBtn}
                title={`点击以 [${item.timeVal}] 排期发布`}
              >
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 核心操作控制坞：左侧工具岛 + 右侧决策岛 */}
      <div className={css.dockRow}>
        {/* 左侧：状态指示微标与辅助工具组 */}
        <div className={css.dockLeft}>
          {/* 草稿保存状态微胶囊 */}
          <div className={css.statusCapsule}>
            {saveStatus === 'saving' && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#f59e0b', fontWeight: 500 }}>
                <span className={`${css.statusDot} ${css.statusDotWarn}`} />
                <span>正在自动保存</span>
              </span>
            )}
            {saveStatus === 'saved' && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#059669', fontWeight: 500 }}>
                <span className={`${css.statusDot} ${css.statusDotSuccess}`} />
                <span>草稿已同步</span>
              </span>
            )}
            {saveStatus === 'idle' && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--dsw-alias-label-secondary, #6b7280)' }}>
                <span className={css.statusDot} style={{ background: '#9ca3af' }} />
                <span>草稿就绪</span>
              </span>
            )}
          </div>

          {/* 复制当前篇文案 */}
          <button
            type="button"
            onClick={onCopyContent}
            className={`${css.toolButton} ${copied ? css.toolButtonSuccess : ''}`}
            title="一键复制当前平台格式内容至剪贴板"
          >
            {copied ? (
              <Check size={14} style={{ color: '#059669' }} />
            ) : (
              <Copy size={14} />
            )}
            <span>{copied ? '已复制' : copyConfig.buttonLabel}</span>
          </button>

          {/* 去排版直达入口 */}
          {onOpenTypography && (
            <button
              type="button"
              onClick={onOpenTypography}
              className={css.toolButton}
              title="在左侧边栏展开微信公众号排版素材小组件面板"
            >
              <Layers size={14} style={{ color: '#059669' }} />
              <span>去排版</span>
            </button>
          )}

          {/* 签名防篡改核验 (次要维护动作) */}
          {onResignManifest && (
            <button
              type="button"
              onClick={onResignManifest}
              disabled={isResigning}
              className={css.toolButton}
              title="当修改文案或触发防篡改拦截时，点击重新核验磁盘文件签名"
            >
              <RefreshCw size={13} className={isResigning ? 'animate-spin' : ''} />
              <span>{isResigning ? '核验中...' : '核验签名'}</span>
            </button>
          )}
        </div>

        {/* 右侧：决策行动组（主次分明、层次清爽，当右侧侧边栏已承载时自动隐藏） */}
        {showPublishActions && (
          <div className="flex items-center gap-2.5 flex-wrap ml-auto">
            {/* 单篇轻量发布通道 (摒弃原先突兀的虚线框，改用优雅低调的次要边框胶囊) */}
            {isMultiArticles && currentArticle && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onPublishCurrentOnly(capability.supportsDirectPublish ? 'publish_now' : 'draft')}
                className="h-8 gap-1 px-3 rounded-lg text-ui-xs font-medium text-foreground-muted hover:text-foreground hover:bg-surface-hover border border-border/40 hover:border-border active:scale-[0.982] transition-all cursor-pointer"
                title="仅将当前正在浏览的单篇提交发布，其余篇目暂存本地"
              >
                <span>{capability.supportsDirectPublish ? '仅发当前篇' : '仅存当前篇草稿'}</span>
                <ChevronRight className="size-3 text-foreground-subtle" />
              </Button>
            )}

            {/* 定时排期按钮 */}
            {capability.supportsSchedule && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onConfirmPublishAll('schedule')}
                className="h-8 gap-1.5 px-3 rounded-lg text-ui-xs font-medium cursor-pointer shadow-2xs border-border/60 hover:border-border hover:bg-surface-hover text-foreground active:scale-[0.982] transition-all"
              >
                <Calendar className="size-3.5 text-foreground-muted" />
                <span>{capability.scheduleButtonLabel || '定时排期'}</span>
              </Button>
            )}

            {/* 主发布行动组：知乎 / 小红书 / 微信公众号等 */}
            {currentArticle?.platform === 'zhihu' ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onConfirmPublishAll('draft')}
                  className="h-8 px-3 rounded-lg text-ui-xs font-medium cursor-pointer shadow-2xs active:scale-[0.982] transition-all"
                >
                  <span>存为草稿</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onConfirmPublishAll('publish_now')}
                  className="h-8 gap-2 px-3.5 rounded-lg text-ui-xs font-semibold text-white bg-gradient-to-b from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 shadow-sm shadow-sky-600/20 active:scale-[0.982] transition-all cursor-pointer border border-sky-400/30"
                >
                  <Send className="size-3.5" />
                  <span>发布专栏</span>
                  {isMultiArticles && (
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-black/20 text-white/90">
                      {totalArticlesCount} 篇
                    </span>
                  )}
                  <ArrowRight className="size-3 opacity-80" />
                </Button>
              </>
            ) : currentArticle?.platform === 'xiaohongshu' ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onConfirmPublishAll('draft')}
                  className="h-8 px-3 rounded-lg text-ui-xs font-medium cursor-pointer shadow-2xs active:scale-[0.982] transition-all"
                >
                  <span>存草稿</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onConfirmPublishAll('publish_now')}
                  className="h-8 gap-2 px-3.5 rounded-lg text-ui-xs font-semibold text-white bg-gradient-to-b from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 shadow-sm shadow-rose-600/20 active:scale-[0.982] transition-all cursor-pointer border border-rose-400/30"
                >
                  <Send className="size-3.5" />
                  <span>发布笔记</span>
                  {isMultiArticles && (
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-black/20 text-white/90">
                      {totalArticlesCount} 篇
                    </span>
                  )}
                  <ArrowRight className="size-3 opacity-80" />
                </Button>
              </>
            ) : (
            /* 微信公众号、今日头条、百家号：核心推送到草稿箱 */
              <Button
                type="button"
                size="sm"
                onClick={() => onConfirmPublishAll('draft')}
                className="h-8 gap-2 px-3.5 rounded-lg text-ui-xs font-semibold text-white bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 shadow-sm shadow-emerald-600/20 active:scale-[0.982] transition-all cursor-pointer border border-emerald-400/30"
              >
                <Send className="size-3.5" />
                <span>推送到公众号草稿箱</span>
                {isMultiArticles && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-black/20 text-white/90">
                    多图文 {totalArticlesCount} 篇
                  </span>
                )}
                <ArrowRight className="size-3 opacity-80" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
