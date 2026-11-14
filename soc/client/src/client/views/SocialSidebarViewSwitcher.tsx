import { memo, useEffect, type ReactNode } from 'react'
import { Folder, Layers } from 'lucide-react'
import css from './SocialSidebarViewSwitcher.module.css'

export type SocialSidebarView = 'projects' | 'typography'

export interface SocialSidebarViewSwitcherProps {
  /** Current app work mode, e.g. 'general' or 'social'. */
  readonly appWorkMode: string
  /** Active sub-view in social mode: 'projects' for sessions/tasks, 'typography' for WeChat templates. */
  readonly currentView: SocialSidebarView
  /** Callback invoked when the user selects a sub-view. */
  readonly onViewChange: (view: SocialSidebarView) => void
}

/**
 * Social sidebar sub-view switcher component.
 * Provides seamless two-way switching between "项目任务" (session task list)
 * and "微信排版" (typography template library) in social media mode.
 *
 * @param props - Component props containing mode, current view and change handler.
 * @returns Segmented control element or null when not in social mode.
 */
export const SocialSidebarViewSwitcher = memo(function SocialSidebarViewSwitcher({
  appWorkMode,
  currentView,
  onViewChange,
}: SocialSidebarViewSwitcherProps): ReactNode {
  // Listen for canvas or external triggers asking to open the typography panel
  useEffect(() => {
    const handleOpenTypography = (): void => {
      onViewChange('typography')
    }
    window.addEventListener('wincode:social-open-typography', handleOpenTypography)
    window.addEventListener('dsh:social-open-typography', handleOpenTypography)
    return () => {
      window.removeEventListener('wincode:social-open-typography', handleOpenTypography)
      window.removeEventListener('dsh:social-open-typography', handleOpenTypography)
    }
  }, [onViewChange])

  if (appWorkMode !== 'social') {
    return null
  }

  return (
    <div className={css.switcherRoot} role="tablist" aria-label="社媒侧边栏视图切换">
      <div className={css.segmentedBox}>
        <button
          type="button"
          role="tab"
          aria-selected={currentView === 'projects'}
          onClick={() => onViewChange('projects')}
          className={`${css.segmentBtn} ${currentView === 'projects' ? css.segmentBtnActive : ''}`}
          title="切换至社媒发布任务与会话列表"
        >
          <Folder className={css.icon} />
          <span>项目任务</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={currentView === 'typography'}
          onClick={() => onViewChange('typography')}
          className={`${css.segmentBtn} ${currentView === 'typography' ? css.segmentBtnActive : ''}`}
          title="切换至微信排版版式组件库"
        >
          <Layers className={css.icon} />
          <span>微信排版</span>
        </button>
      </div>
    </div>
  )
})
