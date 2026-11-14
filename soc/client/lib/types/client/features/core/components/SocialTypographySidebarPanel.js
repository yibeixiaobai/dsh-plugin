import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useMemo, useCallback, useEffect } from 'react';
import { Palette, Search, Plus, Check, ChevronDown, RotateCw, RefreshCw, MapPin, X, ArrowDownToLine, } from 'lucide-react';
import { WECHAT_COMPONENT_TEMPLATES } from '../wechat-canvas/wechatComponentLibrary.js';
import { getRecommendedTemplates, recordRecentTemplateId, } from '../wechat-canvas/wechatRecommendationManager.js';
import { SocialTypographyDropdownMenu } from './SocialTypographyDropdownMenu.js';
import css from './SocialTypographySidebarPanel.module.css';
/**
 * 将模板生成的原始微信 HTML 适度收敛外边距与最大宽度，用于侧栏小卡片中的高保真紧凑居中呈现
 */
function sanitizeForPreview(rawHtml) {
    if (!rawHtml)
        return '';
    return rawHtml
        .replace(/margin:\s*(?:1[6-9]|2\d|3\d)px\s+0(?:\s+(?:1[6-9]|2\d|3\d)px)?/gi, 'margin:4px 0')
        .replace(/margin:\s*(?:1[6-9]|2\d|3\d)px\s+auto/gi, 'margin:4px auto');
}
/**
 * Left sidebar typography template library panel (64 curated components).
 * Supports category filtering, search, intelligent recommendation,
 * theme switching, and lossless in-place replace, below-insert, or gap anchor insert.
 *
 * @param props - Optional panel configuration.
 * @returns Rendered typography library panel.
 */
export function SocialTypographySidebarPanel({ currentTheme = 'wenying', }) {
    // 1. 一级大类与二级细分类状态
    const [activeMainCategory, setActiveMainCategory] = useState('recommend');
    const [activeSubCategory, setActiveSubCategory] = useState('all');
    // 2. 主题色
    const [currentThemeKey, setCurrentThemeKey] = useState(currentTheme);
    // 3. 搜索与换一换
    const [searchQuery, setSearchQuery] = useState('');
    const [shuffleSeed, setShuffleSeed] = useState(0);
    // 4. 当前画纸中选中的容器节点（通过 CustomEvent 广播全局监听）
    const [activeSelectedNode, setActiveSelectedNode] = useState(null);
    // 5. 当前画纸激活的插入缝隙索引 (0..N，通过 CustomEvent 广播全局监听)
    const [insertAnchorIndex, setInsertAnchorIndex] = useState(null);
    // 6. 瞬时插入动效标记
    const [recentlyInsertedId, setRecentlyInsertedId] = useState(null);
    // 7. 下拉浮层状态
    const [dropdownMode, setDropdownMode] = useState(null);
    // 监听画纸广播的选中容器变动事件
    useEffect(() => {
        function handleSelectedNodeChange(e) {
            const detail = e.detail;
            setActiveSelectedNode(detail?.selectedNode || null);
        }
        window.addEventListener('wincode:wechat-canvas-selected-node-changed', handleSelectedNodeChange);
        return () => {
            window.removeEventListener('wincode:wechat-canvas-selected-node-changed', handleSelectedNodeChange);
        };
    }, []);
    // 监听画纸广播的插入位置锚点事件
    useEffect(() => {
        function handleAnchorChange(e) {
            const detail = e.detail;
            setInsertAnchorIndex(detail?.targetIndex ?? null);
        }
        window.addEventListener('wincode:wechat-canvas-set-insert-anchor', handleAnchorChange);
        return () => {
            window.removeEventListener('wincode:wechat-canvas-set-insert-anchor', handleAnchorChange);
        };
    }, []);
    const handleCancelAnchor = useCallback(() => {
        setInsertAnchorIndex(null);
        window.dispatchEvent(new CustomEvent('wincode:wechat-canvas-set-insert-anchor', {
            detail: { targetIndex: null },
        }));
    }, []);
    // 一级分类元数据定义
    const mainCategories = [
        { id: 'recommend', label: '推荐' },
        { id: 'hot', label: '热门' },
        { id: 'heading', label: '标题' },
        { id: 'card', label: '卡片' },
        { id: 'image', label: '图片' },
        { id: 'component', label: '组件' },
        { id: 'layout', label: '布局' },
        { id: 'all', label: '全部' },
    ];
    const activeMainLabel = mainCategories.find(c => c.id === activeMainCategory)?.label || '全部';
    const handleSelectMainCategory = (cat) => {
        setActiveMainCategory(cat);
        setActiveSubCategory('all');
        setDropdownMode(null);
    };
    const handleShuffle = () => {
        setShuffleSeed(prev => prev + 1);
    };
    // 过滤展示的模板列表
    const displayedTemplates = useMemo(() => {
        let list = [];
        if (activeMainCategory === 'recommend') {
            list = getRecommendedTemplates(activeSelectedNode);
        }
        else if (activeMainCategory === 'hot') {
            list = WECHAT_COMPONENT_TEMPLATES.filter((tpl) => {
                if (activeSubCategory === '节日专属') {
                    return tpl.mainCategory === 'festival' || (tpl.badge || '').includes('节');
                }
                if (activeSubCategory === '爆款金句') {
                    return tpl.mainCategory === 'card' && (tpl.badge?.includes('金句') || tpl.title.includes('名言'));
                }
                if (activeSubCategory === '吸睛大标题') {
                    return tpl.mainCategory === 'heading';
                }
                if (activeSubCategory === '引导关注') {
                    return tpl.badge?.includes('关注') || tpl.title.includes('关注');
                }
                return Boolean(tpl.badge) || tpl.id.startsWith('title_');
            });
        }
        else {
            list = WECHAT_COMPONENT_TEMPLATES.filter((tpl) => {
                if (activeMainCategory !== 'all' && tpl.mainCategory && tpl.mainCategory !== activeMainCategory) {
                    if (activeMainCategory === 'component' && (tpl.badge?.includes('关注') || tpl.title.includes('关注'))) {
                        return true;
                    }
                    return false;
                }
                if (activeSubCategory && activeSubCategory !== 'all') {
                    if (activeSubCategory.includes('底色') && !tpl.title.includes('底色') && !tpl.desc?.includes('底色'))
                        return false;
                    if (activeSubCategory.includes('线框') && !tpl.title.includes('线框') && !tpl.desc?.includes('线框'))
                        return false;
                    if (activeSubCategory.includes('图标') && !tpl.title.includes('徽标') && !tpl.title.includes('符号'))
                        return false;
                    if (activeSubCategory.includes('序号') && !tpl.title.includes('编号') && !tpl.title.includes('数字'))
                        return false;
                }
                return true;
            });
        }
        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            list = list.filter(t => t.title.toLowerCase().includes(q) || t.desc?.toLowerCase().includes(q) || t.badge?.toLowerCase().includes(q));
        }
        if (shuffleSeed > 0) {
            list = [...list].sort(() => 0.5 - Math.random());
        }
        return list;
    }, [activeMainCategory, activeSubCategory, activeSelectedNode, searchQuery, shuffleSeed]);
    // 应用组件模板：根据是否有锚点模式、选中节点与指定操作模式进行高精度分流
    const handleApplyTemplate = useCallback((tpl, actionOverride) => {
        recordRecentTemplateId(tpl.id);
        const newNode = tpl.createNode(currentThemeKey);
        let mode = 'insert';
        let targetIndex;
        let targetNodeId;
        if (actionOverride) {
            mode = actionOverride;
            if (actionOverride === 'replace' || actionOverride === 'insert_below') {
                targetNodeId = activeSelectedNode?.id;
            }
        }
        else if (insertAnchorIndex !== null) {
            mode = 'insert';
            targetIndex = insertAnchorIndex;
        }
        else if (activeSelectedNode) {
            mode = 'replace';
            targetNodeId = activeSelectedNode.id;
        }
        else {
            mode = 'insert';
        }
        window.dispatchEvent(new CustomEvent('wincode:wechat-canvas-apply-template', {
            detail: {
                mode,
                targetNodeId,
                targetIndex,
                templateId: tpl.id,
                template: tpl,
                node: newNode,
                title: tpl.title,
            },
        }));
        // 若处于缝隙锚点模式，插入完成后自动清除侧栏锚点记录
        if (insertAnchorIndex !== null) {
            setInsertAnchorIndex(null);
        }
        setRecentlyInsertedId(tpl.id);
        setTimeout(() => {
            setRecentlyInsertedId(curr => (curr === tpl.id ? null : curr));
        }, 1200);
    }, [activeSelectedNode, insertAnchorIndex, currentThemeKey]);
    return (_jsxs("div", { className: css.panelRoot, children: [_jsxs("div", { className: css.headerRow, children: [_jsx("div", { className: css.tabsScroll, children: mainCategories.map((cat) => {
                            const isActive = activeMainCategory === cat.id;
                            return (_jsxs("button", { type: "button", onClick: () => handleSelectMainCategory(cat.id), className: `${css.tabBtn} ${isActive ? css.tabBtnActive : ''}`, children: [_jsx("span", { children: cat.label }), isActive && cat.id !== 'recommend' && (_jsx(ChevronDown, { className: css.tabChevron, onClick: (e) => {
                                            e.stopPropagation();
                                            setDropdownMode(prev => (prev === 'subCategory' ? null : 'subCategory'));
                                        } })), isActive && _jsx("span", { className: css.tabIndicator })] }, cat.id));
                        }) }), _jsxs("button", { type: "button", onClick: () => setDropdownMode(prev => (prev === 'themePicker' ? null : 'themePicker')), title: "\u5207\u6362\u753B\u7EB8\u4E3B\u9898\u8272", className: css.themeCapsuleBtn, children: [_jsx("div", { className: css.themeColorCircle, children: _jsx(Palette, { className: css.themePaletteIcon }) }), _jsx("span", { className: css.themeLabel, children: "\u4E3B\u9898\u8272" })] }), dropdownMode && (_jsx(SocialTypographyDropdownMenu, { mode: dropdownMode, activeMainCategory: activeMainCategory, activeSubCategory: activeSubCategory, activeThemeKey: currentThemeKey, onSelectSubCategory: sub => setActiveSubCategory(sub), onSelectTheme: theme => setCurrentThemeKey(theme), onClose: () => setDropdownMode(null) }))] }), insertAnchorIndex !== null ? (_jsxs("div", { className: css.statusBarAnchor, children: [_jsxs("div", { className: css.anchorStatusInfo, children: [_jsx(MapPin, { className: css.anchorPinIcon }), _jsxs("span", { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: ["\u76EE\u6807\uFF1A", insertAnchorIndex === 0 ? '正文开头' : `第 ${insertAnchorIndex} 节下方`, " \u00B7 \u70B9\u51FB\u7EC4\u4EF6\u76F4\u63D2"] })] }), _jsxs("button", { type: "button", className: css.cancelAnchorBtn, onClick: handleCancelAnchor, title: "\u9000\u51FA\u7F1D\u9699\u63D2\u5165\u951A\u70B9\u6A21\u5F0F", children: [_jsx(X, { style: { width: '10px', height: '10px' } }), _jsx("span", { children: "\u53D6\u6D88" })] })] })) : activeSelectedNode ? (_jsxs("div", { className: css.statusBarReplace, children: [_jsxs("span", { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: ["\u9009\u4E2D\u3010", activeSelectedNode.label, "\u3011\uFF1A\u5361\u7247\u60AC\u6D6E\u53EF\u9009\u65E0\u635F\u6362\u88C5\u6216\u5411\u4E0B\u63D2\u5165"] }), _jsx("span", { className: css.badgePill, children: "\u6362\u88C5 / \u4E0B\u63D2" })] })) : activeMainCategory === 'recommend' ? (_jsx("div", { className: css.statusBarRecommend, children: _jsx("span", { children: "\u63A8\u8350\uFF1A\u5E38\u7528\u7206\u6B3E\u4E0E\u6700\u8FD1\u4F7F\u7528\uFF08\u6700\u591A10\u6B3E\uFF09" }) })) : null, _jsxs("div", { className: css.searchBar, children: [_jsxs("div", { className: css.searchInputWrap, children: [_jsx(Search, { className: css.searchIcon }), _jsx("input", { type: "text", value: searchQuery, onChange: e => setSearchQuery(e.target.value), placeholder: `在 '${activeMainLabel}' 内搜索...`, className: css.searchInput }), searchQuery && (_jsx("button", { type: "button", onClick: () => setSearchQuery(''), className: css.searchClearBtn, children: "\u2715" }))] }), _jsxs("button", { type: "button", onClick: handleShuffle, title: "\u6362\u4E00\u6279\u63A8\u8350\u7EC4\u4EF6", className: css.shuffleBtn, children: [_jsx(RotateCw, { style: { width: '12px', height: '12px' } }), _jsx("span", { children: "\u6362\u4E00\u6362" })] })] }), _jsx("div", { className: css.templatesStream, children: displayedTemplates.length === 0 ? (_jsx("div", { className: css.emptyPrompt, children: "\u672A\u627E\u5230\u5339\u914D\u7684\u7248\u5F0F\u7EC4\u4EF6" })) : (displayedTemplates.map((tpl) => {
                    const isJustApplied = recentlyInsertedId === tpl.id;
                    const previewHtml = sanitizeForPreview(tpl.createNode(currentThemeKey).rawHtml);
                    const hasAnchor = insertAnchorIndex !== null;
                    const hasSelectedNode = Boolean(activeSelectedNode) && !hasAnchor;
                    return (_jsxs("div", { onClick: () => {
                            if (hasAnchor) {
                                handleApplyTemplate(tpl);
                            }
                            else if (hasSelectedNode) {
                                handleApplyTemplate(tpl, 'replace');
                            }
                            else {
                                handleApplyTemplate(tpl, 'insert');
                            }
                        }, title: hasAnchor
                            ? `点击直接插入到第 ${insertAnchorIndex === 0 ? '开头' : `${insertAnchorIndex} 节下方`}`
                            : hasSelectedNode
                                ? `点击无损换装【${activeSelectedNode?.label}】，或悬浮点击右上角【下插】`
                                : `${tpl.title} · 点击插入画纸末尾`, className: `${css.templateCard} ${isJustApplied
                            ? css.templateCardApplied
                            : hasAnchor
                                ? css.templateCardAnchor
                                : hasSelectedNode
                                    ? css.templateCardReplace
                                    : ''}`, children: [_jsx("div", { className: css.templatePreviewContent, dangerouslySetInnerHTML: { __html: previewHtml } }), hasAnchor ? (_jsxs("div", { className: `${css.cardHoverBadge} ${css.cardHoverBadgeAnchor}`, children: [_jsx(MapPin, { style: { width: '10px', height: '10px' } }), _jsx("span", { children: "\u63D2\u5165\u6B64\u4F4D\u7F6E" })] })) : hasSelectedNode ? (_jsxs("div", { className: css.cardActionGroup, children: [_jsxs("button", { type: "button", className: `${css.cardActionBtn} ${css.cardActionBtnReplace}`, onClick: (e) => {
                                            e.stopPropagation();
                                            handleApplyTemplate(tpl, 'replace');
                                        }, title: "\u4FDD\u7559\u5F53\u524D\u6587\u5B57/\u56FE\u7247\uFF0C\u4EC5\u6362\u7528\u6B64\u6837\u5F0F", children: [_jsx(RefreshCw, { style: { width: '10px', height: '10px' } }), _jsx("span", { children: "\u6362\u88C5" })] }), _jsxs("button", { type: "button", className: `${css.cardActionBtn} ${css.cardActionBtnInsertBelow}`, onClick: (e) => {
                                            e.stopPropagation();
                                            handleApplyTemplate(tpl, 'insert_below');
                                        }, title: "\u5728\u5F53\u524D\u9009\u4E2D\u6BB5\u843D\u4E0B\u65B9\u63D2\u5165\u6B64\u65B0\u7EC4\u4EF6", children: [_jsx(ArrowDownToLine, { style: { width: '10px', height: '10px' } }), _jsx("span", { children: "\u4E0B\u63D2" })] })] })) : (_jsxs("div", { className: `${css.cardHoverBadge} ${css.cardHoverBadgeInsert}`, children: [_jsx(Plus, { style: { width: '10px', height: '10px' } }), _jsx("span", { children: "\u63D2\u5165" })] })), isJustApplied && (_jsx("div", { className: css.appliedSuccessOverlay, children: _jsxs("span", { className: css.appliedSuccessPill, children: [_jsx(Check, { style: { width: '14px', height: '14px' } }), _jsx("span", { children: hasAnchor
                                                ? '已插入指定位置'
                                                : hasSelectedNode
                                                    ? '已就绪'
                                                    : '已插入画纸' })] }) }))] }, tpl.id));
                })) })] }));
}
//# sourceMappingURL=SocialTypographySidebarPanel.js.map