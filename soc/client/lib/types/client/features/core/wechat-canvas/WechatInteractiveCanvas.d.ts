import type { ArticleItem } from "../socialPublisherWorkflowExtractor.js";
export interface WechatInteractiveCanvasProps {
    article: ArticleItem;
    scriptsDir?: string;
    workspacePath?: string;
    workspaceIdentity?: string;
    brandTopUrl?: string;
    brandBotUrl?: string;
    brandTopSpec?: any;
    brandBotSpec?: any;
    resolvedCoverUrl?: string;
    onContentChange?: (newContent: string) => void;
    onTitleChange?: (newTitle: string) => void;
    onDigestChange?: (newDigest: string) => void;
}
export declare function WechatInteractiveCanvas({ article, scriptsDir, workspacePath, brandTopUrl, brandBotUrl, brandTopSpec, brandBotSpec, resolvedCoverUrl, onContentChange, onTitleChange, }: WechatInteractiveCanvasProps): import("react").JSX.Element;
//# sourceMappingURL=WechatInteractiveCanvas.d.ts.map