import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useMemo, useEffect, useCallback } from 'react';
import { FileText, Copy, Check, ChevronLeft, ChevronRight, Layers, } from 'lucide-react';
import { SocialArticlePlatformPreview } from '../features/core/components/SocialArticlePlatformPreview.js';
import { WechatMultiArticleOverview } from '../features/core/components/WechatMultiArticleOverview.js';
import { copySocialArticleContent } from '../features/core/utils/socialClipboard.js';
import { useSocialWorkflow } from '../features/core/useSocialWorkflow.js';
import css from './SocialArticleRightTab.module.css';
export const SOCIAL_ARTICLE_TAB_ID = 'social-publisher/article-preview';
/**
 * Tab title chip for the right sidebar social article preview tab.
 *
 * @returns Tab icon and label element.
 */
export function SocialArticleRightTabTitle(_props) {
    return (_jsxs("span", { style: { display: 'inline-flex', alignItems: 'center', gap: '6px' }, children: [_jsx(FileText, { size: 14 }), _jsx("span", { children: "\u6587\u7AE0\u9884\u89C8\u4E0E\u6392\u7248" })] }));
}
/**
 * Computes platform-aware slot labels for multi-article navigation pills.
 */
function getArticleSlotLabel(art, idx, allArticles = []) {
    const isXhs = art.platform === 'xiaohongshu';
    const isNewspic = art.articleType === 'newspic';
    const isGzhNews = art.platform === 'gzh' && !isNewspic;
    const isToutiao = art.platform === 'toutiao';
    const isZhihu = art.platform === 'zhihu';
    const slotNum = typeof art.index === 'number' && art.index > 0 ? art.index : idx + 1;
    if (isNewspic) {
        const sameAccountNewspics = allArticles.filter(a => a.articleType === 'newspic' && (a.accountId || '') === (art.accountId || ''));
        if (sameAccountNewspics.length > 1) {
            const nIdx = sameAccountNewspics.findIndex(a => a.id === art.id) + 1;
            return `小绿书 #${nIdx > 0 ? nIdx : slotNum} (3:4)`;
        }
        return `小绿书 (3:4)`;
    }
    if (isXhs) {
        return `#${slotNum} 小红书笔记`;
    }
    if (isGzhNews) {
        const sameNews = allArticles.filter(a => a.platform === 'gzh' && a.articleType !== 'newspic');
        if (sameNews.length > 1) {
            return `#${slotNum} 公众号长文`;
        }
        return `公众号长文`;
    }
    if (isToutiao) {
        return `#${slotNum} 今日头条`;
    }
    if (isZhihu) {
        return `#${slotNum} 知乎文章`;
    }
    return `#${slotNum} ${art.platformName || '稿件'}`;
}
/**
 * Right sidebar tab for live multi-platform article preview, inspection, and review.
 * Connects directly to active session workflow articles and supports
 * multi-article navigation pills, previous/next cycling, and one-click copy.
 *
 * @param props - Slot runtime and locale props.
 * @returns Right pane preview body.
 */
export function SocialArticleRightTab(props) {
    let sessionId;
    try {
        const tabInfo = props.useTabInfo?.();
        sessionId = tabInfo?.sessionId;
    }
    catch {
        // Tab info hook fallback
    }
    const { workflow } = useSocialWorkflow(sessionId);
    const articles = useMemo(() => (Array.isArray(workflow.articles) ? workflow.articles : []), [workflow.articles]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [localArticles, setLocalArticles] = useState(articles);
    const [copied, setCopied] = useState(false);
    // Sync external workflow articles into local state
    useEffect(() => {
        if (Array.isArray(workflow.articles) && workflow.articles.length > 0) {
            setLocalArticles(workflow.articles);
        }
    }, [workflow.articles]);
    const totalCount = localArticles.length;
    const currentArticle = localArticles[currentIndex] || localArticles[0] || null;
    const hasMultipleGzhNews = useMemo(() => {
        const gzhArticles = localArticles.filter(a => a.platform === 'gzh' && a.articleType !== 'newspic');
        return gzhArticles.length > 1;
    }, [localArticles]);
    const handleCopyCurrent = useCallback(async () => {
        if (!currentArticle)
            return;
        const ok = await copySocialArticleContent(currentArticle);
        if (ok) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    }, [currentArticle]);
    const handleTitleChange = useCallback((newTitle) => {
        setLocalArticles(prev => prev.map((art, idx) => (idx === currentIndex ? { ...art, title: newTitle } : art)));
    }, [currentIndex]);
    const handleDigestChange = useCallback((newDigest) => {
        setLocalArticles(prev => prev.map((art, idx) => (idx === currentIndex ? { ...art, digest: newDigest } : art)));
    }, [currentIndex]);
    const handleContentChange = useCallback((newContent) => {
        setLocalArticles(prev => prev.map((art, idx) => (idx === currentIndex ? { ...art, content: newContent } : art)));
    }, [currentIndex]);
    // Empty state when no articles exist in the active session
    if (!currentArticle || totalCount === 0) {
        return (_jsx("div", { className: css.container, children: _jsxs("div", { className: css.emptyState, children: [_jsx(FileText, { className: css.emptyIcon }), _jsx("div", { className: css.emptyTitle, children: "\u6682\u65E0\u793E\u5A92\u56FE\u6587\u5185\u5BB9" }), _jsx("div", { className: css.emptySub, children: "\u8BF7\u5728\u4E3B\u5BF9\u8BDD\u4E2D\u542F\u52A8\u793E\u5A92\u53D1\u5E03\u4EFB\u52A1\uFF0C\u751F\u6210\u7684\u591A\u5E73\u53F0\u56FE\u6587\u5C06\u5728\u6B64\u5B9E\u65F6\u62DF\u771F\u5448\u73B0\u4E0E\u5BA1\u6821\u3002" })] }) }));
    }
    const isOverviewSelected = currentIndex === -1;
    return (_jsxs("div", { className: css.container, children: [_jsxs("div", { className: css.header, children: [_jsxs("div", { className: css.navPillsScroll, children: [hasMultipleGzhNews && (_jsxs("button", { type: "button", onClick: () => setCurrentIndex(-1), className: `${css.navPill} ${isOverviewSelected ? css.navPillActive : ''}`, title: "\u67E5\u770B\u591A\u56FE\u6587\u6D88\u606F\u6D41\u5408\u8F91\u603B\u89C8", children: [_jsx(Layers, { style: { width: '12px', height: '12px' } }), _jsx("span", { children: "\u5408\u8F91\u603B\u89C8" })] })), localArticles.map((art, idx) => {
                                const isSelected = !isOverviewSelected && currentIndex === idx;
                                const label = getArticleSlotLabel(art, idx, localArticles);
                                return (_jsx("button", { type: "button", onClick: () => setCurrentIndex(idx), className: `${css.navPill} ${isSelected ? css.navPillActive : ''}`, title: art.title || label, children: _jsx("span", { children: label }) }, art.id || idx));
                            })] }), _jsxs("div", { className: css.actionsGroup, children: [_jsx("button", { type: "button", onClick: () => setCurrentIndex(prev => Math.max(0, prev - 1)), disabled: currentIndex <= 0, className: css.iconBtn, title: "\u67E5\u770B\u4E0A\u4E00\u7BC7", "aria-label": "\u67E5\u770B\u4E0A\u4E00\u7BC7", children: _jsx(ChevronLeft, { style: { width: '14px', height: '14px' } }) }), _jsx("button", { type: "button", onClick: () => setCurrentIndex(prev => Math.min(totalCount - 1, prev + 1)), disabled: currentIndex >= totalCount - 1, className: css.iconBtn, title: "\u67E5\u770B\u4E0B\u4E00\u7BC7", "aria-label": "\u67E5\u770B\u4E0B\u4E00\u7BC7", children: _jsx(ChevronRight, { style: { width: '14px', height: '14px' } }) }), !isOverviewSelected && (_jsx("button", { type: "button", onClick: handleCopyCurrent, className: `${css.copyBtn} ${copied ? css.copyBtnSuccess : ''}`, title: "\u590D\u5236\u5F53\u524D\u6587\u7AE0\u6587\u6848\u4E0E\u6392\u7248", children: copied ? (_jsxs(_Fragment, { children: [_jsx(Check, { style: { width: '13px', height: '13px' } }), _jsx("span", { children: "\u5DF2\u590D\u5236" })] })) : (_jsxs(_Fragment, { children: [_jsx(Copy, { style: { width: '13px', height: '13px' } }), _jsx("span", { children: "\u590D\u5236" })] })) }))] })] }), _jsx("div", { className: css.bodyArea, children: isOverviewSelected ? (_jsx(WechatMultiArticleOverview, { articles: localArticles, onSelectArticle: (idx) => setCurrentIndex(idx) })) : (_jsx(SocialArticlePlatformPreview, { article: currentArticle, workspacePath: "", onTitleChange: handleTitleChange, onDigestChange: handleDigestChange, onContentChange: handleContentChange })) })] }));
}
//# sourceMappingURL=SocialArticleRightTab.js.map