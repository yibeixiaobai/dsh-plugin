import type { ArticleItem } from '../socialPublisherWorkflowExtractor.js';
export interface GenericInteractiveCanvasProps {
    article: ArticleItem;
    workspacePath?: string;
    workspaceIdentity?: string;
    sessionId?: string;
    scriptsDir?: string;
    resolvedCoverUrl?: string;
    resolvedMap?: Map<string, string>;
    brandTopUrl?: string;
    brandBotUrl?: string;
    brandTopSpec?: any;
    brandBotSpec?: any;
    onTitleChange?: (newTitle: string) => void;
    onContentChange?: (newContent: string) => void;
}
/**
 * 通用专栏长图文高保真交互画纸 (知乎 / 今日头条 / 百家号)
 * 【中文修复依据】：完全对齐微信公众号画纸设计，直接在原文上就地修改，彻底杜绝 textarea 切换与新开独立编辑器页面！
 * 顶部专享封面展位，正文仅呈现正文插图与章节排版，彻底消除封面重复混入正文缺陷。
 */
export declare function GenericInteractiveCanvas({ article, workspacePath, sessionId: _sessionId, scriptsDir, resolvedCoverUrl, resolvedMap, brandTopUrl, brandBotUrl, brandTopSpec, brandBotSpec, onTitleChange, onContentChange, }: GenericInteractiveCanvasProps): import("react").JSX.Element;
//# sourceMappingURL=GenericInteractiveCanvas.d.ts.map