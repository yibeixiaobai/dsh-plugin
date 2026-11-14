import { useState } from 'react'
import {
  ArrowUp,
  ArrowDown,
  Plus,
  Palette,
  Copy,
  Trash2,
  Images,
  RefreshCw,
} from 'lucide-react'
import { WECHAT_THEMES } from './wechatCanvasTypes.js'
import css from './WechatContainerGizmo.module.css'

interface WechatContainerGizmoProps {
  label: string
  isFirst: boolean
  isLast: boolean
  hasImages?: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onInsertAbove: () => void
  onInsertBelow: () => void
  onDuplicate: () => void
  onDelete: () => void
  onChangeTheme: (themeKey: string) => void
  onBatchReplaceImages?: () => void
  onRegenerateImage?: () => void
}

export function WechatContainerGizmo({
  label,
  isFirst,
  isLast,
  hasImages = false,
  onMoveUp,
  onMoveDown,
  onInsertAbove,
  onInsertBelow,
  onDuplicate,
  onDelete,
  onChangeTheme,
  onBatchReplaceImages,
  onRegenerateImage,
}: WechatContainerGizmoProps) {
  const [showPalette, setShowPalette] = useState(false)

  return (
    <div
      className={css.gizmo}
      onClick={e => e.stopPropagation()}
    >
      {/* 左侧微标签 */}
      <div className={css.gizmoLabel}>
        <span>{label}</span>
      </div>

      {/* 中间核心操作手柄 */}
      <div className={css.gizmoActions}>
        <button
          type="button"
          disabled={isFirst}
          onClick={onMoveUp}
          className={css.gizmoBtn}
          title="上移一个容器"
        >
          <ArrowUp className={css.icon} />
        </button>

        <button
          type="button"
          disabled={isLast}
          onClick={onMoveDown}
          className={css.gizmoBtn}
          title="下移一个容器"
        >
          <ArrowDown className={css.icon} />
        </button>

        <button
          type="button"
          onClick={onInsertAbove}
          className={css.gizmoBtn}
          title="在上方插入新组件"
          style={{ width: 'auto', padding: '0 6px', fontSize: 11 }}
        >
          <Plus size={12} />
          <span style={{ marginLeft: 2 }}>上插</span>
        </button>

        <button
          type="button"
          onClick={onInsertBelow}
          className={css.gizmoBtn}
          title="在下方插入新组件"
          style={{ width: 'auto', padding: '0 6px', fontSize: 11 }}
        >
          <Plus size={12} />
          <span style={{ marginLeft: 2 }}>下插</span>
        </button>

        {/* 调色手柄 */}
        <div
          className={css.paletteWrapper}
          onMouseEnter={() => setShowPalette(true)}
          onMouseLeave={() => setShowPalette(false)}
        >
          <button
            type="button"
            className={css.gizmoBtn}
            title="切换组件主题色"
            onClick={() => setShowPalette(prev => !prev)}
          >
            <Palette className={css.icon} />
          </button>
          {showPalette && (
            <div className={css.palettePopover}>
              {Object.values(WECHAT_THEMES).map(thm => (
                <button
                  key={thm.id}
                  type="button"
                  onClick={() => {
                    onChangeTheme(thm.id)
                    setShowPalette(false)
                  }}
                  className={css.colorDot}
                  style={{ backgroundColor: thm.main }}
                  title={thm.name}
                />
              ))}
            </div>
          )}
        </div>

        {hasImages && (
          <>
            {onRegenerateImage && (
              <button
                type="button"
                onClick={onRegenerateImage}
                className={css.gizmoBtn}
                title="微调提示词并重新生成本卡片正文配图"
                style={{ width: 'auto', padding: '0 6px', fontSize: 11, color: '#059669', fontWeight: 600 }}
              >
                <RefreshCw size={12} />
                <span style={{ marginLeft: 3 }}>重新生图</span>
              </button>
            )}
            {onBatchReplaceImages && (
              <button
                type="button"
                onClick={onBatchReplaceImages}
                className={css.gizmoBtn}
                title="按序批量替换本卡片中的图片"
                style={{ width: 'auto', padding: '0 6px', fontSize: 11 }}
              >
                <Images size={12} />
                <span style={{ marginLeft: 3 }}>换图</span>
              </button>
            )}
          </>
        )}

        <button
          type="button"
          onClick={onDuplicate}
          className={css.gizmoBtn}
          title="复制本容器"
        >
          <Copy className={css.icon} />
        </button>

        <button
          type="button"
          onClick={onDelete}
          className={`${css.gizmoBtn} ${css.gizmoBtnDanger}`}
          title="删除本容器"
        >
          <Trash2 className={css.icon} />
        </button>
      </div>
    </div>
  )
}

