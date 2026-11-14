import { useState, useEffect, useMemo } from 'react';
import { resolvedArticleCache, resolvedBrandCache, cacheArticleContent, cacheBrandAsset, } from './mediaCacheManager.js';
import { getPersistentArticleContent, getPersistentBrandAsset, } from './socialPublisherPersistentStorage.js';
import { logger } from '../../compat/logger.js';
/**
 * 微信公众号/专栏文章正文与品牌资产 SWR（Stale-While-Revalidate）秒开 Hook
 * 【中文修复依据】：将正文与品牌配置的 L1 内存 + L2 IndexedDB 双层加载逻辑独立收敛，
 * 重新打开会话或切换 Tab 时，首帧 0ms 瞬间呈现已有产物，并在后台静默校验，消除骨架屏跳变。
 */
export function useArticlePlatformAsset({ article, workspaceServices, socialPublisherRpc, }) {
    // 1. 品牌配置与头尾图 SWR
    const currentAccountId = article.accountId || 'default';
    const cachedBrand = resolvedBrandCache.get(currentAccountId);
    const [brandTopRpcUrl, setBrandTopRpcUrl] = useState(cachedBrand?.brandTopUrl || null);
    const [brandBotRpcUrl, setBrandBotRpcUrl] = useState(cachedBrand?.brandBotUrl || null);
    const [brandImagesConfig, setBrandImagesConfig] = useState(cachedBrand?.config || null);
    useEffect(() => {
        let isMounted = true;
        const accountId = currentAccountId;
        if (!cachedBrand) {
            void getPersistentBrandAsset(accountId).then((l2Asset) => {
                if (!isMounted || !l2Asset)
                    return;
                if (l2Asset.brandTopUrl && !brandTopRpcUrl)
                    setBrandTopRpcUrl(l2Asset.brandTopUrl);
                if (l2Asset.brandBotUrl && !brandBotRpcUrl)
                    setBrandBotRpcUrl(l2Asset.brandBotUrl);
                if (l2Asset.config && !brandImagesConfig)
                    setBrandImagesConfig(l2Asset.config);
            });
        }
        if (!socialPublisherRpc)
            return;
        const p1 = socialPublisherRpc.handleGenericRoute('/api/gzh-publisher/brand-image', 'GET', undefined, {
            slot: 'header',
            account: accountId,
        });
        const p2 = socialPublisherRpc.handleGenericRoute('/api/gzh-publisher/brand-image', 'GET', undefined, {
            slot: 'footer',
            account: accountId,
        });
        const p3 = socialPublisherRpc.handleGenericRoute('/api/gzh-publisher/config/export', 'GET', undefined, {
            include_secrets: 'false',
        });
        void Promise.allSettled([p1, p2, p3]).then(([resTop, resBot, resCfg]) => {
            if (!isMounted)
                return;
            let topUrl = brandTopRpcUrl;
            let botUrl = brandBotRpcUrl;
            let cfg = brandImagesConfig;
            if (resTop.status === 'fulfilled' && resTop.value?.data?.data_url) {
                topUrl = resTop.value.data.data_url;
                setBrandTopRpcUrl(topUrl);
            }
            if (resBot.status === 'fulfilled' && resBot.value?.data?.data_url) {
                botUrl = resBot.value.data.data_url;
                setBrandBotRpcUrl(botUrl);
            }
            if (resCfg.status === 'fulfilled' && resCfg.value?.data?.config?.accounts) {
                const accs = resCfg.value.data.config.accounts;
                const targetAcc = Array.isArray(accs) ? accs.find((a) => a?.id === accountId) : accs[accountId];
                if (targetAcc?.brand_images) {
                    cfg = targetAcc.brand_images;
                    setBrandImagesConfig(cfg);
                }
            }
            cacheBrandAsset(accountId, { brandTopUrl: topUrl || undefined, brandBotUrl: botUrl || undefined, config: cfg });
        });
        return () => {
            isMounted = false;
        };
    }, [currentAccountId, socialPublisherRpc]);
    // 2. 正文 HTML 排版产物 SWR 秒开
    const initialCachedHtml = useMemo(() => {
        if (!article.filePath)
            return null;
        const norm = article.filePath.replace(/\\/g, '/');
        return resolvedArticleCache.get(norm) || resolvedArticleCache.get(article.filePath) || null;
    }, [article.filePath]);
    const [loadedHtml, setLoadedHtml] = useState(initialCachedHtml);
    const [loadingHtml, setLoadingHtml] = useState(false);
    useEffect(() => {
        let isDisposed = false;
        const shouldLoadFromFile = Boolean(article.filePath);
        if (shouldLoadFromFile && article.filePath) {
            const normPath = article.filePath.replace(/\\/g, '/');
            if (!loadedHtml) {
                void getPersistentArticleContent(normPath).then((cached) => {
                    if (!isDisposed && cached && !loadedHtml) {
                        setLoadedHtml(cached);
                        resolvedArticleCache.set(normPath, cached);
                    }
                });
            }
            // 【中文修复依据】：若内存已有正文（如 article.content 长度充足且有效），首帧直接呈现，绝不阻塞性呈现骨架屏
            const hasImmediateContent = Boolean(article.content &&
                article.content.trim().length > 50 &&
                !article.content.includes('排版落盘产物生成中') &&
                !article.content.includes('文章正在快马加鞭赶来'));
            if (!loadedHtml && !resolvedArticleCache.has(normPath) && !hasImmediateContent) {
                setLoadingHtml(true);
            }
            if (workspaceServices?.fileService) {
                workspaceServices.fileService
                    .readTextFile({ path: article.filePath })
                    .then((slice) => {
                    if (!isDisposed && slice?.content && slice.content.trim()) {
                        setLoadedHtml(slice.content);
                        cacheArticleContent(article.filePath, slice.content);
                    }
                })
                    .catch((err) => {
                    logger.debug('[useArticlePlatformAsset] 读取落盘正文文件失败，保持当前文案', {
                        filePath: article.filePath,
                        error: err instanceof Error ? err.message : String(err),
                    });
                })
                    .finally(() => {
                    if (!isDisposed) {
                        setLoadingHtml(false);
                    }
                });
            }
            else {
                // 【中文修复依据】：补全 fileService 不可用时的兜底复位，杜绝骨架屏死锁
                setLoadingHtml(false);
            }
        }
        else {
            setLoadedHtml(null);
            setLoadingHtml(false);
        }
        return () => {
            isDisposed = true;
        };
    }, [article.filePath, workspaceServices]);
    return {
        brandTopRpcUrl,
        brandBotRpcUrl,
        brandImagesConfig,
        loadedHtml,
        loadingHtml,
    };
}
//# sourceMappingURL=useArticlePlatformAsset.js.map