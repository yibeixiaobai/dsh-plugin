import type { ArticleItem } from '../socialPublisherWorkflowExtractor.js';
export interface SocialArticleCollapsibleCardProps {
    articles: ArticleItem[];
    workspacePath?: string;
    workspaceIdentity?: string;
    sessionId?: string;
    imageProgress?: {
        current: number;
        total: number;
        percentage: number;
        currentArticleIndex: number;
        isGenerating: boolean;
    };
    isContentFullyProduced?: boolean;
}
/**
 * 社媒文章发布决策总控卡片 (遵循 Level 2 晶透卡片规范与 No AI Slop 原则)
 * 主视口呈现三层式秩序感设计：Header 概览与侧栏入口、Body 篇目切换与聚焦展台、Footer 统一发布控制台
 */
export declare function SocialArticleCollapsibleCard({ articles, workspacePath, workspaceIdentity, sessionId, imageProgress, isContentFullyProduced: _isContentFullyProduced, }: SocialArticleCollapsibleCardProps): import("react").JSX.Element;
//# sourceMappingURL=SocialArticleCollapsibleCard.d.ts.map