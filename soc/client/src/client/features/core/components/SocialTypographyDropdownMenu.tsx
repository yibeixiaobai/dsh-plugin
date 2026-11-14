import { useEffect, useRef, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import {
  SUB_CATEGORIES_BY_MAIN,
  WECHAT_THEMES,
} from '../wechat-canvas/wechatCanvasTypes.js'
import css from './SocialTypographyDropdownMenu.module.css'

export interface SocialTypographyDropdownMenuProps {
  readonly mode: 'subCategory' | 'themePicker'
  readonly activeMainCategory: string
  readonly activeSubCategory: string
  readonly activeThemeKey?: string
  readonly onSelectSubCategory: (sub: string) => void
  readonly onSelectTheme?: (themeKey: string) => void
  readonly onClose: () => void
}

/**
 * Dropdown menu for typography subcategories and canvas theme palette.
 *
 * @param props - Dropdown menu mode, selected state and selection callbacks.
 * @returns Popover menu element or null when inactive.
 */
export function SocialTypographyDropdownMenu({
  mode,
  activeMainCategory,
  activeSubCategory,
  activeThemeKey = 'wenying',
  onSelectSubCategory,
  onSelectTheme,
  onClose,
}: SocialTypographyDropdownMenuProps): ReactNode {
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose])

  // Subcategory picker mode
  if (mode === 'subCategory') {
    const subCategories = SUB_CATEGORIES_BY_MAIN[activeMainCategory] || []
    if (subCategories.length === 0) return null

    return (
      <div ref={containerRef} className={css.subCategoryMenu}>
        <div className={css.menuList}>
          {subCategories.map((sub) => {
            const isAll = sub.startsWith('全部')
            const isSelected = activeSubCategory === sub || (isAll && activeSubCategory === 'all')
            return (
              <button
                key={sub}
                type="button"
                onClick={() => {
                  onSelectSubCategory(isAll ? 'all' : sub)
                  onClose()
                }}
                className={`${css.menuItem} ${isSelected ? css.menuItemActive : ''}`}
              >
                <span>{sub}</span>
                {isSelected && <Check className={css.checkIcon} />}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // Theme palette picker mode
  if (mode === 'themePicker') {
    const themeEntries = Object.entries(WECHAT_THEMES)
    return (
      <div ref={containerRef} className={css.themePickerMenu}>
        <div className={css.menuHeader}>
          画纸主题配色
        </div>
        <div className={css.menuList}>
          {themeEntries.map(([key, item]) => {
            const isSelected = activeThemeKey === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  onSelectTheme?.(key)
                  onClose()
                }}
                className={`${css.menuItem} ${isSelected ? css.menuItemActive : ''}`}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    className={css.themeColorDot}
                    style={{ backgroundColor: item.main }}
                  />
                  <span>{item.name}</span>
                </div>
                {isSelected && <Check className={css.checkIcon} />}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return null
}
