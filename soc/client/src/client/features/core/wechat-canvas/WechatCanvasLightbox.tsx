import { X } from 'lucide-react'
import css from './WechatCanvasLightbox.module.css'

interface WechatCanvasLightboxProps {
  url: string | null
  onClose: () => void
}

export function WechatCanvasLightbox({ url, onClose }: WechatCanvasLightboxProps) {
  if (!url) return null

  return (
    <div className={css.backdrop} onClick={onClose}>
      <button
        type="button"
        className={css.closeButton}
        onClick={onClose}
        aria-label="关闭预览"
      >
        <X size={20} />
      </button>
      <img
        src={url}
        alt="大图全屏预览"
        className={css.image}
      />
    </div>
  )
}

