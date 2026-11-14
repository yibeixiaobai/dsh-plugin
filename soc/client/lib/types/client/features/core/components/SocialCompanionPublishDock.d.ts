import type { ExtractedSocialWorkflow } from '../socialPublisherWorkflowExtractor.js';
export interface SocialCompanionPublishDockProps {
    workflow: ExtractedSocialWorkflow;
    workspacePath: string;
    workspaceIdentity?: string;
    sessionId?: string;
}
/**
 * 社媒发布伴随式快捷指令行动条 (Social Companion Quick Action Chips)
 * 【中文优化依据】：
 * 1. 严格响应用户要求，绝不重复展示左侧画布底栏已有的“复制文案”与“去排版”工具；
 * 2. 专注右侧伴随对话栏的发布终局决策，严格在输入框正上方一行显示（Single Row）；
 * 3. 采用标准快捷指令按钮设计：仅发当前篇、定时排期、推送到草稿箱，高度 28px，杜绝换行堆叠。
 */
export declare const SocialCompanionPublishDock: import("react").MemoExoticComponent<({ workflow, workspacePath, workspaceIdentity, sessionId, }: SocialCompanionPublishDockProps) => import("react").JSX.Element>;
//# sourceMappingURL=SocialCompanionPublishDock.d.ts.map