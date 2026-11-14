import { memo } from 'react'
import { Check } from 'lucide-react'
import {
  PLATFORMS,
  type SocialPlatformKey,
} from '../utils/socialPlatformsMeta.js'
import css from '../SocialPublisherComposerCard.module.css'

export interface SocialPlatformGridPickerProps {
  selectedPlatforms: SocialPlatformKey[]
  onTogglePlatform: (key: SocialPlatformKey) => void
}

export const SocialPlatformGridPicker = memo(function SocialPlatformGridPicker({
  selectedPlatforms,
  onTogglePlatform,
}: SocialPlatformGridPickerProps) {
  return (
    <div className={css.platformGrid}>
      {PLATFORMS.map((platform) => {
        const isSelected = selectedPlatforms.includes(platform.key)
        return (
          <button
            key={platform.key}
            type="button"
            onClick={() => onTogglePlatform(platform.key)}
            title={platform.label}
            className={`${css.platformBtn} ${isSelected ? css.platformBtnActive : ''}`}
          >
            <span>{platform.shortLabel}</span>
            {isSelected ? <Check size={12} strokeWidth={2.5} style={{ flexShrink: 0 }} /> : null}
          </button>
        )
      })}
    </div>
  )
})
