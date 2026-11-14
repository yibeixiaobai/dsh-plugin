import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Command, Check, Edit3 } from 'lucide-react';
import { cn } from '../../../compat/components/lib/utils.js';
import { extractLocalDiskPathFromUrl } from '../socialPublisherWorkflowExtractor.js';
import { getPlatformDisplayName } from '../utils/socialClipboard.js';
import { SafePreviewImage } from '../components/SocialArticleGenericRenderer.js';
import { SocialArticleImageCreatingPlaceholder } from '../components/SocialArticleImageCreatingPlaceholder.js';
import { SocialImageActionOverlay } from '../components/SocialImageActionOverlay.js';
import { renderBrandBanner } from '../components/SocialBrandBannerRenderer.js';
import { parseMarkdownToGenericBlocks, compileGenericBlocksToMarkdown, } from './genericMarkdownBridge.js';
import { GenericEditableBlock } from './GenericEditableBlock.js';
import { resolveGenericPlatformMeta } from './genericCanvasPlatformMeta.js';
/**
 * 通用专栏长图文高保真交互画纸 (知乎 / 今日头条 / 百家号)
 * 【中文修复依据】：完全对齐微信公众号画纸设计，直接在原文上就地修改，彻底杜绝 textarea 切换与新开独立编辑器页面！
 * 顶部专享封面展位，正文仅呈现正文插图与章节排版，彻底消除封面重复混入正文缺陷。
 */
export function GenericInteractiveCanvas({ article, workspacePath, sessionId: _sessionId, scriptsDir, resolvedCoverUrl, resolvedMap, brandTopUrl, brandBotUrl, brandTopSpec, brandBotSpec, onTitleChange, onContentChange, }) {
    const [selectedBlockId, setSelectedBlockId] = useState(null);
    const [lightboxUrl, setLightboxUrl] = useState(null);
    const [justSaved, setJustSaved] = useState(false);
    const platformMeta = useMemo(() => resolveGenericPlatformMeta(article.platform), [article.platform]);
    // 将文章正文拆解为结构化 Blocks
    const [blocks, setBlocks] = useState(() => parseMarkdownToGenericBlocks(article.content || ''));
    const lastSyncContentRef = useRef(article.content);
    useEffect(() => {
        if (article.content && article.content !== lastSyncContentRef.current) {
            lastSyncContentRef.current = article.content;
            setBlocks(parseMarkdownToGenericBlocks(article.content));
        }
    }, [article.content]);
    // 防抖回写：当用户在任意段落打字时，防抖重新编译为 Markdown 并写回
    const debounceTimerRef = useRef(null);
    const handleBlockChange = useCallback((blockId, newText) => {
        setBlocks((prev) => {
            const next = prev.map(b => (b.id === blockId ? { ...b, text: newText } : b));
            const compiled = compileGenericBlocksToMarkdown(next);
            lastSyncContentRef.current = compiled;
            if (debounceTimerRef.current)
                clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = setTimeout(() => {
                onContentChange?.(compiled);
                setJustSaved(true);
                setTimeout(() => setJustSaved(false), 1500);
            }, 200);
            return next;
        });
    }, [onContentChange]);
    useEffect(() => {
        return () => {
            if (debounceTimerRef.current)
                clearTimeout(debounceTimerRef.current);
        };
    }, []);
    const hasTopInBlocks = useMemo(() => blocks.some(b => b.type === 'brand_top'), [blocks]);
    const hasBotInBlocks = useMemo(() => blocks.some(b => b.type === 'brand_bot'), [blocks]);
    const resolveImageSource = useCallback((src) => {
        if (!src)
            return undefined;
        const isDirectProtocol = src.startsWith('http://') ||
            src.startsWith('https://') ||
            src.startsWith('data:') ||
            src.startsWith('wincode-media://');
        if (!resolvedMap)
            return isDirectProtocol ? src : undefined;
        const diskPath = extractLocalDiskPathFromUrl(src);
        const fileName = src.replace(/^.*[\\/]/, '');
        let resolved = resolvedMap.get(src) || resolvedMap.get(diskPath) || resolvedMap.get(fileName);
        if (!resolved) {
            for (const [k, v] of resolvedMap.entries()) {
                if ((fileName && k.endsWith(fileName)) || (diskPath && k.includes(diskPath))) {
                    resolved = v;
                    break;
                }
            }
        }
        if (!resolved) {
            const pMatch = src.match(/(?:IMG_A?(\d+)_(\d+)|IMG_(\d+)_(\d+)|CONTENT_(\d+)_(\d+)|IMG_(\d+)|CONTENT_(\d+))/i);
            if (pMatch) {
                const artIdxStr = pMatch[1] || pMatch[3] || pMatch[5];
                const sIdx = pMatch[2] || pMatch[4] || pMatch[6] || pMatch[7] || pMatch[8] || '1';
                // 【中文修复依据】：若正文占位符未显式声明篇号（如 IMG_1），严格锁定当前文章的篇序号 article.index，绝不借用第 1 篇的插图！
                const currentArtIdx = article.index || 1;
                const targetArtIdx = artIdxStr ? Number.parseInt(artIdxStr, 10) : currentArtIdx;
                for (const [k, v] of resolvedMap.entries()) {
                    if (k.endsWith(`content_${targetArtIdx}_${sIdx}.png`) ||
                        k.endsWith(`content_${targetArtIdx}_${sIdx}.jpg`) ||
                        k.endsWith(`pic_${targetArtIdx}_${sIdx}.png`) ||
                        k.endsWith(`pic_${targetArtIdx}_${sIdx}.jpg`) ||
                        (targetArtIdx === 1 && (k.endsWith(`content_${sIdx}.png`) || k.endsWith(`pic_${sIdx}.png`)))) {
                        resolved = v;
                        break;
                    }
                }
            }
        }
        return resolved || (isDirectProtocol ? src : undefined);
    }, [resolvedMap, article.index]);
    return (_jsxs("div", { className: "mx-auto max-w-[720px] rounded-3xl border border-border/80 bg-card shadow-sm p-6 sm:p-10 space-y-6 pb-12 transition-all select-text", onClick: () => setSelectedBlockId(null), children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-3.5 text-ui-xs text-foreground-muted select-none", children: [_jsxs("div", { className: "flex items-center gap-2.5", children: [_jsx("span", { className: cn('px-2 py-0.5 rounded-md font-semibold text-ui-xs border', platformMeta.badgeClass), children: platformMeta.badge }), _jsxs("div", { children: [_jsxs("div", { className: "font-bold text-foreground flex items-center gap-1.5", children: [_jsx("span", { children: getPlatformDisplayName(article.platform, article.platformName) }), _jsxs("span", { className: "font-normal text-foreground-subtle", children: ["@", article.accountName || article.accountId] })] }), _jsx("div", { className: "text-[11px] text-foreground-subtle", children: platformMeta.subtitle })] })] }), _jsxs("div", { className: "flex items-center gap-2.5 font-mono text-[11px]", children: [justSaved && (_jsxs("span", { className: "inline-flex items-center gap-1 text-emerald-600 font-bold animate-in fade-in", children: [_jsx(Check, { className: "size-3" }), _jsx("span", { children: "\u5DF2\u5C31\u5730\u5B9E\u65F6\u540C\u6B65" })] })), _jsxs("span", { className: "text-foreground-subtle bg-surface px-2 py-0.5 rounded-full border border-border/40", children: [blocks.length, " \u4E2A\u6392\u7248\u6BB5\u843D"] })] })] }), _jsxs("div", { className: "space-y-1.5 group/title relative", children: [_jsx("input", { type: "text", value: article.title || '', onChange: e => onTitleChange?.(e.target.value), placeholder: "\u8BF7\u8F93\u5165\u4E13\u680F\u6587\u7AE0\u6807\u9898...", className: "w-full text-ui-xl sm:text-[22px] font-bold text-foreground bg-transparent border-0 border-b border-transparent hover:border-border/60 focus:border-primary focus:outline-hidden py-1 transition-colors leading-snug" }), _jsxs("div", { className: "flex items-center justify-between text-[11px] text-foreground-subtle select-none", children: [_jsxs("span", { className: "flex items-center gap-1", children: [_jsx(Edit3, { className: "size-3 text-primary/70" }), _jsx("span", { children: "\u6240\u89C1\u5373\u6240\u5F97\uFF1A\u76F4\u63A5\u5728\u539F\u6587\u6BB5\u843D\u6253\u5B57\u4FEE\u6539\uFF0C\u4FEE\u6539\u5373\u523B\u81EA\u52A8\u4FDD\u5B58" })] }), _jsx("span", { className: "font-mono text-foreground-subtle/80", children: "#1 \u7BC7\u76EE" })] })] }), resolvedCoverUrl ? (_jsxs("div", { className: cn(platformMeta.aspectRatio, 'w-full rounded-2xl overflow-hidden border border-border/50 relative group select-none shadow-xs'), children: [_jsx(SafePreviewImage, { src: resolvedCoverUrl, alt: "\u4E13\u680F\u5C01\u9762", aspectRatio: platformMeta.aspectRatio, onClick: () => setLightboxUrl(resolvedCoverUrl) }), _jsxs("div", { className: "absolute bottom-2.5 right-3 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-xs select-none", children: ["#", article.index || 1, " ", platformMeta.label, " ", platformMeta.ratioLabel, " \u5927\u56FE\u5C01\u9762"] }), _jsx(SocialImageActionOverlay, { slotTitle: `专栏封面 (#${article.index || 1})`, kind: "cover", articleIndex: article.index || 1, currentImageUrl: resolvedCoverUrl, scriptsDir: scriptsDir, targetFileName: `cover_${article.index || 1}.png`, accountId: article.accountId, platform: article.platform, workspacePath: workspacePath, onZoom: () => setLightboxUrl(resolvedCoverUrl) })] })) : (_jsx(SocialArticleImageCreatingPlaceholder, { platform: "generic" })), brandTopUrl && !hasTopInBlocks && (_jsx("div", { className: "pt-2 pb-1", children: renderBrandBanner(brandTopUrl, brandTopSpec, 'header', url => setLightboxUrl(url)) })), _jsx("div", { className: "space-y-3 pt-2", children: blocks.map((block) => {
                    if (block.type === 'brand_top') {
                        return (_jsx("div", { className: "py-2", children: renderBrandBanner(brandTopUrl, brandTopSpec, 'header', url => setLightboxUrl(url)) }, block.id));
                    }
                    if (block.type === 'brand_bot') {
                        return (_jsx("div", { className: "py-3", children: renderBrandBanner(brandBotUrl, brandBotSpec, 'footer', url => setLightboxUrl(url)) }, block.id));
                    }
                    if (block.type === 'img') {
                        const finalSrc = resolveImageSource(block.src);
                        // 【中文修复依据】：严禁在正文区域渲染封面！顶部已独立展示
                        const isCoverImage = (resolvedCoverUrl && finalSrc === resolvedCoverUrl) ||
                            /(?:cover_\d+|cover\.|IMG_COVER|COVER_IMG)/i.test(block.src || '') ||
                            (block.alt && block.alt.includes('封面'));
                        if (isCoverImage) {
                            return null;
                        }
                        if (!finalSrc) {
                            return (_jsx(SocialArticleImageCreatingPlaceholder, { platform: "inline-body", caption: block.alt ? `▲ ${block.alt}` : undefined }, block.id));
                        }
                        return (_jsxs("figure", { className: "my-5 rounded-2xl overflow-hidden border border-border/60 bg-surface/30 shadow-xs relative group select-none", children: [_jsx(SafePreviewImage, { src: finalSrc, alt: block.alt || '专栏插图', aspectRatio: "aspect-auto", className: "w-full bg-surface/20", onClick: () => setLightboxUrl(finalSrc) }), _jsx(SocialImageActionOverlay, { slotTitle: block.alt || '专栏插图', kind: "pic", articleIndex: article.index || 1, currentImageUrl: finalSrc, scriptsDir: scriptsDir, accountId: article.accountId, platform: article.platform, workspacePath: workspacePath, onZoom: () => setLightboxUrl(finalSrc) }), block.alt && (_jsxs("figcaption", { className: "px-3 py-1.5 text-center text-ui-2xs text-foreground-subtle bg-surface/50 border-t border-border/30 font-medium", children: ["\u25B2 ", block.alt] }))] }, block.id));
                    }
                    return (_jsx(GenericEditableBlock, { block: block, platform: article.platform, isSelected: selectedBlockId === block.id, onSelect: () => setSelectedBlockId(block.id), onContentChange: handleBlockChange }, block.id));
                }) }), brandBotUrl && !hasBotInBlocks && (_jsx("div", { className: "pt-4 pb-2 border-t border-border/30", children: renderBrandBanner(brandBotUrl, brandBotSpec, 'footer', url => setLightboxUrl(url)) })), _jsxs("div", { className: "pt-6 border-t border-border/30 text-center text-ui-2xs text-foreground-subtle select-none flex flex-wrap items-center justify-center gap-2 font-mono", children: [_jsxs("div", { className: "flex items-center gap-1 text-foreground-muted", children: [_jsx(Command, { className: "size-3 text-foreground-subtle" }), _jsx("span", { children: "\u6240\u89C1\u5373\u6240\u5F97" })] }), ['点击直接打字修改', 'Ctrl+S 立即保存', '修改实时同步'].map(tip => (_jsx("span", { className: "px-1.5 py-0.2 rounded text-[11px] text-foreground-subtle bg-surface-hover/50 border border-border/30", children: tip }, tip)))] }), lightboxUrl && (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in", onClick: () => setLightboxUrl(null), children: _jsx("img", { src: lightboxUrl, alt: "\u9AD8\u6E05\u653E\u5927", className: "max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl" }) }))] }));
}
//# sourceMappingURL=GenericInteractiveCanvas.js.map