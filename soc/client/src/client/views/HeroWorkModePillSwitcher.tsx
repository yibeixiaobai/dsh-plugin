import { memo, useCallback } from 'react'
import { Sparkles, Share2 } from 'lucide-react'
import { useAppWorkMode, setAppWorkMode } from '../compat/store/workModeStore.js'
import css from './HeroWorkModePillSwitcher.module.css'

export interface HeroWorkModePillSwitcherProps {
  className?: string
}

/**
 * 新会话中央模式胶囊药丸切换器 (HeroWorkModePillSwitcher)
 * 1:1 对标用户参考设计图1：
 * 位于中央标语正下方、卡片/输入框上方，提供圆角药丸分段选择：
 * - 通用任务：常规对话状态，支持通用自由交互与常规开发
 * - 社媒发布：社媒矩阵专属模式，展开多平台矩阵工作台大卡片
 */
export const HeroWorkModePillSwitcher = memo(function HeroWorkModePillSwitcher({
  className,
}: HeroWorkModePillSwitcherProps) {
  const currentMode = useAppWorkMode()
  const isSocial = currentMode === 'social'

  const handleSelectGeneral = useCallback(() => {
    setAppWorkMode('general')
  }, [])

  const handleSelectSocial = useCallback(() => {
    setAppWorkMode('social')
  }, [])

  return (
    <div
      className={className ? `${css.pillContainer} ${className}` : css.pillContainer}
      role="tablist"
      aria-label="工作模式切换"
    >
      <button
        type="button"
        role="tab"
        aria-selected={!isSocial}
        className={`${css.pillItem} ${!isSocial ? css.active : ''}`}
        onClick={handleSelectGeneral}
      >
        <Sparkles size={14} className={css.pillIcon} />
        <span>通用任务</span>
      </button>

      <button
        type="button"
        role="tab"
        aria-selected={isSocial}
        className={`${css.pillItem} ${isSocial ? css.active : ''}`}
        onClick={handleSelectSocial}
      >
        <Share2 size={14} className={css.pillIcon} />
        <span>社媒发布</span>
      </button>
    </div>
  )
})
