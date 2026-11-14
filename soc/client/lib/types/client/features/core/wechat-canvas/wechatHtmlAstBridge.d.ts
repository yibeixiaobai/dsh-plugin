import type { WechatSectionNode } from "./wechatCanvasTypes.js";
/**
 * 健壮的顶层标签切分器（支持 DOMParser 与嵌套栈回退）
 * 确保像 <section><p>...</p></section> 这样的嵌套卡片作为单一完整 Section 处理
 */
/**
 * 【中文修复依据】：检测 HTML 块是否为无实质正文内容的幽灵空白卡片/空节点
 * 彻底过滤掉单纯包含双引号、装饰标点、首尾空白或空 span 的无文字幽灵卡片，避免污染画纸
 */
export declare function isGhostEmptyNodeHtml(rawHtml: string): boolean;
export declare function parseHtmlToWechatNodes(html: string): WechatSectionNode[];
/**
 * 将结构化 Section 节点列表编译为符合微信排版规范的单行零换行 HTML
 */
export declare function compileWechatNodesToHtml(nodes: WechatSectionNode[], _themeKey?: string): string;
/**
 * 快捷替换节点中的颜色变量（用于一键换肤/调色盘）
 */
export declare function applyThemeToNodeHtml(rawHtml: string, targetThemeKey: string): string;
export { extractImagesFromHtml, replaceImagesInHtmlByOrder } from "./wechatImageReplacer.js";
//# sourceMappingURL=wechatHtmlAstBridge.d.ts.map