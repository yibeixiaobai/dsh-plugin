import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from 'react';
import { Smartphone, ChevronRight, Image as ImageIcon, CheckCircle2, Layers, } from 'lucide-react';
import { isRenderableImageUrl, extractLocalDiskPathFromUrl, extractFileName, resolveTargetCardCount } from '../socialPublisherWorkflowExtractor.js';
import { useResolvedMediaUrls } from '../useResolvedMediaUrls.js';
import css from './WechatMultiArticleOverview.module.css';
/**
 * 微信公众号「多图文群发合辑」高保真拟真排版看板
 * 完美复刻微信订阅号消息流：头条 2.35:1 大图 + 次条 1:1 方图紧凑列表 + 小绿书 3:4 竖版多图胶卷
 */
export function WechatMultiArticleOverview({ articles, workspacePath, workspaceIdentity, sessionId, scriptsDir: explicitScriptsDir, onSelectArticle, }) {
    // 按照文章体裁与序号拆分：头条、次条长文、小绿书
    const headline = articles.find(a => a.articleType !== 'newspic') || articles[0];
    const rawSubArticles = articles.filter(a => a.id !== headline?.id && a.articleType !== 'newspic');
    // 【中文修复依据】：契约24——画纸末端次条长文幽灵草稿零容忍防御
    // 当合辑中已包含真实物理落盘长文时，彻底过滤无物理落盘文件且无有效内容的虚假幽灵次条
    const hasPhysicalNews = rawSubArticles.some(a => Boolean(a.filePath && (a.id.startsWith('art_file_') || (!a.id.startsWith('art_auto_') && !a.id.startsWith('art_seq_')))));
    const subArticles = rawSubArticles.filter((a) => {
        if (!hasPhysicalNews)
            return true;
        const isPhysical = Boolean(a.filePath && (a.id.startsWith('art_file_') || (!a.id.startsWith('art_auto_') && !a.id.startsWith('art_seq_'))));
        if (isPhysical)
            return true;
        const hasValidContent = Boolean(a.content && a.content.length > 300 && !a.content.includes('已生成就绪') && !a.content.includes('快马加鞭赶来的路上'));
        const hasValidCover = Boolean(a.coverUrl && !a.coverUrl.includes('placeholder'));
        return hasValidContent || hasValidCover;
    });
    // 【中文修复依据】：契约24——画纸末端幽灵小绿书草稿过滤防御
    const newsTitles = new Set(articles
        .filter(a => a.articleType !== 'newspic')
        .map(a => a.title.replace(/^[《<]|[》>]$/g, '').replace(/\s+/g, '').trim())
        .filter(Boolean));
    const rawNewspics = articles.filter(a => a.articleType === 'newspic');
    const hasPhysicalNewspic = rawNewspics.some(np => Boolean(np.filePath && (np.filePath.includes('_pic.json') || np.filePath.includes('newspic'))) || (np.images && np.images.length > 0));
    const newspics = rawNewspics.filter((np) => {
        const isPhysical = Boolean(np.filePath && (np.filePath.includes('_pic.json') || np.filePath.includes('newspic'))) || (np.images && np.images.length > 0);
        if (isPhysical)
            return true;
        const cleanT = np.title.replace(/^[《<]|[》>]$/g, '').replace(/\s+/g, '').trim();
        if (hasPhysicalNewspic || (cleanT && newsTitles.has(cleanT))) {
            return false; // 存在真实小绿书或与长文同名时，丢弃虚拟占位稿
        }
        return true;
    });
    // 综合推导当前任务沙箱生效物理目录（多级兜底保证 100% 命中沙箱 images 目录）
    const effectiveScriptsDir = explicitScriptsDir ||
        headline?.scriptsDir ||
        articles.find(a => a.scriptsDir)?.scriptsDir;
    // 聚合所有封面与小绿书配图做解析（附带沙箱账号目录双向探针，彻底解决次条灰色破图方块）
    const allMediaUrls = React.useMemo(() => {
        const list = [];
        const normEffective = effectiveScriptsDir?.replace(/\\/g, '/').replace(/\/+$/, '');
        for (const a of articles) {
            const idx = a.index || 1;
            const sDir = a.scriptsDir?.replace(/\\/g, '/').replace(/\/+$/, '') || normEffective;
            const acc = a.accountId || headline?.accountId || 'default';
            const targetDirs = sDir ? [
                sDir,
                `${sDir}/gzh_${acc}`, `${sDir}/${acc}`,
            ] : [];
            if (a.coverUrl && !list.includes(a.coverUrl))
                list.push(a.coverUrl);
            if (a.images) {
                for (const img of a.images) {
                    if (img && !list.includes(img))
                        list.push(img);
                }
            }
            // 【中文修复依据】：次条长文严格锁定 cover_{idx}，杜绝克隆首篇封面与小绿书竖版卡片串用
            const probeFiles = [
                `cover_${idx}.png`, `cover_${idx}.jpg`, `cover_${idx}.webp`,
                ...(idx === 1 ? ['cover.png', 'cover.jpg'] : []),
            ];
            for (const p of probeFiles) {
                if (!list.includes(p))
                    list.push(p);
                for (const td of targetDirs) {
                    const direct1 = `${td}/${p}`;
                    const direct2 = `${td}/images/${p}`;
                    if (!list.includes(direct1))
                        list.push(direct1);
                    if (!list.includes(direct2))
                        list.push(direct2);
                }
            }
        }
        return list;
    }, [articles, effectiveScriptsDir]);
    const resolvedUrls = useResolvedMediaUrls(allMediaUrls, {
        workspacePath,
        workspaceIdentity,
        accountId: headline?.accountId,
        scriptsDir: effectiveScriptsDir,
        sessionId,
    });
    const resolvedMap = React.useMemo(() => {
        const map = new Map();
        for (let i = 0; i < allMediaUrls.length; i++) {
            const raw = allMediaUrls[i];
            const res = resolvedUrls[i];
            if (raw && res && isRenderableImageUrl(res)) {
                map.set(raw, res);
                map.set(raw.replace(/\\/g, '/'), res);
                const diskPath = extractLocalDiskPathFromUrl(raw);
                if (diskPath) {
                    map.set(diskPath, res);
                    map.set(diskPath.replace(/\\/g, '/'), res);
                }
                const fileName = extractFileName(raw);
                if (fileName && !map.has(fileName))
                    map.set(fileName, res);
            }
        }
        return map;
    }, [allMediaUrls, resolvedUrls]);
    const [imgErrorMap, setImgErrorMap] = React.useState({});
    // 【中文修复依据】：一旦媒体解析探针产出新的有效图片映射，自动清空旧错误标记，彻底根除死锁破图
    React.useEffect(() => {
        setImgErrorMap({});
    }, [resolvedUrls]);
    const accountDisplayName = headline?.accountName || headline?.accountId || '微信官方公众号';
    // 安全获取可在 <img> 标签中渲染的图片真实 URL（【中文修复依据】：增加 subCardIndex 槽位感知，杜绝小绿书卡片全重复为封面）
    const getSafeResolvedImageUrl = React.useCallback((rawUrl, articleIndex, subCardIndex) => {
        if (rawUrl) {
            const trimmed = rawUrl.trim();
            if (isRenderableImageUrl(trimmed))
                return trimmed;
            const direct = resolvedMap.get(trimmed) || resolvedMap.get(trimmed.replace(/\\/g, '/'));
            if (direct && isRenderableImageUrl(direct))
                return direct;
            const diskPath = extractLocalDiskPathFromUrl(trimmed);
            if (diskPath) {
                const fromDisk = resolvedMap.get(diskPath) || resolvedMap.get(diskPath.replace(/\\/g, '/'));
                if (fromDisk && isRenderableImageUrl(fromDisk))
                    return fromDisk;
            }
            const fileName = extractFileName(trimmed);
            if (fileName) {
                const fromName = resolvedMap.get(fileName);
                if (fromName && isRenderableImageUrl(fromName))
                    return fromName;
                for (const [k, v] of resolvedMap.entries()) {
                    if ((k === fileName || k.endsWith('/' + fileName) || k.endsWith('\\' + fileName)) && isRenderableImageUrl(v))
                        return v;
                }
            }
        }
        if (articleIndex) {
            const fallbackNames = subCardIndex !== undefined
                ? [
                    `pic_${articleIndex}_${subCardIndex}.png`, `pic_${articleIndex}_${subCardIndex}.jpg`,
                    `xhs_pic_${articleIndex}_${subCardIndex}.png`, `xhs_pic_${articleIndex}_${subCardIndex}.jpg`,
                    ...(articleIndex === 1 ? [`pic_${subCardIndex}.png`, `pic_${subCardIndex}.jpg`] : []),
                    ...(subCardIndex === 1 ? [`cover_${articleIndex}.png`, `cover_${articleIndex}.jpg`, ...(articleIndex === 1 ? ['cover.png', 'cover.jpg'] : [])] : []),
                ]
                : [
                    `cover_${articleIndex}.png`, `cover_${articleIndex}.jpg`, `cover_${articleIndex}.webp`,
                    ...(articleIndex === 1 ? ['cover.png', 'cover.jpg'] : []), `pic_${articleIndex}.png`,
                ];
            for (const fb of fallbackNames) {
                const matched = resolvedMap.get(fb);
                if (matched && isRenderableImageUrl(matched))
                    return matched;
                for (const [k, v] of resolvedMap.entries()) {
                    if ((k === fb || k.endsWith('/' + fb) || k.endsWith('\\' + fb)) && isRenderableImageUrl(v))
                        return v;
                }
            }
        }
        return undefined;
    }, [resolvedMap]);
    const headlineCover = getSafeResolvedImageUrl(headline?.coverUrl, headline?.index || 1);
    const isHeadlineCoverValid = Boolean(headlineCover && !imgErrorMap[headlineCover]);
    return (_jsxs("div", { className: css.container, children: [_jsxs("div", { className: css.feedCard, children: [_jsxs("div", { className: css.feedHeader, children: [_jsxs("div", { className: css.accountRow, children: [_jsx("div", { className: css.accountAvatar, children: "\u8BA2\u9605\u53F7" }), _jsxs("div", { className: css.accountNameCol, children: [_jsxs("div", { className: css.accountName, children: [_jsx("span", { children: accountDisplayName }), _jsx("span", { style: { borderRadius: 4, background: 'rgba(16, 185, 129, 0.1)', color: '#059669', padding: '1px 4px', fontSize: 9, fontWeight: 700 }, children: "\u8BA4\u8BC1\u53F7" })] }), _jsx("div", { className: css.feedMeta, children: "\u4ECA\u5929 12:00 \u00B7 \u5FAE\u4FE1\u591A\u56FE\u6587\u5408\u8F91\u7FA4\u53D1\u63A8\u9001" })] })] }), _jsxs("div", { className: css.feedCountBadge, children: [_jsx(Layers, { size: 12, style: { color: '#059669' } }), _jsxs("span", { children: ["\u5408\u8F91\u63A8\u9001 \u00B7 \u5171 ", subArticles.length + (headline ? 1 : 0), " \u7BC7"] })] })] }), headline && (_jsx("div", { onClick: () => onSelectArticle(articles.indexOf(headline)), className: css.headlineSlot, title: "\u70B9\u51FB\u5BA1\u6821\u5E76\u7F16\u8F91 #1 \u9996\u7BC7\u957F\u6587", children: _jsxs("div", { className: css.headlineBanner, children: [isHeadlineCoverValid ? (_jsx("img", { src: headlineCover, alt: "", onError: () => setImgErrorMap(prev => ({ ...prev, [headlineCover]: true })), className: css.headlineImg })) : (_jsxs("div", { style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#34d399' }, children: [_jsx(ImageIcon, { size: 24 }), _jsx("span", { style: { fontSize: 11 }, children: "\u5FAE\u4FE1\u516C\u4F17\u53F7\u5C01\u9762\u5927\u56FE\u6392\u7248" })] })), _jsxs("div", { className: css.headlineOverlay, children: [_jsxs("div", { className: css.headlineBadgeRow, children: [_jsx("span", { className: css.headlineBadge, children: "#1 \u5C01\u9762\u5927\u56FE" }), _jsx("span", { style: { fontSize: 11, opacity: 0.85 }, children: "\u6DF1\u5EA6\u957F\u6587" })] }), _jsx("h3", { className: css.headlineTitle, children: headline.title || '未命名首篇长文' })] })] }) })), subArticles.length > 0 && (_jsx("div", { className: css.subList, children: subArticles.map((subArt) => {
                            const actualIdx = articles.indexOf(subArt);
                            const articleIdx = subArt.index ?? (actualIdx + 1);
                            const subCover = getSafeResolvedImageUrl(subArt.coverUrl, articleIdx);
                            return (_jsxs("div", { onClick: () => onSelectArticle(actualIdx), className: css.subItem, title: `点击审校并编辑 #${actualIdx + 1} 次条长文`, children: [_jsxs("div", { className: css.subInfo, children: [_jsx("div", { children: _jsxs("span", { className: css.subBadge, children: ["#", actualIdx + 1, " \u6B21\u6761"] }) }), _jsx("h4", { className: css.subTitle, children: subArt.title || '未命名次条长文' }), subArt.digest && (_jsx("p", { style: { fontSize: 11, color: 'var(--dsw-alias-label-tertiary, #9ca3af)', margin: 0 }, children: subArt.digest }))] }), _jsx("div", { className: css.subCoverWrap, children: subCover && !imgErrorMap[subCover] ? (_jsx("img", { src: subCover, alt: "", onError: () => setImgErrorMap(prev => ({ ...prev, [subCover]: true })), className: css.subCoverImg })) : (_jsx("div", { style: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }, children: _jsx(ImageIcon, { size: 20 }) })) })] }, subArt.id || actualIdx));
                        }) })), newspics.length > 0 && (_jsxs("div", { className: "border-t border-border/30 bg-surface/20 p-4 space-y-3", children: [_jsxs("div", { className: "flex items-center justify-between text-[11px] text-foreground-muted px-1", children: [_jsxs("span", { className: "font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1", children: [_jsx(Smartphone, { className: "size-3" }), _jsx("span", { children: "\u540C\u6279\u6B21\u72EC\u7ACB\u53D1\u8868 \u00B7 \u5FAE\u4FE1\u5C0F\u7EFF\u4E66 (\u56FE\u7247\u6D88\u606F)" })] }), _jsx("span", { children: "\u72EC\u7ACB\u5355\u7BC7\u53D1\u9001" })] }), newspics.map((np) => {
                                const actualIdx = articles.indexOf(np);
                                const targetSlots = resolveTargetCardCount(np);
                                return (_jsxs("div", { onClick: () => onSelectArticle(actualIdx), className: "rounded-2xl border border-emerald-500/25 bg-card/80 p-3.5 space-y-2.5 hover:border-emerald-500/50 hover:shadow-xs transition-all cursor-pointer group", title: `点击审校并编辑 #${actualIdx + 1} 微信小绿书多图卡片`, children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-1.5", children: [_jsxs("span", { className: "rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 text-ui-2xs font-bold flex items-center gap-1", children: [_jsx(Smartphone, { className: "size-3" }), _jsxs("span", { children: ["#$", actualIdx + 1, " \u5FAE\u4FE1\u5C0F\u7EFF\u4E66"] })] }), _jsxs("span", { className: "text-[11px] text-foreground-muted", children: ["3:4 \u7AD6\u7248\u591A\u56FE\u6D41 \u00B7 $", targetSlots, " \u5F20\u5361\u7247"] })] }), _jsxs("span", { className: "text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform", children: [_jsx("span", { children: "\u5355\u7BC7\u5BA1\u6821" }), _jsx(ChevronRight, { className: "size-3" })] })] }), _jsx("h4", { className: "text-ui-xs font-bold text-foreground leading-snug", children: np.title || '微信小绿书图文速递' }), _jsx("div", { className: "flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar", children: Array.from({ length: targetSlots }).map((_, slotIdx) => {
                                                const cardSub = slotIdx + 1;
                                                const rawUrl = np.images?.[slotIdx];
                                                const safeUrl = getSafeResolvedImageUrl(rawUrl, actualIdx + 1, cardSub);
                                                const hasImage = Boolean(safeUrl && !imgErrorMap[safeUrl]);
                                                return (_jsxs("div", { className: "relative aspect-[3/4] w-16 md:w-20 rounded-lg overflow-hidden border border-border/40 bg-surface-hover/30 shrink-0 shadow-2xs", children: [safeUrl && hasImage ? (_jsx("img", { src: safeUrl, alt: `卡片 ${cardSub}`, onError: () => {
                                                                setImgErrorMap(prev => ({ ...prev, [safeUrl]: true }));
                                                            }, className: "size-full object-cover" })) : (_jsxs("div", { className: "size-full flex flex-col items-center justify-center text-foreground-muted/40 bg-surface-hover/50", children: [_jsx(ImageIcon, { className: "size-4 opacity-50" }), _jsx("span", { className: "text-[9px] font-mono text-foreground-subtle mt-0.5", children: "\u5F85\u751F\u6210" })] })), _jsx("div", { className: "absolute top-1 right-1 rounded-sm bg-black/60 px-1 py-0.2 text-[8px] font-bold text-white", children: cardSub })] }, slotIdx));
                                            }) })] }, np.id || actualIdx));
                            })] }))] }), _jsxs("div", { className: "flex items-center justify-between px-3 py-2 rounded-2xl bg-surface/40 border border-border/30 text-ui-2xs text-foreground-muted", children: [_jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx(CheckCircle2, { className: "size-3.5 text-emerald-600 dark:text-emerald-400" }), _jsx("span", { children: "\u5408\u8F91\u6392\u7248\u5C31\u7EEA \u00B7 \u56FE\u6587\u6392\u4ED6\u6027\u5BF9\u9F50\u5DF2\u6821\u9A8C" })] }), _jsx("span", { children: "\u70B9\u51FB\u4EFB\u610F\u7BC7\u76EE\u76F4\u63A5\u8FDB\u5165\u5C31\u5730\u7F16\u8F91" })] })] }));
}
//# sourceMappingURL=WechatMultiArticleOverview.js.map