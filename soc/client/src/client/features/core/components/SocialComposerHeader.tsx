import { memo } from 'react'
import { isBrandGeoEnabled } from '../../../compat/types.js'
import { Share2, Compass, X, ShieldAlert, ShieldCheck } from 'lucide-react'
import css from '../SocialPublisherComposerCard.module.css'

export interface SocialComposerHeaderProps {
  isDryRun: boolean
  selectedPlatformsCount: number
  onClose?: () => void
}

export const SocialComposerHeader = memo(function SocialComposerHeader({
  isDryRun,
  selectedPlatformsCount,
  onClose,
}: SocialComposerHeaderProps) {
  return (
    <div className={css.header}>
      <div className={css.headerLeft}>
        <div className={css.headerIcon}>
          <Share2 size={14} />
        </div>
        <span className={css.headerTitle}>社媒多平台矩阵发布</span>
        <span className={css.badgeStudio}>矩阵工作台</span>
        {isBrandGeoEnabled() && (
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('wincode:switch-to-geo-card'))
            }}
            className={css.geoButton}
            title="切换至品牌 GEO 收录检测"
          >
            <Compass size={12} />
            <span>GEO检测</span>
          </button>
        )}
      </div>

      <div className={css.headerRight}>
        <div
          data-testid="composer-dry-run-indicator"
          className={`${css.dryRunPill} ${isDryRun ? css.dryRunAmber : css.dryRunEmerald}`}
          title={
            isDryRun
              ? '当前为演练模式（免额度推演）。运行模式受全局设置管控，如需切换实盘请前往「设置 - 社媒发布 - 运行环境」修改。'
              : '当前为实盘模式（真实生产发布）。运行模式受全局设置管控，如需切换演练请前往「设置 - 社媒发布 - 运行环境」修改。'
          }
        >
          {isDryRun ? (
            <ShieldAlert size={12} style={{ flexShrink: 0 }} />
          ) : (
            <ShieldCheck size={12} style={{ flexShrink: 0 }} />
          )}
          <span>{isDryRun ? '演练模式 (免额度)' : '实盘模式 (已就绪)'}</span>
        </div>
        <span className={css.platformCountLabel}>
          已选 <strong>{selectedPlatformsCount}</strong> 平台
        </span>
        {onClose ? (
          <button
            type="button"
            className={css.closeBtn}
            onClick={onClose}
            title="退出专属卡片"
            aria-label="关闭"
          >
            <X size={14} />
          </button>
        ) : null}
      </div>
    </div>
  )
})
