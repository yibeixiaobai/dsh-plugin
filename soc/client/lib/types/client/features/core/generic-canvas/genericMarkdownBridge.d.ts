import type { GenericSectionBlock } from './genericCanvasTypes.js';
/**
 * 清理并反转义 Markdown 内容，防止外部 JSON 字符串包裹或残渣干扰
 */
export declare function cleanMarkdownContent(raw: string): string;
/**
 * 将长图文专栏的 Markdown 内容拆分为结构化排版块 (Blocks)
 * 供原地所见即所得画纸逐段独立渲染与直接打字编辑
 */
export declare function parseMarkdownToGenericBlocks(content: string): GenericSectionBlock[];
/**
 * 将排版块 (Blocks) 重新编译组合为规范的标准 Markdown
 * 实现用户原地打字修改后实时无缝同步回文章数据源与持久化沙箱
 */
export declare function compileGenericBlocksToMarkdown(blocks: GenericSectionBlock[]): string;
//# sourceMappingURL=genericMarkdownBridge.d.ts.map