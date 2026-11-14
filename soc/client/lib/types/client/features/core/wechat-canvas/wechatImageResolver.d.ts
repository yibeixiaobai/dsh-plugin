/**
 * 微信公众号排版正文图片与品牌头尾图解析引擎
 * 负责将 HTML 中的 __BRAND_TOP__、__BRAND_BOT__、IMG_A*_* 以及本地文件名占位符
 * 映射为安全可渲染的 DataURL / HTTP URL，未就绪插图自愈输出独立安全占位图
 */
/** 构造正文插槽未就绪时的专属安全占位图 */
export declare function createSlotPlaceholderDataUrl(label: string): string;
export interface ResolveWechatImagesOptions {
    inlineImages?: string[];
    resolvedMap?: Map<string, string>;
    brandTopUrl?: string;
    brandBotUrl?: string;
    brandTopSpec?: any;
    brandBotSpec?: any;
    artIndex?: number;
}
export interface ResolveWechatImagesResult {
    html: string;
    hasTopInHtml: boolean;
    hasBotInHtml: boolean;
}
export declare function resolveWechatImagesInHtml(rawHtml: string, options: ResolveWechatImagesOptions): ResolveWechatImagesResult;
//# sourceMappingURL=wechatImageResolver.d.ts.map