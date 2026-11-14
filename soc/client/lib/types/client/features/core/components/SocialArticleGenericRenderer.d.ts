import { type ReactNode } from 'react';
/**
 * 具有骨架屏加载、异常回退与点击放大支持的防爆图组件
 */
export declare function SafePreviewImage({ src, alt, className, imageClassName, aspectRatio, onClick, }: {
    src?: string;
    alt: string;
    className?: string;
    imageClassName?: string;
    aspectRatio?: string;
    onClick?: () => void;
}): import("react").JSX.Element;
/**
 * 解析行内 Markdown 样式（加粗、斜体、行内代码）
 */
export declare function renderInlineMarkdown(text: string): ReactNode;
/**
 * 今日头条 / 知乎 / 百家号专栏文章高保真排版渲染器
 * 自动解析 Markdown 标题、高清内嵌插图、引用、列表与行内样式，杜绝占位符与语法标记裸露
 */
export declare function renderGenericArticleContent(content: string, resolvedMap: Map<string, string>, onImageClick?: (url: string) => void, brandTopUrl?: string, brandBotUrl?: string, platform?: string): ReactNode;
//# sourceMappingURL=SocialArticleGenericRenderer.d.ts.map