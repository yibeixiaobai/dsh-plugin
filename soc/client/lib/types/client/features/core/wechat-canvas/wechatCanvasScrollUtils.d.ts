import type { WechatSectionNode } from "./wechatCanvasTypes.js";
/**
 * 创建标准的微信空白正文文字段落容器
 */
export declare function createBlankParagraphNode(): WechatSectionNode;
/**
 * 平滑滚动画布视口至目标节点中心，并在需要时聚焦打字光标
 */
export declare function scrollToCanvasNode(nodeId: string, focusText?: boolean): void;
//# sourceMappingURL=wechatCanvasScrollUtils.d.ts.map