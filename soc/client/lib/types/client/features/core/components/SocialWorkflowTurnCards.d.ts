import type { ConversationRow } from '../../../compat/types.js';
export interface SocialWorkflowTurnCardsProps {
    rows: readonly ConversationRow[];
    isLastTurn?: boolean;
    workspacePath: string;
    workspaceIdentity?: string;
    sessionId?: string;
    isSubagent?: boolean;
}
/**
 * 社媒对话流轮次卡片调度器：
 * 【中文规范】：
 * 1. 中央已由 SocialStudioCanvas 画布常驻承载完整图文排版、就地编辑与发布总控交互；
 * 2. 对话流侧彻底移除冗余卡片（包含图 1 的回执卡片彻底销毁，保持对话流清爽）；
 * 3. 对话流仅保留纯净自然语言交互。
 */
export declare function SocialWorkflowTurnCards(_props: SocialWorkflowTurnCardsProps): any;
//# sourceMappingURL=SocialWorkflowTurnCards.d.ts.map