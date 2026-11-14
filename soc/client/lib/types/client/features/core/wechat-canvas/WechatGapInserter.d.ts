import type { ReactNode } from "react";
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
export declare function WechatGapInserter({ onInsertBlank, onPickTemplate, isActiveAnchor, onCancelAnchor, }: WechatGapInserterProps): ReactNode;
//# sourceMappingURL=WechatGapInserter.d.ts.map