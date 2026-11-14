import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { SocialArticleImageCreatingPlaceholder } from './SocialArticleImageCreatingPlaceholder.js';
import { useState, useEffect } from 'react';
import { ImageIcon } from 'lucide-react';
import { cn } from '../../../compat/components/lib/utils.js';
import { cleanAndUnescapeHtmlContent, extractLocalDiskPathFromUrl, } from '../socialPublisherWorkflowExtractor.js';
/**
 * 具有骨架屏加载、异常回退与点击放大支持的防爆图组件
 */
export function SafePreviewImage({ src, alt, className, imageClassName, aspectRatio = 'aspect-auto', onClick, }) {
    const [loaded, setLoaded] = useState(false);
    const [hasError, setHasError] = useState(false);
    useEffect(() => {
        setLoaded(false);
        setHasError(false);
    }, [src]);
    if (!src || hasError) {
        return (_jsxs("div", { className: cn('flex flex-col items-center justify-center bg-surface-hover/50 text-foreground-muted select-none p-4', aspectRatio, className), children: [_jsx(ImageIcon, { className: "size-8 text-foreground-subtle/40 mb-2" }), _jsx("span", { className: "text-ui-2xs font-medium text-foreground-subtle", children: alt || 'AI 配图加载中...' })] }));
    }
    return (_jsxs("div", { className: cn('relative overflow-hidden bg-surface/30', aspectRatio, className), children: [!loaded && (_jsx("div", { className: "absolute inset-0 animate-pulse bg-surface-hover/50 flex items-center justify-center", children: _jsx("span", { className: "size-2 rounded-full bg-border/80 animate-pulse" }) })), _jsx("img", { src: src, alt: alt, onLoad: () => setLoaded(true), onError: () => setHasError(true), onClick: onClick, className: cn('w-full transition-opacity duration-300', aspectRatio === 'aspect-auto' ? 'h-auto max-h-[520px] object-contain mx-auto' : 'h-full object-cover', imageClassName, loaded ? 'opacity-100' : 'opacity-0', onClick ? 'cursor-zoom-in' : '') })] }));
}
/**
 * 解析行内 Markdown 样式（加粗、斜体、行内代码）
 */
export function renderInlineMarkdown(text) {
    if (!text)
        return null;
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
    return parts.map((part, idx) => {
        if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
            return (_jsx("strong", { className: "font-bold text-foreground", children: part.slice(2, -2) }, idx));
        }
        if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
            return (_jsx("em", { className: "italic text-foreground/90", children: part.slice(1, -1) }, idx));
        }
        if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
            return (_jsx("code", { className: "rounded-md bg-surface-active px-1.5 py-0.5 text-ui-2xs font-mono text-primary", children: part.slice(1, -1) }, idx));
        }
        return part;
    });
}
/**
 * 今日头条 / 知乎 / 百家号专栏文章高保真排版渲染器
 * 自动解析 Markdown 标题、高清内嵌插图、引用、列表与行内样式，杜绝占位符与语法标记裸露
 */
export function renderGenericArticleContent(content, resolvedMap, onImageClick, brandTopUrl, brandBotUrl, platform) {
    if (!content)
        return null;
    let sanitized = cleanAndUnescapeHtmlContent(content);
    // 1. 彻底清除无效空图片占位符（如 ![头部品牌图]()、![尾部品牌图]() 或 ![]()）
    sanitized = sanitized.replace(/!\[.*?\]\(\s*\)/g, '');
    // 2. 剥离泄露的代码块配置与尾部配置字典
    sanitized = sanitized
        .replace(/```(?:json)?\s*\{[\s\S]*?"cards"[\s\S]*?\}\s*```/gi, '')
        .replace(/```(?:json)?\s*\[[\s\S]*?"role"[\s\S]*?\]\s*```/gi, '')
        .trim();
    const lines = sanitized.split('\n');
    const nodes = [];
    let hasBrandTop = false;
    let hasBrandBot = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (typeof line !== 'string')
            continue;
        const trimmed = line.trim();
        if (!trimmed) {
            nodes.push(_jsx("div", { className: "h-2" }, `empty-${i}`));
            continue;
        }
        // 品牌头图/尾图占位符映射（无论是否带括号内容，若无对应真实图片则完全隐藏，杜绝占位符裸露）
        if (/^!\[.*?\]\(.*?(?:__?BRAND_TOP__?|brand_top).*?\)$/i.test(trimmed)) {
            hasBrandTop = true;
            if (brandTopUrl) {
                nodes.push(_jsx("div", { className: "my-3 rounded-xl overflow-hidden border border-border/40", children: _jsx(SafePreviewImage, { src: brandTopUrl, alt: "\u54C1\u724C\u5934\u56FE", aspectRatio: "aspect-[21/9]", className: "w-full object-cover" }) }, `brand-top-${i}`));
            }
            continue;
        }
        if (/^!\[.*?\]\(.*?(?:__?BRAND_BOT__?|brand_bot).*?\)$/i.test(trimmed)) {
            hasBrandBot = true;
            if (brandBotUrl) {
                nodes.push(_jsx("div", { className: "my-3 rounded-xl overflow-hidden border border-border/40", children: _jsx(SafePreviewImage, { src: brandBotUrl, alt: "\u54C1\u724C\u5C3E\u56FE", aspectRatio: "aspect-[21/9]", className: "w-full object-cover" }) }, `brand-bot-${i}`));
            }
            continue;
        }
        // 内嵌插图（消除裸露的 ![alt](src) 并渲染为高保真图片卡片）
        const imgMatch = trimmed.match(/^!\[(.*?)\]\((.*?)\)$/);
        if (imgMatch && imgMatch[2]) {
            const alt = imgMatch[1] || '';
            const rawTarget = imgMatch[2].trim();
            if (!rawTarget)
                continue;
            const urlMatch = rawTarget.match(/^(\S+)(?:\s+["'](.*)["'])?$/);
            const src = urlMatch ? urlMatch[1] : rawTarget;
            if (!src)
                continue;
            const diskPath = extractLocalDiskPathFromUrl(src);
            const fileName = src.replace(/^.*[\\/]/, '');
            let resolvedSrc = resolvedMap.get(src) || resolvedMap.get(diskPath) || resolvedMap.get(fileName);
            if (!resolvedSrc) {
                for (const [k, v] of resolvedMap.entries()) {
                    if ((fileName && k.endsWith(fileName)) || (diskPath && k.includes(diskPath))) {
                        resolvedSrc = v;
                        break;
                    }
                }
            }
            // 【中文修复依据】：反查占位符（如 IMG_A1_2, IMG_1_2）对应的物理文件名 content_1_2.png，确保落盘即可自愈呈现
            if (!resolvedSrc) {
                const pMatch = src.match(/(?:IMG_A?(\d+)_(\d+)|IMG_(\d+)_(\d+)|CONTENT_(\d+)_(\d+)|IMG_(\d+))/i);
                if (pMatch) {
                    const aIdx = pMatch[1] || pMatch[3] || pMatch[5] || '';
                    const sIdx = pMatch[2] || pMatch[4] || pMatch[6] || pMatch[7] || '1';
                    for (const [k, v] of resolvedMap.entries()) {
                        if ((aIdx && (k.endsWith(`content_${aIdx}_${sIdx}.png`) || k.endsWith(`pic_${aIdx}_${sIdx}.png`))) ||
                            k.endsWith(`content_${sIdx}.png`) ||
                            k.endsWith(`pic_${sIdx}.png`)) {
                            resolvedSrc = v;
                            break;
                        }
                    }
                }
            }
            // 【中文修复依据】：未完成生图且非合法直接协议时保持 undefined，渲染优雅占位态，避免相对路径触发 404 破图
            const isDirectProtocol = src.startsWith('http://') ||
                src.startsWith('https://') ||
                src.startsWith('data:') ||
                src.startsWith('wincode-media://');
            const finalImg = resolvedSrc || (isDirectProtocol ? src : undefined);
            if (!finalImg) {
                nodes.push(_jsx(SocialArticleImageCreatingPlaceholder, { platform: "inline-body", caption: alt ? `▲ ${alt}` : undefined }, `fig-placeholder-${i}`));
                continue;
            }
            nodes.push(_jsxs("figure", { className: "my-4 rounded-2xl overflow-hidden border border-border/60 bg-surface/30 shadow-xs", children: [_jsx(SafePreviewImage, { src: finalImg, alt: alt || '专栏插图', aspectRatio: "aspect-auto", className: "w-full bg-surface/20", onClick: () => finalImg && onImageClick?.(finalImg) }), alt && (_jsxs("figcaption", { className: "px-3 py-1.5 text-center text-ui-2xs text-foreground-subtle bg-surface/50 border-t border-border/30 font-medium select-none", children: ["\u25B2 ", alt] }))] }, `fig-${i}`));
            continue;
        }
        // 一级标题
        if (trimmed.startsWith('# ')) {
            const h1Text = trimmed.replace(/^#\s+/, '');
            nodes.push(_jsx("div", { className: "pt-4 pb-1 border-b border-border/40", children: _jsx("h2", { className: "text-ui-lg font-bold text-foreground tracking-tight", children: renderInlineMarkdown(h1Text) }) }, `h1-${i}`));
            continue;
        }
        // 二级标题（将 ## 01 ... 渲染为带色条的大标题）
        if (trimmed.startsWith('## ')) {
            const h2Text = trimmed.replace(/^##\s+/, '');
            const isToutiao = platform === 'toutiao';
            nodes.push(_jsx("div", { className: "pt-4 pb-1", children: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: cn('w-1.5 h-4.5 rounded-full shrink-0', isToutiao ? 'bg-red-600 dark:bg-red-500' : 'bg-primary') }), _jsx("h2", { className: "text-ui-base sm:text-ui-lg font-bold text-foreground tracking-tight", children: renderInlineMarkdown(h2Text) })] }) }, `h2-${i}`));
            continue;
        }
        // 三级标题
        if (trimmed.startsWith('### ')) {
            const h3Text = trimmed.replace(/^###\s+/, '');
            nodes.push(_jsx("h3", { className: "text-ui-sm sm:text-ui-base font-semibold text-foreground/95 pt-2 pb-0.5", children: renderInlineMarkdown(h3Text) }, `h3-${i}`));
            continue;
        }
        // 四级标题
        if (trimmed.startsWith('#### ')) {
            const h4Text = trimmed.replace(/^####\s+/, '');
            nodes.push(_jsx("h4", { className: "text-ui-xs font-bold text-foreground/85 pt-1.5 pb-0.5", children: renderInlineMarkdown(h4Text) }, `h4-${i}`));
            continue;
        }
        // 引用块
        if (trimmed.startsWith('>')) {
            const quoteText = trimmed.replace(/^>\s*/, '');
            nodes.push(_jsx("blockquote", { className: "my-2 border-l-3 border-primary/60 bg-primary/5 rounded-r-lg px-3 py-2 text-ui-xs text-foreground-subtle leading-relaxed", children: renderInlineMarkdown(quoteText) }, `bq-${i}`));
            continue;
        }
        // 列表项
        const listMatch = trimmed.match(/^([-*]|\d+\.)\s+(.+)$/);
        if (listMatch && listMatch[2]) {
            nodes.push(_jsxs("div", { className: "flex items-start gap-2 text-ui-sm text-foreground/90 leading-relaxed pl-1 py-0.5", children: [_jsx("span", { className: "size-1.5 rounded-full bg-foreground-subtle/70 mt-2 shrink-0" }), _jsx("div", { className: "flex-1", children: renderInlineMarkdown(listMatch[2]) })] }, `li-${i}`));
            continue;
        }
        // 普通正文段落
        nodes.push(_jsx("p", { className: "text-ui-sm text-foreground/90 leading-relaxed min-h-[1.25rem]", children: renderInlineMarkdown(line) }, `p-${i}`));
    }
    // 若正文未显式包含品牌图 Markdown 语法，自动在外层两端结构化包裹渲染首尾品牌图卡片
    const finalNodes = [...nodes];
    if (brandTopUrl && !hasBrandTop) {
        finalNodes.unshift(_jsx("div", { className: "mb-4 rounded-xl overflow-hidden border border-border/40 shadow-2xs", children: _jsx(SafePreviewImage, { src: brandTopUrl, alt: "\u54C1\u724C\u5934\u56FE", aspectRatio: "aspect-[21/9]", className: "w-full object-cover cursor-zoom-in", onClick: () => onImageClick?.(brandTopUrl) }) }, "auto-brand-top"));
    }
    if (brandBotUrl && !hasBrandBot) {
        finalNodes.push(_jsx("div", { className: "mt-6 pt-4 border-t border-border/30 rounded-xl overflow-hidden shadow-2xs text-center", children: _jsx(SafePreviewImage, { src: brandBotUrl, alt: "\u54C1\u724C\u5C3E\u56FE", aspectRatio: "aspect-[21/9]", className: "w-full object-cover cursor-zoom-in mx-auto", onClick: () => onImageClick?.(brandBotUrl) }) }, "auto-brand-bot"));
    }
    return _jsx("div", { className: "space-y-2.5", children: finalNodes });
}
//# sourceMappingURL=SocialArticleGenericRenderer.js.map