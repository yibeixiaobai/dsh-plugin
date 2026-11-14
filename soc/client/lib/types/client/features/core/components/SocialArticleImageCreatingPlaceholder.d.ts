export type ImagePlaceholderPlatform = 'xiaohongshu' | 'wechat-newspic' | 'wechat-news' | 'inline-body' | 'generic';
export interface SocialArticleImageCreatingPlaceholderProps {
    platform: ImagePlaceholderPlatform;
    isSecondary?: boolean;
    articleIndex?: number;
    caption?: string;
    aspectRatio?: string;
    className?: string;
}
/**
 * 各平台专属配图装载微光动效占位组件
 * 【中文修复依据】：彻底剔除 Sparkles、旋转星芒与所有 Emoji（🎨、✨等），改为高质感出版物极简灰阶骨架屏
 */
export declare function SocialArticleImageCreatingPlaceholder({ platform, isSecondary, articleIndex, className, }: SocialArticleImageCreatingPlaceholderProps): import("react").JSX.Element;
//# sourceMappingURL=SocialArticleImageCreatingPlaceholder.d.ts.map