import React from "react";
import type { ArticleItem } from "../../core/socialPublisherWorkflowExtractor.js";
interface XhsInteractiveCanvasProps {
    article: ArticleItem;
    workspacePath?: string;
    workspaceIdentity?: string;
    sessionId?: string;
    taskId?: string;
    onUpdateArticle?: (updated: ArticleItem) => void;
}
export declare function XhsInteractiveCanvas({ article, workspacePath, workspaceIdentity, sessionId, taskId: _taskId, onUpdateArticle, }: XhsInteractiveCanvasProps): React.JSX.Element;
export {};
//# sourceMappingURL=XhsInteractiveCanvas.d.ts.map