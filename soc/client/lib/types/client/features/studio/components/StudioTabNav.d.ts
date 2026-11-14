import { type ArticleItem } from "../../core/socialPublisherWorkflowExtractor.js";
export interface StudioTabNavProps {
    articles: ArticleItem[];
    currentIndex: number;
    showOverview: boolean;
    hasGzh: boolean;
    onSelectIndex: (idx: number) => void;
    onSelectOverview: () => void;
    imageProgress?: {
        current: number;
        total: number;
        percentage: number;
        currentArticleIndex: number;
        isGenerating: boolean;
    };
}
/**
 * 顶部篇目分段胶囊导航
 */
export declare function StudioTabNav({ articles, currentIndex, showOverview, hasGzh, onSelectIndex, onSelectOverview, imageProgress, }: StudioTabNavProps): import("react").JSX.Element;
//# sourceMappingURL=StudioTabNav.d.ts.map