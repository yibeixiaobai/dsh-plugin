import { useRef, useEffect, useCallback, type ReactNode } from 'react'
import { cn } from '../../../compat/components/lib/utils.js'
import type { GenericSectionBlock } from './genericCanvasTypes.js'

interface GenericEditableBlockProps {
  block: GenericSectionBlock
  platform?: string
  isSelected?: boolean
  onSelect?: () => void
  onContentChange: (blockId: string, newText: string) => void
}

/**
 * 通用专栏长图文（知乎、今日头条、百家号）原位所见即所得编辑节点
 * 100% 对齐微信公众号 WechatEditableNode 交互体验：
 * 绝不切换为 textarea，排版样式就地保留，支持中文输入法 (IME) 防频闪与纯文本安全粘贴
 */
export function GenericEditableBlock({
  block,
  platform,
  isSelected,
  onSelect,
  onContentChange,
}: GenericEditableBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isComposingRef = useRef(false)
  const isFocusedRef = useRef(false)
  const lastTextRef = useRef(block.text || '')

  // 初始化与外部更新单向同步（聚焦打字时绝不从外部覆盖 innerText，杜绝光标跳动丢失）
  useEffect(() => {
    if (!containerRef.current) return
    if (isFocusedRef.current) return

    const currentDomText = containerRef.current.innerText || ''
    const targetText = block.text || ''
    if (currentDomText !== targetText) {
      containerRef.current.innerText = targetText
      lastTextRef.current = targetText
    }
  }, [block.text, block.id])

  const handleInput = useCallback(() => {
    if (!containerRef.current) return
    if (isComposingRef.current) return

    const currentText = containerRef.current.innerText || ''
    if (currentText !== lastTextRef.current) {
      lastTextRef.current = currentText
      onContentChange(block.id, currentText)
    }
  }, [block.id, onContentChange])

  // 纯文本粘贴：防止外部网页杂乱样式污染专栏排版
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault()
      const text = e.clipboardData.getData('text/plain')
      if (!text) return

      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) return

      const range = selection.getRangeAt(0)
      range.deleteContents()

      const textNode = document.createTextNode(text)
      range.insertNode(textNode)

      range.setStartAfter(textNode)
      range.setEndAfter(textNode)
      selection.removeAllRanges()
      selection.addRange(range)

      handleInput()
    },
    [handleInput],
  )

  const isToutiao = platform === 'toutiao'
  const isZhihu = platform === 'zhihu'
  const isBaijiahao = platform === 'baijiahao'

  // 渲染主体：根据不同的 block.type 保留原汁原味的高保真排版
  let contentNode: ReactNode = null

  switch (block.type) {
    case 'h1':
      contentNode = (
        <div className="pt-4 pb-1 border-b border-border/40">
          <div
            ref={containerRef}
            contentEditable={true}
            suppressContentEditableWarning={true}
            onFocus={() => {
              isFocusedRef.current = true
              onSelect?.()
            }}
            onBlur={() => {
              isFocusedRef.current = false
              handleInput()
            }}
            onCompositionStart={() => {
              isComposingRef.current = true
            }}
            onCompositionEnd={() => {
              isComposingRef.current = false
              handleInput()
            }}
            onInput={handleInput}
            onPaste={handlePaste}
            className="text-ui-lg font-bold text-foreground tracking-tight outline-hidden focus:outline-hidden py-1 rounded px-1 -mx-1 hover:bg-surface-hover/30 focus:bg-primary/5 transition-colors cursor-text"
          />
        </div>
      )
      break

    case 'h2':
      contentNode = (
        <div className="pt-4 pb-1 flex items-start gap-2.5">
          <span
            className={cn(
              'w-1.5 h-5 rounded-full shrink-0 mt-1 select-none',
              isToutiao
                ? 'bg-red-600 dark:bg-red-500'
                : isZhihu
                  ? 'bg-sky-600 dark:bg-sky-500'
                  : isBaijiahao
                    ? 'bg-blue-600 dark:bg-blue-500'
                    : 'bg-primary',
            )}
          />
          <div
            ref={containerRef}
            contentEditable={true}
            suppressContentEditableWarning={true}
            onFocus={() => {
              isFocusedRef.current = true
              onSelect?.()
            }}
            onBlur={() => {
              isFocusedRef.current = false
              handleInput()
            }}
            onCompositionStart={() => {
              isComposingRef.current = true
            }}
            onCompositionEnd={() => {
              isComposingRef.current = false
              handleInput()
            }}
            onInput={handleInput}
            onPaste={handlePaste}
            className="flex-1 text-ui-base sm:text-ui-lg font-bold text-foreground tracking-tight outline-hidden focus:outline-hidden py-0.5 rounded px-1 -mx-1 hover:bg-surface-hover/30 focus:bg-primary/5 transition-colors cursor-text"
          />
        </div>
      )
      break

    case 'h3':
      contentNode = (
        <div className="pt-2 pb-0.5">
          <div
            ref={containerRef}
            contentEditable={true}
            suppressContentEditableWarning={true}
            onFocus={() => {
              isFocusedRef.current = true
              onSelect?.()
            }}
            onBlur={() => {
              isFocusedRef.current = false
              handleInput()
            }}
            onCompositionStart={() => {
              isComposingRef.current = true
            }}
            onCompositionEnd={() => {
              isComposingRef.current = false
              handleInput()
            }}
            onInput={handleInput}
            onPaste={handlePaste}
            className="text-ui-sm sm:text-ui-base font-semibold text-foreground/95 outline-hidden focus:outline-hidden py-0.5 rounded px-1 -mx-1 hover:bg-surface-hover/30 focus:bg-primary/5 transition-colors cursor-text"
          />
        </div>
      )
      break

    case 'h4':
      contentNode = (
        <div className="pt-1.5 pb-0.5">
          <div
            ref={containerRef}
            contentEditable={true}
            suppressContentEditableWarning={true}
            onFocus={() => {
              isFocusedRef.current = true
              onSelect?.()
            }}
            onBlur={() => {
              isFocusedRef.current = false
              handleInput()
            }}
            onCompositionStart={() => {
              isComposingRef.current = true
            }}
            onCompositionEnd={() => {
              isComposingRef.current = false
              handleInput()
            }}
            onInput={handleInput}
            onPaste={handlePaste}
            className="text-ui-xs font-bold text-foreground/85 outline-hidden focus:outline-hidden py-0.5 rounded px-1 -mx-1 hover:bg-surface-hover/30 focus:bg-primary/5 transition-colors cursor-text"
          />
        </div>
      )
      break

    case 'blockquote':
      contentNode = (
        <blockquote
          className={cn(
            'my-3 border-l-4 rounded-r-lg px-4 py-2.5 text-ui-xs leading-relaxed',
            isToutiao
              ? 'border-red-500/70 bg-red-500/[0.04] text-foreground-subtle'
              : isZhihu
                ? 'border-sky-500/70 bg-sky-500/[0.04] text-foreground-subtle'
                : isBaijiahao
                  ? 'border-blue-500/70 bg-blue-500/[0.04] text-foreground-subtle'
                  : 'border-primary/60 bg-primary/5 text-foreground-subtle',
          )}
        >
          <div
            ref={containerRef}
            contentEditable={true}
            suppressContentEditableWarning={true}
            onFocus={() => {
              isFocusedRef.current = true
              onSelect?.()
            }}
            onBlur={() => {
              isFocusedRef.current = false
              handleInput()
            }}
            onCompositionStart={() => {
              isComposingRef.current = true
            }}
            onCompositionEnd={() => {
              isComposingRef.current = false
              handleInput()
            }}
            onInput={handleInput}
            onPaste={handlePaste}
            className="outline-hidden focus:outline-hidden cursor-text"
          />
        </blockquote>
      )
      break

    case 'li':
      contentNode = (
        <div className="flex items-start gap-2.5 text-ui-sm text-foreground/90 leading-relaxed pl-1 py-0.5">
          <span className="size-1.5 rounded-full bg-foreground-subtle/70 mt-2 shrink-0 select-none" />
          <div
            ref={containerRef}
            contentEditable={true}
            suppressContentEditableWarning={true}
            onFocus={() => {
              isFocusedRef.current = true
              onSelect?.()
            }}
            onBlur={() => {
              isFocusedRef.current = false
              handleInput()
            }}
            onCompositionStart={() => {
              isComposingRef.current = true
            }}
            onCompositionEnd={() => {
              isComposingRef.current = false
              handleInput()
            }}
            onInput={handleInput}
            onPaste={handlePaste}
            className="flex-1 outline-hidden focus:outline-hidden rounded px-1 -mx-1 hover:bg-surface-hover/30 focus:bg-primary/5 transition-colors cursor-text"
          />
        </div>
      )
      break

    case 'hr':
      contentNode = <hr className="my-5 border-border/50" />
      break

    case 'p':
    default:
      contentNode = (
        <div className="py-0.5">
          <div
            ref={containerRef}
            contentEditable={true}
            suppressContentEditableWarning={true}
            onFocus={() => {
              isFocusedRef.current = true
              onSelect?.()
            }}
            onBlur={() => {
              isFocusedRef.current = false
              handleInput()
            }}
            onCompositionStart={() => {
              isComposingRef.current = true
            }}
            onCompositionEnd={() => {
              isComposingRef.current = false
              handleInput()
            }}
            onInput={handleInput}
            onPaste={handlePaste}
            className="text-ui-sm sm:text-[15px] text-foreground/90 leading-[1.8] min-h-[1.5rem] outline-hidden focus:outline-hidden py-0.5 rounded px-1 -mx-1 hover:bg-surface-hover/30 focus:bg-primary/5 transition-colors cursor-text tracking-wide"
          />
        </div>
      )
      break
  }

  return (
    <div
      onClick={onSelect}
      className={cn(
        'relative rounded-md transition-all duration-200',
        isSelected ? 'ring-1 ring-primary/40 bg-primary/[0.02]' : '',
      )}
    >
      {contentNode}
    </div>
  )
}
