import type { ArticleItem } from '../socialPublisherWorkflowExtractor.js';
import { isArticleContentPending } from '../socialPublisherWorkflowExtractor.js';
export type VisualSlotBlueprint = NonNullable<ArticleItem['visualSlots']>[number];
export interface GalleryCardSlot {
    slotIndex: number;
    url?: string;
    isReady: boolean;
    slotTitle: string;
    aspectRatio: string;
    kind: 'cover' | 'pic';
    targetFileName: string;
    matchedSlot?: VisualSlotBlueprint;
}
export interface SocialArticlePlatformPreviewProps {
    article: ArticleItem;
    allImages?: string[];
    workspacePath?: string;
    workspaceIdentity?: string;
    sessionId?: string;
    taskId?: string;
    editable?: boolean;
    onTitleChange?: (newTitle: string) => void;
    onDigestChange?: (newDigest: string) => void;
    onContentChange?: (newContent: string) => void;
    onImageChanged?: (slotIndex: number, newImageUrl: string) => void;
    onAddCard?: () => void;
    onDeleteCard?: (slotIndex: number) => void;
    onArticleChange?: (updatedArticle: ArticleItem) => void;
}
/**
 * 判断文章正文是否尚在排版构建/落盘生成阶段
 * 【中文修复依据】：当文章尚未物理落盘生成完毕时，严禁渲染含有内部模型审核警告（如“检测到标题使用前缀开头”）的粗糙黑框，
 * 统一呈现优雅灵动的“✍️ 文章正在快马加鞭赶来的路上...”微光等待状态。
 */
export { isArticleContentPending };
export { renderBrandBanner } from './SocialBrandBannerRenderer.js';
export declare function SocialArticlePlatformPreview({ article, allImages: _allImages, workspacePath, workspaceIdentity, sessionId, taskId: _taskId, editable: _editableProp, onTitleChange, onDigestChange, onContentChange, onImageChanged, onAddCard, onDeleteCard, onArticleChange: _onArticleChange, }: SocialArticlePlatformPreviewProps): import("react").JSX.Element;
//# sourceMappingURL=SocialArticlePlatformPreview.d.ts.map