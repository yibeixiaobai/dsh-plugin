import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { FileText, ChevronLeft, ChevronRight, Smartphone, BookOpen, } from 'lucide-react';
import { Button } from '../../../compat/components/ui/button.js';
import { cn } from '../../../compat/components/lib/utils.js';
import { getPlatformDisplayName as getStandardPlatformDisplayName } from '../utils/socialClipboard.js';
import { getPlatformCapability } from '../utils/socialPlatformsMeta.js';
/**
 * 格式化平台人性化展示名称
 * 拒绝冷冰冰的代码缩写（如 #1 gzh），转换为规范的中文平台名与篇目序号
 */
export function getPlatformDisplayName(art, allArticles) {
    const isNewspic = art.articleType === 'newspic';
    if (isNewspic) {
        const sameAccountNewspics = allArticles.filter(a => a.articleType === 'newspic' && (a.accountId || '') === (art.accountId || ''));
        if (sameAccountNewspics.length > 1) {
            const nIdx = sameAccountNewspics.findIndex(a => a.id === art.id) + 1;
            return `微信小绿书 ${nIdx > 0 ? nIdx : 1}`;
        }
        return '微信小绿书';
    }
    if (art.platform === 'gzh') {
        const sameAccountNews = allArticles.filter(a => a.platform === 'gzh' && a.articleType !== 'newspic' && (a.accountId || '') === (art.accountId || ''));
        if (sameAccountNews.length > 1) {
            const slot = typeof art.index === 'number' && art.index > 0 ? art.index : sameAccountNews.findIndex(a => a.id === art.id) + 1;
            return `公众号长文 #${slot}`;
        }
        return allArticles.length > 1 ? '公众号长文' : (art.platformName || '微信公众号');
    }
    if (art.platform === 'xiaohongshu') {
        const sameXhs = allArticles.filter(a => a.platform === 'xiaohongshu');
        if (sameXhs.length > 1) {
            const xIdx = sameXhs.findIndex(a => a === art) + 1;
            return `小红书笔记 #${xIdx}`;
        }
        return '小红书笔记';
    }
    if (art.platform === 'toutiao') {
        const sameToutiao = allArticles.filter(a => a.platform === 'toutiao');
        if (sameToutiao.length > 1) {
            const tIdx = sameToutiao.findIndex(a => a === art) + 1;
            return `今日头条 #${tIdx}`;
        }
        return '今日头条';
    }
    if (art.platform === 'zhihu') {
        const sameZhihu = allArticles.filter(a => a.platform === 'zhihu');
        if (sameZhihu.length > 1) {
            const zIdx = sameZhihu.findIndex(a => a === art) + 1;
            return `知乎文章 #${zIdx}`;
        }
        return '知乎文章';
    }
    const samePlatformArts = allArticles.filter(a => a.platform === art.platform);
    const baseName = art.platformName ||
        (art.platform === 'baijiahao'
            ? '百家号'
            : '社媒图文');
    if (samePlatformArts.length > 1) {
        const subIdx = samePlatformArts.findIndex(a => a === art) + 1;
        return `${baseName} #${subIdx}`;
    }
    return baseName;
}
/**
 * 获取文章平台格式化中文名（单篇无序号，彻底杜绝暴露 gzh 等缩写）
 */
export function getCleanPlatformLabel(art) {
    if (art.articleType === 'newspic')
        return '微信小绿书';
    return getStandardPlatformDisplayName(art.platform, art.platformName);
}
/**
 * 社媒文章当前篇目分段切换与核心展台 (遵循 Level 2 晶透卡片规范，内嵌立体舞台)
 */
export function SocialArticleFocusStage({ articles, currentIndex, currentArticle, modifiedIndices, onSelectIndex, onOpenPreview, }) {
    const capability = getPlatformCapability(currentArticle.platform, currentArticle.articleType);
    const rawText = (currentArticle.content || '').replace(/<[^>]+>/g, '').trim();
    const words = rawText.length;
    const images = currentArticle.images?.length || (currentArticle.coverUrl ? 1 : 0);
    const platformLabel = getCleanPlatformLabel(currentArticle);
    const xhsTagCount = currentArticle.platform === 'xiaohongshu'
        ? ((currentArticle.content || '').match(/#[^#\s]+/g) || []).length
        : 0;
    return (_jsxs("div", { className: "p-3.5 flex flex-col gap-2.5", children: [articles.length > 1 && (_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx("div", { className: "flex items-center gap-1 overflow-x-auto py-0.5 no-scrollbar max-w-[70%]", children: articles.map((art, idx) => {
                            const isCur = currentIndex === idx;
                            const isMod = modifiedIndices.has(idx);
                            const isNewspic = art.articleType === 'newspic';
                            const isXhs = art.platform === 'xiaohongshu';
                            const isGzhNews = art.platform === 'gzh' && !isNewspic;
                            const displayName = getPlatformDisplayName(art, articles);
                            return (_jsxs("button", { type: "button", onClick: () => onSelectIndex(idx), className: cn('flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-ui-xs font-medium transition-all shrink-0 cursor-pointer border', isCur
                                    ? 'bg-background text-foreground shadow-2xs border-border/80 font-bold'
                                    : 'bg-surface/30 hover:bg-surface/70 text-foreground-muted border-transparent hover:border-border/40'), children: [isNewspic && _jsx(Smartphone, { className: "size-3 text-emerald-600 dark:text-emerald-400" }), isXhs && !isNewspic && _jsx(Smartphone, { className: "size-3 text-rose-500/80" }), isGzhNews && _jsx(FileText, { className: "size-3 text-emerald-600/80 dark:text-emerald-400/80" }), !isXhs && !isNewspic && !isGzhNews && _jsx(BookOpen, { className: "size-3 text-primary/80" }), _jsx("span", { children: displayName }), isMod && (_jsx("span", { title: "\u6B64\u7BC7\u5DF2\u4FDD\u5B58\u5FAE\u8C03\u4FEE\u6539", className: "size-1.5 rounded-full bg-amber-500 ml-0.5" }))] }, art.id || idx));
                        }) }), _jsxs("div", { className: "flex items-center gap-1 shrink-0", children: [_jsx(Button, { type: "button", size: "sm", variant: "ghost", disabled: currentIndex === 0, onClick: () => onSelectIndex(Math.max(0, currentIndex - 1)), className: "size-7 p-0 text-foreground-muted hover:text-foreground cursor-pointer disabled:opacity-30", title: "\u4E0A\u4E00\u7BC7", children: _jsx(ChevronLeft, { className: "size-3.5" }) }), _jsxs("span", { className: "text-ui-2xs text-foreground-muted font-medium tabular-nums px-1", children: [currentIndex + 1, " / ", articles.length] }), _jsx(Button, { type: "button", size: "sm", variant: "ghost", disabled: currentIndex === articles.length - 1, onClick: () => onSelectIndex(Math.min(articles.length - 1, currentIndex + 1)), className: "size-7 p-0 text-foreground-muted hover:text-foreground cursor-pointer disabled:opacity-30", title: "\u4E0B\u4E00\u7BC7", children: _jsx(ChevronRight, { className: "size-3.5" }) })] })] })), _jsxs("div", { role: "button", tabIndex: 0, onClick: () => onOpenPreview(currentIndex), onKeyDown: (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpenPreview(currentIndex);
                    }
                }, className: cn('group relative flex flex-col gap-2 rounded-xl p-3.5 border shadow-xs transition-all cursor-pointer text-left', 'border-border/80 hover:bg-background/95', capability.themeStyle.lightBg, capability.themeStyle.borderHover), style: { boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.06), 0 2px 8px -2px rgba(0,0,0,0.04)' }, title: "\u70B9\u51FB\u5728\u53F3\u4FA7\u8FB9\u680F\u5168\u5C3A\u5BF8\u62DF\u771F\u9884\u89C8\u4E0E\u5BA1\u6821\u6B63\u6587", children: [_jsx("div", { className: "flex items-start justify-between gap-3", children: _jsx("h4", { className: "text-ui-base font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1 leading-snug tracking-tight", children: currentArticle.title || '未命名图文' }) }), _jsxs("div", { className: "flex items-center gap-1.5 text-ui-xs text-foreground-muted flex-wrap", children: [_jsx("span", { className: cn('inline-flex items-center px-1.5 py-0.5 rounded-md font-bold border text-ui-2xs shadow-2xs', capability.themeStyle.badgeBg, capability.themeStyle.badgeText, capability.themeStyle.badgeBorder), children: platformLabel }), _jsx("span", { children: "\u00B7" }), _jsx("span", { className: "font-medium text-foreground/85", children: capability.getFormatSummary(articles.length, currentIndex) }), images > 0 && (_jsxs(_Fragment, { children: [_jsx("span", { children: "\u00B7" }), _jsxs("span", { className: "text-foreground/90 font-medium", children: [images, " \u5F20\u914D\u56FE"] })] })), words > 0 && (_jsxs(_Fragment, { children: [_jsx("span", { children: "\u00B7" }), _jsxs("span", { children: ["\u7EA6 ", words.toLocaleString(), " \u5B57"] })] })), xhsTagCount > 0 && (_jsxs(_Fragment, { children: [_jsx("span", { children: "\u00B7" }), _jsxs("span", { className: "text-rose-600 dark:text-rose-400 font-medium", children: ["#", xhsTagCount, " \u8BDD\u9898\u6807\u7B7E"] })] }))] }), articles.length > 1 && currentArticle.platform === 'gzh' && (_jsxs("div", { className: "pt-1.5 border-t border-border/30 flex items-center justify-between text-[11px] text-foreground-subtle", children: [_jsxs("span", { children: ["\u5FAE\u4FE1\u591A\u56FE\u6587\u5408\u8F91\u7FA4\u53D1 \u00B7 \u5171 ", articles.length, " \u7BC7\u56FE\u6587\u5DF2\u5BF9\u9F50"] }), _jsx("span", { className: "text-emerald-600 dark:text-emerald-400 font-medium", children: "\u70B9\u51FB\u5C55\u5F00\u5408\u8F91\u9884\u89C8 \u2197" })] }))] })] }));
}
//# sourceMappingURL=SocialArticleFocusStage.js.map