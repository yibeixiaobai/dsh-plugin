import { useState, useMemo } from 'react'
import {
  CheckCircle2,
  ExternalLink,
  Clock,
  Copy,
  Calendar,
  ShieldCheck,
  Camera,
  Maximize2,
  X,
} from 'lucide-react'
import { Button } from '../../../compat/components/ui/button.js'
import { toast } from '../../../compat/components/ui/toast.js'
import { cn } from '../../../compat/components/lib/utils.js'

export interface PublishReceiptData {
  platform: string
  platformName?: string
  accountName: string
  accountId: string
  title: string
  publishAction: 'draft' | 'publish_now' | 'schedule'
  mediaId?: string
  draftUrl?: string
  scheduledTime?: string
  publishedAt?: string
  durationSeconds?: number
  traceId?: string
  failureSnapshotDir?: string
  screenshotUrl?: string
}

const PLATFORM_OFFICIAL_URLS: Record<string, { name: string; url: string; color: string }> = {
  gzh: {
    name: '微信公众平台',
    url: 'https://mp.weixin.qq.com/',
    color: 'text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  },
  wechat: {
    name: '微信公众平台',
    url: 'https://mp.weixin.qq.com/',
    color: 'text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  },
  xiaohongshu: {
    name: '小红书创作服务平台',
    url: 'https://creator.xiaohongshu.com/publish/publish',
    color: 'text-rose-600 dark:text-rose-400 border-rose-500/30 bg-rose-500/10',
  },
  xhs: {
    name: '小红书创作服务平台',
    url: 'https://creator.xiaohongshu.com/publish/publish',
    color: 'text-rose-600 dark:text-rose-400 border-rose-500/30 bg-rose-500/10',
  },
  zhihu: {
    name: '知乎创作平台',
    url: 'https://www.zhihu.com/creator/manage/creation/article',
    color: 'text-blue-600 dark:text-blue-400 border-blue-500/30 bg-blue-500/10',
  },
  baijiahao: {
    name: '百家号内容管理',
    url: 'https://baijiahao.baidu.com/builder/rc/home',
    color: 'text-indigo-600 dark:text-indigo-400 border-indigo-500/30 bg-indigo-500/10',
  },
  toutiao: {
    name: '今日头条创作者中心',
    url: 'https://mp.toutiao.com/profile_v4/graphic/articles',
    color: 'text-red-600 dark:text-red-400 border-red-500/30 bg-red-500/10',
  },
}

export interface SocialPublishReceiptCardProps {
  receipt: PublishReceiptData
  className?: string
}

export function SocialPublishReceiptCard({ receipt, className }: SocialPublishReceiptCardProps) {
  const [showScreenshotModal, setShowScreenshotModal] = useState(false)
  const meta = PLATFORM_OFFICIAL_URLS[receipt.platform] || {
    name: receipt.platformName || receipt.platform,
    url: 'https://mp.weixin.qq.com/',
    color: 'text-primary border-primary/30 bg-primary/10',
  }

  const actionText = useMemo(() => {
    if (receipt.publishAction === 'schedule') return '已成功排期托管'
    if (receipt.publishAction === 'publish_now') return '已正式发布'
    return '已安全存入草稿箱'
  }, [receipt.publishAction])

  const targetLink = receipt.draftUrl || meta.url

  const handleCopyLink = () => {
    navigator.clipboard.writeText(targetLink)
    toast('已复制平台后台链接到剪贴板')
  }

  return (
    <div
      className={cn(
        'my-3 flex flex-col gap-3 rounded-2xl border border-emerald-500/35 bg-card/90 p-4 shadow-sm backdrop-blur-sm',
        className,
      )}
      data-testid="social-publish-receipt-card"
    >
      {/* 头部：成功徽标与动作状态 */}
      <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shadow-2xs">
            <CheckCircle2 className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-ui-sm font-bold text-foreground">
                发布官方回执凭证
              </span>
              <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-semibold border', meta.color)}>
                {meta.name}
              </span>
              <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                {actionText}
              </span>
            </div>
            <p className="text-ui-2xs text-foreground-subtle mt-0.5">
              目标账号：{receipt.accountName} (ID: {receipt.accountId})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={handleCopyLink}
            className="h-7 gap-1 px-2 text-ui-2xs text-foreground-muted hover:text-primary cursor-pointer"
            title="复制后台链接"
          >
            <Copy className="size-3" />
            <span>复制链接</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => window.open(targetLink, '_blank')}
            className="h-7 gap-1 px-2.5 text-ui-2xs font-semibold text-primary hover:bg-primary/10 cursor-pointer"
            title="在浏览器中直接打开创作者后台查看"
          >
            <ExternalLink className="size-3" />
            <span>直达创作者后台</span>
          </Button>
        </div>
      </div>

      {/* 核心凭证信息网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-ui-xs bg-surface/30 p-2.5 rounded-xl border border-border/30">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-[10px] text-foreground-subtle">文章标题</span>
          <p className="font-semibold text-foreground truncate" title={receipt.title}>
            《{receipt.title}》
          </p>
        </div>

        {receipt.mediaId && (
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-[10px] text-foreground-subtle">平台草稿 / 媒体凭证 ID</span>
            <p className="font-mono text-ui-2xs text-primary truncate" title={receipt.mediaId}>
              {receipt.mediaId}
            </p>
          </div>
        )}

        {receipt.scheduledTime && (
          <div className="flex items-center gap-1.5 text-foreground-muted text-[11px]">
            <Calendar className="size-3 text-primary" />
            <span>预设排期时间：<strong>{receipt.scheduledTime}</strong></span>
          </div>
        )}

        {receipt.durationSeconds && (
          <div className="flex items-center gap-1.5 text-foreground-muted text-[11px]">
            <Clock className="size-3 text-emerald-500" />
            <span>全流程总耗时：<strong>{receipt.durationSeconds} 秒</strong></span>
          </div>
        )}
      </div>

      {/* 官方排期与发表凭证截图（直观核验后台真实安排） */}
      {receipt.screenshotUrl && (
        <div className="flex flex-col gap-2 bg-surface/40 p-3 rounded-xl border border-border/40">
          <div className="flex items-center justify-between text-ui-xs">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Camera className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>官方后台真实排期与发表凭证截图</span>
            </span>
            <span className="text-[10px] text-foreground-muted">点击可放大查验微信后台时段与批次</span>
          </div>
          <div
            className="relative w-full max-h-52 overflow-hidden rounded-lg border border-border/60 bg-black/5 dark:bg-black/20 cursor-zoom-in group shadow-2xs transition-transform hover:border-emerald-500/50"
            onClick={() => setShowScreenshotModal(true)}
            title="点击查看官方凭证大图"
          >
            <img
              src={receipt.screenshotUrl}
              alt="官方后台发布凭证截图"
              className="w-full h-auto object-cover object-top max-h-52 group-hover:scale-[1.01] transition-transform"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none'
              }}
            />
            <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-ui-xs font-semibold backdrop-blur-2xs">
              <Maximize2 className="size-4" />
              <span>点击查看完整后台凭证大图</span>
            </div>
          </div>
        </div>
      )}

      {/* 全屏凭证放大模态弹窗 */}
      {showScreenshotModal && receipt.screenshotUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setShowScreenshotModal(false)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-card rounded-2xl overflow-hidden border border-border shadow-2xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2.5 bg-surface border-b border-border">
              <span className="text-ui-sm font-bold text-foreground flex items-center gap-2">
                <Camera className="size-4 text-emerald-500" />
                <span>官方后台发布与定时排期核验大图</span>
              </span>
              <button
                type="button"
                onClick={() => setShowScreenshotModal(false)}
                className="size-7 rounded-lg hover:bg-surface-hover flex items-center justify-center text-foreground-muted hover:text-foreground cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="overflow-auto p-2 bg-surface/50 max-h-[calc(90vh-50px)]">
              <img
                src={receipt.screenshotUrl}
                alt="官方凭证放大图"
                className="w-full h-auto rounded-lg shadow-sm"
              />
            </div>
          </div>
        </div>
      )}

      {/* 底部保障与审计追溯 */}
      <div className="flex items-center justify-between text-ui-2xs text-foreground-subtlest pt-0.5">
        {receipt.traceId && (
          <span className="font-mono text-[10px] text-foreground-subtle" title={`Trace ID: ${receipt.traceId}`}>
            Trace: {receipt.traceId}
          </span>
        )}
        <div className="flex items-center gap-1">
          <ShieldCheck className="size-3 text-emerald-500" />
          <span>图文排版、Markdown 及 AI 高清配图快照已安全归档至本地保险箱</span>
        </div>
        <span>官方 API / 免密自动化回执核验完毕</span>
      </div>
    </div>
  )
}
