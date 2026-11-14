import React, { useState, useRef, useEffect } from 'react'
import {
  X,
  UploadCloud,
  ArrowUp,
  ArrowDown,
  Trash2,
  Images,
  ArrowRight,
  Info,
  Check,
} from 'lucide-react'
import css from './WechatBatchImageReplaceModal.module.css'

export interface BatchImageItem {
  id: string
  name: string
  url: string
  file?: File
}

interface WechatBatchImageReplaceModalProps {
  isOpen: boolean
  onClose: () => void
  originalImageUrls: string[]
  nodeLabel?: string
  onConfirmReplace: (orderedUrls: string[]) => void
}

export function WechatBatchImageReplaceModal({
  isOpen,
  onClose,
  originalImageUrls,
  nodeLabel = '图文卡片',
  onConfirmReplace,
}: WechatBatchImageReplaceModalProps) {
  const [selectedImages, setSelectedImages] = useState<BatchImageItem[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (isOpen) {
      setSelectedImages([])
      setIsDragging(false)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleFiles = (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (fileArray.length === 0) return

    const newItems: BatchImageItem[] = []
    let loadedCount = 0

    fileArray.forEach((file, index) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const url = e.target?.result as string
        if (url) {
          newItems[index] = {
            id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${index}`,
            name: file.name,
            url,
            file,
          }
        }
        loadedCount++
        if (loadedCount === fileArray.length) {
          const orderedClean = newItems.filter(Boolean)
          setSelectedImages(prev => [...prev, ...orderedClean])
        }
      }
      reader.readAsDataURL(file)
    })
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files)
      e.target.value = ''
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files)
    }
  }

  const handleMoveUp = (index: number) => {
    if (index === 0) return
    setSelectedImages((prev) => {
      const updated = [...prev]
      const temp = updated[index - 1]!
      updated[index - 1] = updated[index]!
      updated[index] = temp
      return updated
    })
  }

  const handleMoveDown = (index: number) => {
    if (index === selectedImages.length - 1) return
    setSelectedImages((prev) => {
      const updated = [...prev]
      const temp = updated[index + 1]!
      updated[index + 1] = updated[index]!
      updated[index] = temp
      return updated
    })
  }

  const handleRemove = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index))
  }

  const handleConfirm = () => {
    if (selectedImages.length === 0) return
    const orderedUrls = selectedImages.map(item => item.url)
    onConfirmReplace(orderedUrls)
    onClose()
  }

  return (
    <div className={css.backdrop} onClick={onClose}>
      <div className={css.modalContainer} onClick={e => e.stopPropagation()}>
        {/* 顶部标题栏 */}
        <div className={css.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'rgba(16, 185, 129, 0.12)',
              color: '#059669',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Images size={16} />
            </div>
            <div>
              <h3 className={css.headerTitle}>
                批量替换卡片图片
              </h3>
              <p className={css.headerSubtitle}>
                当前组件：{nodeLabel} · 原有 {originalImageUrls.length} 个图片槽位
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={css.closeBtn}
            aria-label="关闭窗口"
          >
            <X size={16} />
          </button>
        </div>

        {/* 主体操作区 */}
        <div className={css.bodyArea}>
          {/* 上传与拖拽投递区 */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`${css.dropZone} ${isDragging ? css.dropZoneHover : ''}`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileInputChange}
              multiple
              accept="image/*"
              style={{ display: 'none' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'rgba(0,0,0,0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#6b7280'
              }}>
                <UploadCloud size={20} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-label-primary, #111827)' }}>
                点击选择多张图片，或直接拖拽图片至此处
              </div>
              <p style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary, #9ca3af)', margin: 0 }}>
                系统将严格按您勾选/放入的顺序依次替换到图文卡片中（支持 JPG / PNG / WebP）
              </p>
            </div>
          </div>

          {/* 顺序映射可视化列表 */}
          {selectedImages.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--dsw-alias-label-primary, #111827)',
                padding: '0 4px'
              }}>
                <span>替换映射预览（支持点击箭头微调顺序）</span>
                <span style={{ color: 'var(--dsw-alias-label-tertiary, #9ca3af)', fontWeight: 400 }}>
                  已选 {selectedImages.length} 张图片
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selectedImages.map((item, idx) => {
                  const targetSlot = originalImageUrls[idx]
                  return (
                    <div
                      key={item.id}
                      className={css.imageItem}
                    >
                      <span style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: '#10b981',
                        width: 22,
                        textAlign: 'center'
                      }}>
                        #{idx + 1}
                      </span>
                      <img
                        src={item.url}
                        alt={item.name}
                        className={css.thumbImg}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 12,
                          fontWeight: 500,
                          color: 'var(--dsw-alias-label-primary, #111827)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {item.name}
                        </div>
                        {targetSlot ? (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 10,
                            color: '#10b981',
                            marginTop: 2
                          }}>
                            <Check size={11} />
                            <span>映射原卡片图 #{idx + 1}</span>
                          </div>
                        ) : (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 10,
                            color: '#d97706',
                            marginTop: 2
                          }}>
                            <ArrowRight size={11} />
                            <span>超额新增至卡片末尾</span>
                          </div>
                        )}
                      </div>

                      {/* 顺序微调手柄 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveUp(idx)}
                          className={css.iconBtn}
                          title="上移"
                        >
                          <ArrowUp size={12} />
                        </button>
                        <button
                          type="button"
                          disabled={idx === selectedImages.length - 1}
                          onClick={() => handleMoveDown(idx)}
                          className={css.iconBtn}
                          title="下移"
                        >
                          <ArrowDown size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemove(idx)}
                          className={css.iconBtn}
                          style={{ color: '#ef4444' }}
                          title="移除"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              borderRadius: 8,
              background: 'rgba(14, 165, 233, 0.08)',
              border: '1px solid rgba(14, 165, 233, 0.15)',
              fontSize: 11,
              color: '#0284c7'
            }}>
              <Info size={14} style={{ flexShrink: 0 }} />
              <span>尚未选择替换图片。您可以一次性选中多张图片，系统将严格按您的选择顺序原位映射。</span>
            </div>
          )}
        </div>

        {/* 底部按钮栏 */}
        <div className={css.footer}>
          <div style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary, #9ca3af)' }}>
            原图共 {originalImageUrls.length} 张 · 拟替换 {selectedImages.length} 张
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                border: '1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.12))',
                background: 'var(--dsw-alias-bg-base, #ffffff)',
                color: 'var(--dsw-alias-label-primary, #111827)',
                cursor: 'pointer',
                fontSize: 12
              }}
            >
              取消
            </button>
            <button
              type="button"
              disabled={selectedImages.length === 0}
              onClick={handleConfirm}
              className={css.confirmBtn}
            >
              确认按序替换 ({selectedImages.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
