/**
 * 微信排版多图与图文卡片按序替换核心工具
 * 保证严格遵循微信排版单行零换行、行内样式规范，并精准保持用户选图顺序
 */
export interface ReplaceImageOptions {
    appendIfMore?: boolean;
}
/**
 * 提取 HTML 片段中所有 <img> 的图片地址数组，按在 DOM 中出现的先后顺序返回
 */
export declare function extractImagesFromHtml(html: string): string[];
/**
 * 按照传入的图片 URL 数组严格按顺序依次替换 HTML 中的各个 <img> 标签
 * 顺序映射关系：
 * newImageUrls[0] -> 槽位 1
 * newImageUrls[1] -> 槽位 2
 * newImageUrls[2] -> 槽位 3 ...
 *
 * 当 newImageUrls.length > 原有槽位数且 options.appendIfMore 为 true 时，智能追加新槽位
 * 输出严格遵循微信单行零换行规范
 */
export declare function replaceImagesInHtmlByOrder(rawHtml: string, newImageUrls: string[], options?: ReplaceImageOptions): string;
//# sourceMappingURL=wechatImageReplacer.d.ts.map