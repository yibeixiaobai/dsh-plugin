import { jsx as _jsx } from "react/jsx-runtime";
/**
 * 社媒文章品牌头尾图高保真渲染器
 * 100% 对齐 Python 构建端 build_article.py 中的样式规范（宽度比例/自适应、高度、圆角、上下边距、居中、白色卡片与阴影）
 * [中文修复依据]：将品牌图渲染逻辑从 SocialArticlePlatformPreview 中解耦抽离，彻底消除循环依赖并符合单文件架构规范。
 */
export function renderBrandBanner(url, spec, slot, onClick) {
    if (!url)
        return null;
    const isEnabled = spec?.enabled ?? true;
    if (!isEnabled)
        return null;
    const adaptive = !spec?.width || Number(spec.width) <= 0;
    const widthVal = Number(spec?.width) || 100;
    const widthStyle = adaptive ? 'auto' : `${widthVal}%`;
    const maxWidthStyle = adaptive ? '100%' : `${widthVal}%`;
    const heightStyle = spec?.height && Number(spec.height) > 0 ? `${spec.height}px` : 'auto';
    const radiusStyle = `${spec?.radius ?? 0}px`;
    const objectFit = spec?.fit || 'contain';
    const objectPosition = spec?.position || 'center';
    const marginTop = `${spec?.margin_top ?? (slot === 'footer' ? 20 : 0)}px`;
    const marginBottom = `${spec?.margin_bottom ?? (slot === 'header' ? 16 : 0)}px`;
    const bannerAlt = slot === 'header' ? '文章头部品牌图' : '文章尾部品牌图';
    if (spec?.frame) {
        return (_jsx("div", { style: { textAlign: 'center', margin: `${marginTop} auto ${marginBottom}`, padding: 0 }, children: _jsx("div", { style: {
                    display: 'inline-block',
                    boxSizing: 'border-box',
                    width: widthStyle,
                    maxWidth: maxWidthStyle,
                    background: '#FFFFFF',
                    border: '1px solid #E5E7EB',
                    borderRadius: `${(spec?.radius ?? 0) + 6}px`,
                    padding: '6px',
                    boxShadow: '0 4px 12px -2px rgba(0,0,0,0.06)',
                }, children: _jsx("img", { src: url, alt: bannerAlt, style: {
                        width: '100%',
                        height: heightStyle,
                        objectFit,
                        objectPosition,
                        display: 'block',
                        margin: '0 auto',
                        borderRadius: radiusStyle,
                        cursor: 'zoom-in',
                    }, onClick: () => onClick?.(url) }) }) }));
    }
    return (_jsx("div", { style: { textAlign: 'center', margin: `${marginTop} auto ${marginBottom}`, padding: 0 }, children: _jsx("img", { src: url, alt: bannerAlt, style: {
                width: widthStyle,
                maxWidth: maxWidthStyle,
                height: heightStyle,
                objectFit,
                objectPosition,
                display: 'block',
                margin: '0 auto',
                borderRadius: radiusStyle,
                cursor: 'zoom-in',
            }, onClick: () => onClick?.(url) }) }));
}
//# sourceMappingURL=SocialBrandBannerRenderer.js.map