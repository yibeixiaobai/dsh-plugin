import type { ExtractedSocialWorkflow } from "../core/socialPublisherWorkflowExtractor.js";
export interface SocialStudioLayoutProps {
    workflow: ExtractedSocialWorkflow;
    workspacePath: string;
    workspaceIdentity?: string;
    sessionId?: string;
}
/**
 * 社媒发布任务中央主视口画布容器 (Social Studio Layout)
 *
 * 【中文架构规范】：
 * 1. 中央主视口 100% 满宽呈现无限画布与多平台文章排版，不再在主视口内部硬切出 40% 的独立对话区域；
 * 2. 右侧伴随对话流全面借用系统原侧边面板（AnimatedSidePanePanel 中的 social-chat Tab）承载；
 * 3. 支持用户随时折叠侧面板享受 100% 沉浸式编辑审校。
 */
export declare const SocialStudioLayout: import("react").MemoExoticComponent<({ workflow, workspacePath, workspaceIdentity, sessionId, }: SocialStudioLayoutProps) => import("react").JSX.Element>;
//# sourceMappingURL=SocialStudioLayout.d.ts.map