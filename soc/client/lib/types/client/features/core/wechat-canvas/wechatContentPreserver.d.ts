import type { WechatSectionNode } from "./wechatCanvasTypes.js";
/**
 * 微信公众号专业排版 - 内容保持无损替换器
 * 【核心职责】：当用户用新模板替换旧节点时，保留用户原有的标题文字、段落与图片，
 * 将新模板的默认占位符替换为用户真实内容，实现真正的“一键换皮、内容不丢”！
 */
export declare function preserveNodeContent(oldNode: WechatSectionNode, newNode: WechatSectionNode): WechatSectionNode;
//# sourceMappingURL=wechatContentPreserver.d.ts.map