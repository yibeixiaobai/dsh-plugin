import { ImageIcon } from 'lucide-react'
import { cn } from '../../../compat/components/lib/utils.js'
import css from './SocialArticleImageCreatingPlaceholder.module.css'

export type ImagePlaceholderPlatform =
  | 'xiaohongshu'
  | 'wechat-newspic'
  | 'wechat-news'
  | 'inline-body'
  | 'generic'

export interface SocialArticleImageCreatingPlaceholderProps {
  platform: ImagePlaceholderPlatform
  isSecondary?: boolean
  articleIndex?: number
  caption?: string
  aspectRatio?: string
  className?: string
}

/**
 * 各平台专属配图装载微光动效占位组件
 * 【中文修复依据】：彻底剔除 Sparkles、旋转星芒与所有 Emoji（🎨、✨等），改为高质感出版物极简灰阶骨架屏
 */
export function SocialArticleImageCreatingPlaceholder({
  platform,
  isSecondary,
  articleIndex,
  className,
}: SocialArticleImageCreatingPlaceholderProps) {
  // 微信公众号次条（#2 ~ #N）专属 1:1 方形列表封面骨架屏
  if (platform === 'wechat-news' && (isSecondary || (articleIndex !== undefined && articleIndex > 1))) {
    return (
      <div
        data-testid="image-creating-placeholder-wechat-secondary"
        className={cn(css.secondaryPlaceholder, className)}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span className={css.secondaryBadge}>
              #{articleIndex || 2} 次条
            </span>
            <span style={{ fontSize: 11, color: 'var(--dsw-alias-label-secondary, #6b7280)', fontFamily: 'var(--ds-font-family-code, monospace)' }}>
              1:1 列表封面排版中
            </span>
          </div>
          <p style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary, #9ca3af)', margin: '4px 0 0' }}>
            配图落盘后将自动高保真渲染
          </p>
        </div>
        <div className={css.secondaryIconWrap}>
          <ImageIcon className={css.placeholderIcon} />
        </div>
      </div>
    )
  }

  // 小红书 3:4 竖版多图画廊骨架屏
  if (platform === 'xiaohongshu') {
    return (
      <div
        data-testid="image-creating-placeholder-xiaohongshu"
        className={cn(
          'relative aspect-[3/4] w-full overflow-hidden select-none bg-surface/40 border-b border-border/40',
          'flex flex-col items-center justify-center p-6 text-center',
          className,
        )}
      >
        <div className="flex flex-col items-center max-w-[260px] space-y-2.5">
          <div className="size-10 rounded-xl bg-surface-hover/60 border border-border/50 flex items-center justify-center">
            <ImageIcon className="size-5 text-foreground-muted opacity-70" />
          </div>

          <div className="space-y-1">
            <h4 className="text-ui-xs font-semibold text-foreground">
              3:4 视觉卡片构建中
            </h4>
            <p className="text-[11px] text-foreground-muted leading-relaxed font-mono">
              排版渲染就绪后将自动接入画廊展示
            </p>
          </div>
        </div>

        <div className="absolute top-3 left-3 px-2 py-0.5 rounded text-[10px] font-mono bg-background/60 text-foreground-muted border border-border/40">
          小红书 3:4 画廊
        </div>
      </div>
    )
  }

  // 微信小绿书 3:4 竖版图文骨架屏
  if (platform === 'wechat-newspic') {
    return (
      <div
        data-testid="image-creating-placeholder-wechat-newspic"
        className={cn(
          'relative aspect-[3/4] w-full overflow-hidden select-none bg-surface/40 border-b border-border/40',
          'flex flex-col items-center justify-center p-6 text-center',
          className,
        )}
      >
        <div className="flex flex-col items-center max-w-[260px] space-y-2.5">
          <div className="size-10 rounded-xl bg-surface-hover/60 border border-border/50 flex items-center justify-center">
            <ImageIcon className="size-5 text-foreground-muted opacity-70" />
          </div>

          <div className="space-y-1">
            <h4 className="text-ui-xs font-semibold text-foreground">
              小绿书图文卡片构建中
            </h4>
            <p className="text-[11px] text-foreground-muted leading-relaxed font-mono">
              3:4 竖版配图渲染完成后自动呈现
            </p>
          </div>
        </div>

        <div className="absolute top-3 left-3 px-2 py-0.5 rounded text-[10px] font-mono bg-background/60 text-foreground-muted border border-border/40">
          微信小绿书 3:4
        </div>
      </div>
    )
  }

  // 微信公众号长文 #1 头条大图封面 2.35:1
  if (platform === 'wechat-news') {
    return (
      <div
        data-testid="image-creating-placeholder-wechat-news"
        className={cn(css.headlinerPlaceholder, className)}
      >
        <div className={css.placeholderInner}>
          <div className={css.placeholderIconWrap}>
            <ImageIcon className={css.placeholderIcon} />
          </div>

          <div className={css.placeholderTextCol}>
            <h4 className={css.placeholderTitle}>
              微信公众号 2.35:1 官方主图渲染中
            </h4>
            <p className={css.placeholderDesc}>
              配图落盘后将自动无缝贴合至画纸顶部
            </p>
          </div>
        </div>

        <div className={css.placeholderBadge}>
          #1 头条 2.35:1 主封面
        </div>
      </div>
    )
  }

  // 通用专栏平台（知乎等） 16:9
  return (
    <div
      data-testid="image-creating-placeholder-generic"
      className={cn(
        'relative aspect-[16/9] w-full overflow-hidden select-none rounded-xl bg-surface/40 border border-border/40',
        'flex items-center justify-center p-5 text-center',
        className,
      )}
    >
      <div className="flex items-center gap-3.5 max-w-[400px] text-left">
        <div className="size-10 rounded-lg bg-surface-hover/60 border border-border/50 flex items-center justify-center shrink-0">
          <ImageIcon className="size-5 text-foreground-muted opacity-70" />
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="text-ui-xs font-semibold text-foreground">
            专栏 16:9 封面配图构建中
          </h4>
          <p className="text-[11px] text-foreground-muted leading-relaxed font-mono mt-0.5">
            落盘后将自动高保真渲染
          </p>
        </div>
      </div>

      <div className="absolute bottom-2.5 right-3 px-2 py-0.5 rounded text-[10px] font-mono bg-background/60 text-foreground-muted border border-border/40">
        16:9 专栏封面
      </div>
    </div>
  )
}
