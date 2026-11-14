/**
 * 社媒排版富文本复制与全平台多体裁剪贴板自适应工具
 * 中文注释：统一平台中文名称映射、增强占位符清洗与多平台剪贴板自适应复制
 */
import type { ArticleItem } from '../socialPublisherWorkflowExtractor.js';
export interface ArticleCopyConfig {
    buttonLabel: string;
    toastTip: string;
}
/**
 * 获取规范的社媒平台中文显示名称
 */
export declare function getPlatformDisplayName(platform?: string, platformName?: string): string;
/**
 * 清洗 HTML 为纯净多行文本（保留段落换行与缩进）
 */
export declare function cleanHtmlToPlainText(html: string): string;
/**
 * 清洗通用专栏文本，移除无效空图片语法与占位符
 */
export declare function cleanGenericArticleTextForClipboard(text: string): string;
/**
 * 根据文章所属平台及类型获取专属复制配置（按钮文案与成功提示）
 */
export declare function getArticleCopyConfig(article?: ArticleItem | null): ArticleCopyConfig;
/**
 * 智能自适应全平台剪贴板复制执行函数
 */
export declare function copyArticleToClipboard(article: ArticleItem): Promise<boolean>;
/**
 * 将带样式的 HTML 复制为原生富文本到系统剪贴板，支持直接在微信公众平台后台 Ctrl+V 粘贴
 */
export declare function copyRichHtmlToClipboard(htmlContent: string, plainTextFallback?: string): Promise<boolean>;
/**
 * 复制纯文本至剪贴板
 */
export declare function copyPlainTextToClipboard(text: string): Promise<boolean>;
/**
 * 批量下载或保存图片到本地
 */
export declare function triggerDownloadImage(url: string, filename: string): void;
export declare const copySocialArticleContent: typeof copyArticleToClipboard;
//# sourceMappingURL=socialClipboard.d.ts.map