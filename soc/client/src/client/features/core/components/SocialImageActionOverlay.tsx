import React, { useState, useRef, useEffect } from 'react'
import { RefreshCw, Upload, ZoomIn, Loader2, Image as ImageIcon, Check, X, Trash2 } from 'lucide-react'
import { Button } from '../../../compat/components/ui/button.js'
import { toast } from '../../../compat/components/ui/toast.js'
import { useOptionalServices } from '../../../compat/hooks/useServices.js'
import { publisherApiFetch, safeParseJson } from '../../../settings/SocialPublisherTypes.js'
import { invalidateMediaCache } from '../useResolvedMediaUrls.js'

export interface SocialImageActionOverlayProps {
  slotTitle: string
  kind: 'cover' | 'content' | 'pic'
  articleIndex?: number
  subIndex?: number
  currentImageUrl?: string
  currentPrompt?: string
  intentDescription?: string
  searchKeywords?: string[]
  scriptsDir?: string
  targetFileName?: string
  targetDiskPath?: string
  accountId?: string
  platform?: string
  workspacePath?: string
  onImageChanged?: (newUrl: string) => void
  onZoom?: () => void
  onDelete?: () => void
  canDelete?: boolean
  className?: string
  alwaysVisible?: boolean
}

export function SocialImageActionOverlay({
  slotTitle,
  kind,
  articleIndex = 1,
  subIndex = 1,
  currentImageUrl: _currentImageUrl,
  currentPrompt = '',
  intentDescription,
  searchKeywords,
  scriptsDir,
  targetFileName,
  targetDiskPath,
  accountId,
  platform,
  workspacePath,
  onImageChanged,
  onZoom,
  onDelete,
  canDelete,
  className = '',
  alwaysVisible = false,
}: SocialImageActionOverlayProps) {
  const services = useOptionalServices()
  const socialPublisherRpc = services?.socialPublisherService ?? null

  const [dialogOpen, setDialogOpen] = useState(false)
  const defaultFallbackPrompt =
    kind === 'cover'
      ? '现代科技学术风格，大气简约构图，符合文章主题意象，中文字符艺术排版'
      : kind === 'pic'
        ? '小红书爆款排版风格，3:4 竖版构图，信息卡片清晰，全中文排版'
        : '高信息密度学术图表，严谨工整，信息漏斗/流程图，浅色干净背景'

  const [promptText, setPromptText] = useState(currentPrompt || defaultFallbackPrompt)

  // 【中文修复依据】：弹窗打开或槽位 Prompt 变化时实时同步预填原生图 Prompt 与设计意图，杜绝残留空值或假模板
  useEffect(() => {
    if (dialogOpen) {
      if (currentPrompt?.trim()) {
        setPromptText(currentPrompt.trim())
      } else if (intentDescription?.trim()) {
        setPromptText(intentDescription.trim())
      }
    }
  }, [dialogOpen, currentPrompt, intentDescription])
  const [generating, setGenerating] = useState(false)
  const [replacing, setReplacing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // 1. 本地文件上传替换
  const handleSelectLocalFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setReplacing(true)
    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const base64Data = String(event.target?.result || '')
        const fallbackName =
          targetFileName ||
          (kind === 'cover'
            ? `cover_${articleIndex}.png`
            : kind === 'pic'
              ? `pic_${articleIndex}_${subIndex}.png`
              : `content_${articleIndex}_${subIndex}.png`)

        const res = await publisherApiFetch(
          '/api/gzh-publisher/replace-image',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              targetPath: targetDiskPath,
              fileName: fallbackName,
              scriptsDir,
              base64Data,
              workspace: workspacePath,
            }),
          },
          socialPublisherRpc,
        )

        const parsed = await safeParseJson(res)
        if (parsed.ok && parsed.data?.ok) {
          const writtenPath = parsed.data.path || targetDiskPath || fallbackName
          invalidateMediaCache(writtenPath, base64Data)
          if (fallbackName) invalidateMediaCache(fallbackName, base64Data)
          onImageChanged?.(base64Data)
          toast(`已成功替换【${slotTitle}】为本地图片`)
        } else {
          toast(parsed.data?.error || '替换图片失败，请检查写入权限')
        }
      } catch (err: any) {
        toast(`替换图片异常: ${err.message || String(err)}`)
      } finally {
        setReplacing(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    }
    reader.readAsDataURL(file)
  }

  // 2. 调用 AI 重新生成图片
  const handleStartRegenerate = async () => {
    if (!promptText.trim()) {
      toast('生图提示词不能为空')
      return
    }

    setGenerating(true)
    try {
      const fallbackName =
        targetFileName ||
        (kind === 'cover'
          ? `cover_${articleIndex}.png`
          : kind === 'pic'
            ? `pic_${articleIndex}_${subIndex}.png`
            : `content_${articleIndex}_${subIndex}.png`)

      const res = await publisherApiFetch(
        '/api/gzh-publisher/regenerate-image',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetPath: targetDiskPath,
            fileName: fallbackName,
            kind,
            index: articleIndex,
            sub: subIndex,
            prompt: promptText.trim(),
            accountId,
            platform,
            scriptsDir,
            workspace: workspacePath,
          }),
        },
        socialPublisherRpc,
      )

      const parsed = await safeParseJson(res)
      if (parsed.ok && parsed.data?.ok) {
        const dataUrl = parsed.data.data_url
        const writtenPath = parsed.data.path || targetDiskPath || fallbackName
        invalidateMediaCache(writtenPath, dataUrl)
        if (fallbackName) invalidateMediaCache(fallbackName, dataUrl)
        if (dataUrl) onImageChanged?.(dataUrl)
        toast(`已成功重新生成【${slotTitle}】`)
        setDialogOpen(false)
      } else {
        toast(parsed.data?.error || '重新生成配图失败，请检查生图接口配置')
      }
    } catch (err: any) {
      toast(`生图异常: ${err.message || String(err)}`)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <>
      {/* 隐藏的原生文件选择框 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/jpg"
        className="hidden"
        onChange={handleSelectLocalFile}
      />

      {/* 悬停微光操作胶囊条 */}
      <div
        className={`absolute top-2 right-2 z-20 flex items-center gap-1 p-1 rounded-full bg-black/65 backdrop-blur-md border border-white/20 shadow-lg text-white transition-all duration-200 ${
          alwaysVisible
            ? 'opacity-100 scale-100'
            : 'opacity-0 group-hover:opacity-100 hover:opacity-100 scale-95 group-hover:scale-100'
        } ${className}`}
        onClick={e => e.stopPropagation()}
      >
        {/* 重新生成按钮 */}
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          disabled={generating || replacing}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/80 hover:bg-primary text-primary-foreground shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          title="微调提示词并重新生成该图"
        >
          {generating ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
          <span>重新生成</span>
        </button>

        {/* 本地替换按钮 */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={generating || replacing}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-white/15 hover:bg-white/25 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          title="选择本地图片文件直接替换"
        >
          {replacing ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}
          <span>替换</span>
        </button>

        {/* 放大查看按钮 */}
        {onZoom && (
          <button
            type="button"
            onClick={onZoom}
            className="p-1 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-zoom-in"
            title="高清放大查看"
          >
            <ZoomIn className="size-3.5" />
          </button>
        )}

        {/* 删除卡片按钮 */}
        {canDelete && onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            className="p-1 rounded-full hover:bg-rose-500/30 text-rose-300 hover:text-rose-100 transition-colors cursor-pointer"
            title="删除此卡片"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>

      {/* 微调提示词弹窗 */}
      {dialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in"
          onClick={() => !generating && setDialogOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-card border border-border p-5 shadow-2xl text-card-foreground space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <ImageIcon className="size-4" />
                </div>
                <div>
                  <h3 className="text-ui-sm font-semibold text-foreground">重新生成：{slotTitle}</h3>
                  <p className="text-[11px] text-foreground-muted">微调画面 Prompt 描述，AI 将就地重绘并替换当前槽位</p>
                </div>
              </div>
              <button
                type="button"
                disabled={generating}
                onClick={() => setDialogOpen(false)}
                className="p-1 rounded-lg hover:bg-surface text-foreground-muted hover:text-foreground cursor-pointer disabled:opacity-50"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-ui-xs">
                <span className="font-medium text-foreground">生图提示词（Prompt）</span>
                <span className="text-[10px] text-foreground-subtle">支持中文描述，突出风格与主体</span>
              </div>

              {intentDescription && (
                <div className="p-2.5 rounded-xl bg-primary/5 border border-primary/15 text-ui-2xs text-foreground-muted leading-relaxed">
                  <span className="font-bold text-primary mr-1.5">💡 原配图意图:</span>
                  <span>{intentDescription}</span>
                </div>
              )}

              <textarea
                value={promptText}
                onChange={e => setPromptText(e.target.value)}
                disabled={generating}
                rows={4}
                className="w-full rounded-xl border border-input bg-background p-3 text-ui-xs text-foreground placeholder:text-foreground-subtle focus:outline-hidden ring-2 ring-primary/20 focus:border-primary disabled:opacity-50 leading-relaxed"
                placeholder="描述你想要的画面，例如：深蓝色学术图表、扁平化科技折线图，极简留白..."
              />

              {Array.isArray(searchKeywords) && searchKeywords.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-foreground-subtle">推荐关键词:</span>
                  {searchKeywords.map((kw, kwIdx) => (
                    <button
                      key={kwIdx}
                      type="button"
                      disabled={generating}
                      onClick={() => {
                        const trimmed = kw.trim()
                        if (trimmed && !promptText.includes(trimmed)) {
                          setPromptText(prev => (prev ? `${prev}，${trimmed}` : trimmed))
                        }
                      }}
                      className="inline-flex items-center rounded-md bg-surface px-1.5 py-0.5 text-[10px] text-foreground-muted hover:text-primary hover:bg-primary/10 border border-border/60 transition-colors cursor-pointer"
                      title="点击追加到提示词"
                    >
                      + {kw}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="text-[11px] text-foreground-subtle">
                规格：{kind === 'cover' ? '封面比例' : kind === 'pic' ? '3:4 竖版多图' : '正文插图'}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={generating}
                  onClick={() => setDialogOpen(false)}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={generating}
                  onClick={handleStartRegenerate}
                  className="gap-1.5"
                >
                  {generating ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      <span>AI 生图中...</span>
                    </>
                  ) : (
                    <>
                      <Check className="size-3.5" />
                      <span>开始重新生成</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
