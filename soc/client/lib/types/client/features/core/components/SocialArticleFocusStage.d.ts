import type { ArticleItem } from '../socialPublisherWorkflowExtractor.js';
export interface SocialArticleFocusStageProps {
    articles: ArticleItem[];
    currentIndex: number;
    currentArticle: ArticleItem;
    modifiedIndices: Set<number>;
    onSelectIndex: (index: number) => void;
    onOpenPreview: (index: number) => void;
}
/**
 * 格式化平台人性化展示名称
 * 拒绝冷冰冰的代码缩写（如 #1 gzh），转换为规范的中文平台名与篇目序号
 */
export declare function getPlatformDisplayName(art: ArticleItem, allArticles: ArticleItem[]): string;
/**
 * 获取文章平台格式化中文名（单篇无序号，彻底杜绝暴露 gzh 等缩写）
 */
export declare function getCleanPlatformLabel(art: ArticleItem): string;
/**
 * 社媒文章当前篇目分段切换与核心展台 (遵循 Level 2 晶透卡片规范，内嵌立体舞台)
 */
export declare function SocialArticleFocusStage({ articles, currentIndex, currentArticle, modifiedIndices, onSelectIndex, onOpenPreview, }: SocialArticleFocusStageProps): import("react").JSX.Element;
//# sourceMappingURL=SocialArticleFocusStage.d.ts.map