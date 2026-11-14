import type { ExtractedSocialWorkflow } from "../core/socialPublisherWorkflowExtractor.js";
export interface SocialStudioCanvasProps {
    workflow: ExtractedSocialWorkflow;
    workspacePath: string;
    workspaceIdentity?: string;
    sessionId?: string;
}
/**
 * 社媒发布任务可视化执行画布 (Social Studio Canvas)
 * 【中文修复依据】：依循极简出版画纸（Editorial Studio Paper）规范，彻底消除双层嵌套底栏与 AI 俗套装饰，提供单层清晰高集成度交互
 */
export declare const SocialStudioCanvas: import("react").MemoExoticComponent<({ workflow, workspacePath, workspaceIdentity, sessionId, }: SocialStudioCanvasProps) => import("react").JSX.Element>;
//# sourceMappingURL=SocialStudioCanvas.d.ts.map