import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Command, Check, Edit3 } from 'lucide-react'
import { cn } from '../../../compat/components/lib/utils.js'
import type { ArticleItem } from '../socialPublisherWorkflowExtractor.js'
import { extractLocalDiskPathFromUrl } from '../socialPublisherWorkflowExtractor.js'
import { getPlatformDisplayName } from '../utils/socialClipboard.js'
import { SafePreviewImage } from '../components/SocialArticleGenericRenderer.js'
import { SocialArticleImageCreatingPlaceholder } from '../components/SocialArticleImageCreatingPlaceholder.js'
import { SocialImageActionOverlay } from '../components/SocialImageActionOverlay.js'
import { renderBrandBanner } from '../components/SocialBrandBannerRenderer.js'
import {
  parseMarkdownToGenericBlocks,
  compileGenericBlocksToMarkdown,
} from './genericMarkdownBridge.js'
import type { GenericSectionBlock } from './genericCanvasTypes.js'
import { GenericEditableBlock } from './GenericEditableBlock.js'
import { resolveGenericPlatformMeta } from './genericCanvasPlatformMeta.js'

export interface GenericInteractiveCanvasProps {
  article: ArticleItem
  workspacePath?: string
  workspaceIdentity?: string
  sessionId?: string
  scriptsDir?: string
  resolvedCoverUrl?: string
  resolvedMap?: Map<string, string>
  brandTopUrl?: string
  brandBotUrl?: string
  brandTopSpec?: any
  brandBotSpec?: any
  onTitleChange?: (newTitle: string) => void
  onContentChange?: (newContent: string) => void
}

/**
 * 通用专栏长图文高保真交互画纸 (知乎 / 今日头条 / 百家号)
 * 【中文修复依据】：完全对齐微信公众号画纸设计，直接在原文上就地修改，彻底杜绝 textarea 切换与新开独立编辑器页面！
 * 顶部专享封面展位，正文仅呈现正文插图与章节排版，彻底消除封面重复混入正文缺陷。
 */
export function GenericInteractiveCanvas({
  article,
  workspacePath,
  sessionId: _sessionId,
  scriptsDir,
  resolvedCoverUrl,
  resolvedMap,
  brandTopUrl,
  brandBotUrl,
  brandTopSpec,
  brandBotSpec,
  onTitleChange,
  onContentChange,
}: GenericInteractiveCanvasProps) {
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  const platformMeta = useMemo(
    () => resolveGenericPlatformMeta(article.platform),
    [article.platform],
  )

  // 将文章正文拆解为结构化 Blocks
  const [blocks, setBlocks] = useState<GenericSectionBlock[]>(() =>
    parseMarkdownToGenericBlocks(article.content || ''),
  )
  const lastSyncContentRef = useRef(article.content)

  useEffect(() => {
    if (article.content && article.content !== lastSyncContentRef.current) {
      lastSyncContentRef.current = article.content
      setBlocks(parseMarkdownToGenericBlocks(article.content))
    }
  }, [article.content])

  // 防抖回写：当用户在任意段落打字时，防抖重新编译为 Markdown 并写回
  const debounceTimerRef = useRef<any | null>(null)

  const handleBlockChange = useCallback(
    (blockId: string, newText: string) => {
      setBlocks((prev) => {
        const next = prev.map(b => (b.id === blockId ? { ...b, text: newText } : b))
        const compiled = compileGenericBlocksToMarkdown(next)
        lastSyncContentRef.current = compiled

        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = setTimeout(() => {
          onContentChange?.(compiled)
          setJustSaved(true)
          setTimeout(() => setJustSaved(false), 1500)
        }, 200)

        return next
      })
    },
    [onContentChange],
  )

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [])

  const hasTopInBlocks = useMemo(
    () => blocks.some(b => b.type === 'brand_top'),
    [blocks],
  )
  const hasBotInBlocks = useMemo(
    () => blocks.some(b => b.type === 'brand_bot'),
    [blocks],
  )

  const resolveImageSource = useCallback(
    (src?: string): string | undefined => {
      if (!src) return undefined
      const isDirectProtocol =
        src.startsWith('http://') ||
        src.startsWith('https://') ||
        src.startsWith('data:') ||
        src.startsWith('wincode-media://')

      if (!resolvedMap) return isDirectProtocol ? src : undefined

      const diskPath = extractLocalDiskPathFromUrl(src)
      const fileName = src.replace(/^.*[\\/]/, '')
      let resolved =
        resolvedMap.get(src) || resolvedMap.get(diskPath) || resolvedMap.get(fileName)

      if (!resolved) {
        for (const [k, v] of resolvedMap.entries()) {
          if ((fileName && k.endsWith(fileName)) || (diskPath && k.includes(diskPath))) {
            resolved = v
            break
          }
        }
      }

      if (!resolved) {
        const pMatch = src.match(/(?:IMG_A?(\d+)_(\d+)|IMG_(\d+)_(\d+)|CONTENT_(\d+)_(\d+)|IMG_(\d+)|CONTENT_(\d+))/i)
        if (pMatch) {
          const artIdxStr = pMatch[1] || pMatch[3] || pMatch[5]
          const sIdx = pMatch[2] || pMatch[4] || pMatch[6] || pMatch[7] || pMatch[8] || '1'
          // 【中文修复依据】：若正文占位符未显式声明篇号（如 IMG_1），严格锁定当前文章的篇序号 article.index，绝不借用第 1 篇的插图！
          const currentArtIdx = article.index || 1
          const targetArtIdx = artIdxStr ? Number.parseInt(artIdxStr, 10) : currentArtIdx

          for (const [k, v] of resolvedMap.entries()) {
            if (
              k.endsWith(`content_${targetArtIdx}_${sIdx}.png`) ||
              k.endsWith(`content_${targetArtIdx}_${sIdx}.jpg`) ||
              k.endsWith(`pic_${targetArtIdx}_${sIdx}.png`) ||
              k.endsWith(`pic_${targetArtIdx}_${sIdx}.jpg`) ||
              (targetArtIdx === 1 && (k.endsWith(`content_${sIdx}.png`) || k.endsWith(`pic_${sIdx}.png`)))
            ) {
              resolved = v
              break
            }
          }
        }
      }

      return resolved || (isDirectProtocol ? src : undefined)
    },
    [resolvedMap, article.index],
  )

  return (
    <div
      className="mx-auto max-w-[720px] rounded-3xl border border-border/80 bg-card shadow-sm p-6 sm:p-10 space-y-6 pb-12 transition-all select-text"
      onClick={() => setSelectedBlockId(null)}
    >
      {/* 顶部状态与专栏身份栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-3.5 text-ui-xs text-foreground-muted select-none">
        <div className="flex items-center gap-2.5">
          <span className={cn('px-2 py-0.5 rounded-md font-semibold text-ui-xs border', platformMeta.badgeClass)}>
            {platformMeta.badge}
          </span>
          <div>
            <div className="font-bold text-foreground flex items-center gap-1.5">
              <span>{getPlatformDisplayName(article.platform, article.platformName)}</span>
              <span className="font-normal text-foreground-subtle">@{article.accountName || article.accountId}</span>
            </div>
            <div className="text-[11px] text-foreground-subtle">{platformMeta.subtitle}</div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 font-mono text-[11px]">
          {justSaved && (
            <span className="inline-flex items-center gap-1 text-emerald-600 font-bold animate-in fade-in">
              <Check className="size-3" />
              <span>已就地实时同步</span>
            </span>
          )}
          <span className="text-foreground-subtle bg-surface px-2 py-0.5 rounded-full border border-border/40">
            {blocks.length} 个排版段落
          </span>
        </div>
      </div>

      {/* 标题：100% 对齐公众号，直接原地输入修改 */}
      <div className="space-y-1.5 group/title relative">
        <input
          type="text"
          value={article.title || ''}
          onChange={e => onTitleChange?.(e.target.value)}
          placeholder="请输入专栏文章标题..."
          className="w-full text-ui-xl sm:text-[22px] font-bold text-foreground bg-transparent border-0 border-b border-transparent hover:border-border/60 focus:border-primary focus:outline-hidden py-1 transition-colors leading-snug"
        />
        <div className="flex items-center justify-between text-[11px] text-foreground-subtle select-none">
          <span className="flex items-center gap-1">
            <Edit3 className="size-3 text-primary/70" />
            <span>所见即所得：直接在原文段落打字修改，修改即刻自动保存</span>
          </span>
          <span className="font-mono text-foreground-subtle/80">#1 篇目</span>
        </div>
      </div>

      {/* 封面图：带点击放大与遮罩操作，长图文专享独立展位 */}
      {resolvedCoverUrl ? (
        <div className={cn(platformMeta.aspectRatio, 'w-full rounded-2xl overflow-hidden border border-border/50 relative group select-none shadow-xs')}>
          <SafePreviewImage
            src={resolvedCoverUrl}
            alt="专栏封面"
            aspectRatio={platformMeta.aspectRatio}
            onClick={() => setLightboxUrl(resolvedCoverUrl)}
          />
          <div className="absolute bottom-2.5 right-3 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-xs select-none">
            #{article.index || 1} {platformMeta.label} {platformMeta.ratioLabel} 大图封面
          </div>
          <SocialImageActionOverlay
            slotTitle={`专栏封面 (#${article.index || 1})`}
            kind="cover"
            articleIndex={article.index || 1}
            currentImageUrl={resolvedCoverUrl}
            scriptsDir={scriptsDir}
            targetFileName={`cover_${article.index || 1}.png`}
            accountId={article.accountId}
            platform={article.platform}
            workspacePath={workspacePath}
            onZoom={() => setLightboxUrl(resolvedCoverUrl)}
          />
        </div>
      ) : (
        <SocialArticleImageCreatingPlaceholder platform="generic" />
      )}

      {/* 头部品牌图：专栏头部高保真呈现（与公众号排版规范 100% 对齐） */}
      {brandTopUrl && !hasTopInBlocks && (
        <div className="pt-2 pb-1">
          {renderBrandBanner(brandTopUrl, brandTopSpec, 'header', url => setLightboxUrl(url))}
        </div>
      )}

      {/* 正文各排版块渲染（支持所见即所得打字编辑） */}
      <div className="space-y-3 pt-2">
        {blocks.map((block) => {
          if (block.type === 'brand_top') {
            return (
              <div key={block.id} className="py-2">
                {renderBrandBanner(brandTopUrl, brandTopSpec, 'header', url => setLightboxUrl(url))}
              </div>
            )
          }

          if (block.type === 'brand_bot') {
            return (
              <div key={block.id} className="py-3">
                {renderBrandBanner(brandBotUrl, brandBotSpec, 'footer', url => setLightboxUrl(url))}
              </div>
            )
          }

          if (block.type === 'img') {
            const finalSrc = resolveImageSource(block.src)

            // 【中文修复依据】：严禁在正文区域渲染封面！顶部已独立展示
            const isCoverImage =
              (resolvedCoverUrl && finalSrc === resolvedCoverUrl) ||
              /(?:cover_\d+|cover\.|IMG_COVER|COVER_IMG)/i.test(block.src || '') ||
              (block.alt && block.alt.includes('封面'))
            if (isCoverImage) {
              return null
            }

            if (!finalSrc) {
              return (
                <SocialArticleImageCreatingPlaceholder
                  key={block.id}
                  platform="inline-body"
                  caption={block.alt ? `▲ ${block.alt}` : undefined}
                />
              )
            }

            return (
              <figure
                key={block.id}
                className="my-5 rounded-2xl overflow-hidden border border-border/60 bg-surface/30 shadow-xs relative group select-none"
              >
                <SafePreviewImage
                  src={finalSrc}
                  alt={block.alt || '专栏插图'}
                  aspectRatio="aspect-auto"
                  className="w-full bg-surface/20"
                  onClick={() => setLightboxUrl(finalSrc)}
                />
                <SocialImageActionOverlay
                  slotTitle={block.alt || '专栏插图'}
                  kind="pic"
                  articleIndex={article.index || 1}
                  currentImageUrl={finalSrc}
                  scriptsDir={scriptsDir}
                  accountId={article.accountId}
                  platform={article.platform}
                  workspacePath={workspacePath}
                  onZoom={() => setLightboxUrl(finalSrc)}
                />
                {block.alt && (
                  <figcaption className="px-3 py-1.5 text-center text-ui-2xs text-foreground-subtle bg-surface/50 border-t border-border/30 font-medium">
                    ▲ {block.alt}
                  </figcaption>
                )}
              </figure>
            )
          }

          return (
            <GenericEditableBlock
              key={block.id}
              block={block}
              platform={article.platform}
              isSelected={selectedBlockId === block.id}
              onSelect={() => setSelectedBlockId(block.id)}
              onContentChange={handleBlockChange}
            />
          )
        })}
      </div>

      {/* 尾部品牌图：专栏文末高保真呈现 */}
      {brandBotUrl && !hasBotInBlocks && (
        <div className="pt-4 pb-2 border-t border-border/30">
          {renderBrandBanner(brandBotUrl, brandBotSpec, 'footer', url => setLightboxUrl(url))}
        </div>
      )}

      {/* 底部常用快捷键指南提示条 */}
      <div className="pt-6 border-t border-border/30 text-center text-ui-2xs text-foreground-subtle select-none flex flex-wrap items-center justify-center gap-2 font-mono">
        <div className="flex items-center gap-1 text-foreground-muted">
          <Command className="size-3 text-foreground-subtle" />
          <span>所见即所得</span>
        </div>
        {['点击直接打字修改', 'Ctrl+S 立即保存', '修改实时同步'].map(tip => (
          <span
            key={tip}
            className="px-1.5 py-0.2 rounded text-[11px] text-foreground-subtle bg-surface-hover/50 border border-border/30"
          >
            {tip}
          </span>
        ))}
      </div>

      {/* Lightbox 全屏放大 */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt="高清放大"
            className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl"
          />
        </div>
      )}
    </div>
  )
}
