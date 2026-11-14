import type { ArticleItem } from '../socialPublisherWorkflowExtractor.js';
export interface SocialArticleBottomActionBarProps {
    currentArticle: ArticleItem | null;
    currentIndex: number;
    totalArticlesCount: number;
    primeTimeSuggestions: Array<{
        label: string;
        timeVal: string;
    }>;
    copied: boolean;
    copyConfig: {
        buttonLabel: string;
        toastTip: string;
    };
    saveStatus?: 'idle' | 'saving' | 'saved';
    onOpenTypography?: () => void;
    onCopyContent: () => void;
    onPublishCurrentOnly: (action: 'draft' | 'schedule' | 'publish_now', scheduleTime?: string) => void;
    onConfirmPublishAll: (action: 'draft' | 'schedule' | 'publish_now', scheduleTime?: string) => void;
    onResignManifest?: () => void;
    isResigning?: boolean;
    showPublishActions?: boolean;
}
/**
 * 社媒文章统一发布控制坞 (Unified Publisher Dock)
 * 【中文重构依据】：
 * 1. 彻底摒弃粗糙平铺与廉价虚线框，重塑为左侧工具岛、右侧决策岛的清晰双岛布局；
 * 2. 主按钮告别冗长笨重的单行文字，采用【核心动作 + 半透明篇目徽标 + 微反光内阴影】的高级出版质感；
 * 3. 增强按钮点击触觉缩放反馈 (active:scale-[0.982])，提供极致人性化与现代设计感。
 */
export declare function SocialArticleBottomActionBar({ currentArticle, currentIndex: _currentIndex, totalArticlesCount, primeTimeSuggestions, copied, copyConfig, saveStatus, onOpenTypography, onCopyContent, onPublishCurrentOnly, onConfirmPublishAll, onResignManifest, isResigning, showPublishActions, }: SocialArticleBottomActionBarProps): import("react").JSX.Element;
//# sourceMappingURL=SocialArticleBottomActionBar.d.ts.map