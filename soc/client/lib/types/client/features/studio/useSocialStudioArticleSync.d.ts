import type { ArticleItem, ExtractedSocialWorkflow } from "../core/socialPublisherWorkflowExtractor.js";
export interface UseSocialStudioArticleSyncOptions {
    workflow: ExtractedSocialWorkflow;
    workspacePath: string;
    currentIndex: number;
    localArticles: ArticleItem[];
    setLocalArticles: React.Dispatch<React.SetStateAction<ArticleItem[]>>;
    triggerAutoSave: (contentToSave: string, targetKey?: string) => void;
    currentArticle: ArticleItem | null;
    draftMapRef?: React.MutableRefObject<Map<string, Partial<ArticleItem>>>;
}
/**
 * 社媒文章 Studio 画布就地编辑与沙箱物理同步 Hook (所见即所得核心闭环)
 */
export declare function useSocialStudioArticleSync({ workflow, workspacePath, currentIndex, localArticles: _localArticles, setLocalArticles, triggerAutoSave, currentArticle, draftMapRef, }: UseSocialStudioArticleSyncOptions): {
    currentSignedHash: string;
    physicalSaveStatus: "error" | "idle" | "saving" | "synced";
    isResigning: boolean;
    handleResignManifest: () => Promise<void>;
    handleTitleChange: (newTitle: string) => void;
    handleDigestChange: (newDigest: string) => void;
    handleContentChange: (newContent: string) => void;
};
//# sourceMappingURL=useSocialStudioArticleSync.d.ts.map