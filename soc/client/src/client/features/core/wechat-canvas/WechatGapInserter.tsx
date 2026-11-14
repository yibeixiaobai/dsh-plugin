import { Plus, Sparkles, X, MapPin } from "lucide-react";
import type { ReactNode } from "react";
import css from "./WechatGapInserter.module.css";

export interface WechatGapInserterProps {
  /** 点击立即就地插入空白正文段落 */
  readonly onInsertBlank: () => void;
  /** 点击激活当前缝隙锚点并唤起左侧排版素材库 */
  readonly onPickTemplate: () => void;
  /** 当前缝隙是否处于插入锚点激活态 */
  readonly isActiveAnchor?: boolean;
  /** 取消当前缝隙的激活锚点 */
  readonly onCancelAnchor?: () => void;
}

/**
 * 微信公众号专业排版画布 - 缝隙插入触发器
 * 支持两路分流：直接就地插入空白正文段落，或激活发丝级位置锚点并在左侧展开版式素材库
 */
export function WechatGapInserter({
  onInsertBlank,
  onPickTemplate,
  isActiveAnchor = false,
  onCancelAnchor,
}: WechatGapInserterProps): ReactNode {
  if (isActiveAnchor) {
    return (
      <div className={`${css.gapRoot} ${css.gapRootActive}`}>
        <div className={css.activeAnchorContainer}>
          <div className={css.anchorLine} />
          <div className={css.anchorBadge}>
            <MapPin className={css.anchorPinIcon} />
            <span className={css.anchorLabel}>正在向此位置插入组件 (已联动左侧素材库)</span>
            {onCancelAnchor && (
              <button
                type="button"
                className={css.cancelAnchorBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  onCancelAnchor();
                }}
                title="取消此插入位置锚点"
              >
                <X className={css.cancelIcon} />
                <span>取消</span>
              </button>
            )}
          </div>
          <div className={css.anchorLine} />
        </div>
      </div>
    );
  }

  return (
    <div className={css.gapRoot}>
      <div className={css.hoverTrigger}>
        <div className={css.gapLine} />
        <div className={css.actionsGroup}>
          <button
            type="button"
            className={`${css.actionButton} ${css.blankBtn}`}
            onClick={(e) => {
              e.stopPropagation();
              onInsertBlank();
            }}
            title="在此处直接插入空白正文段落，打字更快捷"
          >
            <Plus className={css.plusIcon} />
            <span>空白段落</span>
          </button>

          <button
            type="button"
            className={`${css.actionButton} ${css.templateBtn}`}
            onClick={(e) => {
              e.stopPropagation();
              onPickTemplate();
            }}
            title="为此位置设定锚点并唤起左侧排版素材库"
          >
            <Sparkles className={css.sparkleIcon} />
            <span>挑选素材</span>
          </button>
        </div>
        <div className={css.gapLine} />
      </div>
    </div>
  );
}
