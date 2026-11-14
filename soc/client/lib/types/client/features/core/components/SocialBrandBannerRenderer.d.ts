/**
 * 社媒文章品牌头尾图高保真渲染器
 * 100% 对齐 Python 构建端 build_article.py 中的样式规范（宽度比例/自适应、高度、圆角、上下边距、居中、白色卡片与阴影）
 * [中文修复依据]：将品牌图渲染逻辑从 SocialArticlePlatformPreview 中解耦抽离，彻底消除循环依赖并符合单文件架构规范。
 */
export declare function renderBrandBanner(url: string | undefined, spec: any, slot: 'header' | 'footer', onClick?: (url: string) => void): import("react").JSX.Element;
//# sourceMappingURL=SocialBrandBannerRenderer.d.ts.map