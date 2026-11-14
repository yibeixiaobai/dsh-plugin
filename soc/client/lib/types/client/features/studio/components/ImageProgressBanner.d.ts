import type { ExtractedSocialWorkflow } from "../../core/socialPublisherWorkflowExtractor.js";
export interface ImageProgressBannerProps {
    imageProgress: NonNullable<ExtractedSocialWorkflow["imageProgress"]>;
}
/**
 * 配图生成进度指示槽
 * 【中文修复依据】：彻底移除 Sparkles 与旋转星芒动效，改为出版软件专业低噪的线性微进度槽
 */
export declare function ImageProgressBanner({ imageProgress }: ImageProgressBannerProps): import("react").JSX.Element;
//# sourceMappingURL=ImageProgressBanner.d.ts.map