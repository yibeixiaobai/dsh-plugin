const isArticleVisualName = (fn) => /^(?:cover_|content_|pic_|xhs_pic_)/i.test(fn);
const isSandboxScope = (sc) => Boolean(sc && (sc.includes('tasks/active') || sc.includes('tasks/archive') || sc.includes('task_')));
import { useState, useEffect, useMemo, useRef } from 'react';
import { useWorkspaceServices } from '../../compat/hooks/useWorkspaceServices.js';
import { extractLocalDiskPathFromUrl, isSafeMediaUrl, isRenderableImageUrl, } from './socialPublisherWorkflowExtractor.js';
import { resolveCandidatePaths } from './resolveCandidatePaths.js';
import { logger } from '../../compat/logger.js';
import { resolvedMediaCache, resolvedCoverCache, cacheCoverImage, mediaCacheListeners, getScopedMediaCacheKey, invalidateMediaCache, isMediaFailed, recordFailedMedia, } from './mediaCacheManager.js';
import { getBatchPersistentMediaItems, putPersistentMediaItem, } from './socialPublisherPersistentStorage.js';
export { isSafeMediaUrl, isRenderableImageUrl, resolvedMediaCache, mediaCacheListeners, getScopedMediaCacheKey, invalidateMediaCache, isMediaFailed, recordFailedMedia, };
/**
 * 辅助批量将 Data URL 存入 L1 内存缓存并异步落盘至 L2 IndexedDB 持久化存储
 */
function recordResolvedMedia(keys, dataUrl) {
    for (const k of keys) {
        if (!k)
            continue;
        resolvedMediaCache.set(k, dataUrl);
        if (k.includes('cover')) {
            cacheCoverImage(k, dataUrl);
        }
        void putPersistentMediaItem(k, dataUrl);
    }
}
export function useResolvedMediaUrls(rawUrls, options = {}) {
    const { workspacePath, workspaceIdentity, accountId, scriptsDir, sessionId, services: explicitServices } = options;
    const workspaceServices = useWorkspaceServices(workspacePath, undefined, workspaceIdentity);
    const activeServices = explicitServices || workspaceServices;
    const [cacheVersion, setCacheVersion] = useState(0);
    const [retryVersion, setRetryVersion] = useState(0);
    const inFlightLoadsRef = useRef(new Set());
    const retryCountRef = useRef(0);
    const retryTimerRef = useRef(null);
    // 监听全局缓存失效事件，即时重绘并重置重试计数
    useEffect(() => {
        const onInvalidate = () => {
            retryCountRef.current = 0;
            setCacheVersion(v => v + 1);
            setRetryVersion(rv => rv + 1);
        };
        mediaCacheListeners.add(onInvalidate);
        return () => {
            mediaCacheListeners.delete(onInvalidate);
        };
    }, []);
    // 【中文修复依据】：将 sessionId 作为最高优先级会话作用域前缀，杜绝同一工作区下不同会话的媒体缓存互串
    const effectiveScope = useMemo(() => {
        const sessionPrefix = sessionId ? `session_${sessionId}/` : '';
        if (scriptsDir) {
            return `${sessionPrefix}${scriptsDir.replace(/\\/g, '/').replace(/\/+$/, '')}`;
        }
        if (workspacePath && accountId) {
            return `${sessionPrefix}${workspacePath.replace(/\\/g, '/')}/${accountId}`;
        }
        return `${sessionPrefix}${(workspacePath || 'global').replace(/\\/g, '/').replace(/\/+$/, '')}`;
    }, [sessionId, scriptsDir, workspacePath, accountId]);
    const effectiveWsKey = useMemo(() => {
        return (workspaceIdentity?.trim() || workspacePath || '').replace(/\\/g, '/').replace(/\/+$/, '');
    }, [workspaceIdentity, workspacePath]);
    const rawUrlsKey = rawUrls.join(',');
    useEffect(() => {
        retryCountRef.current = 0;
    }, [rawUrlsKey]);
    // 区分需要异步解析的本地路径与网络/Data URL
    const { targetsToLoad, immediateUrls: _immediateUrls } = useMemo(() => {
        const toLoad = [];
        const results = [];
        const normWs = workspacePath ? workspacePath.replace(/\\/g, '/').replace(/\/+$/, '') : undefined;
        const normSd = scriptsDir ? scriptsDir.replace(/\\/g, '/').replace(/\/+$/, '') : undefined;
        for (const raw of rawUrls) {
            if (!raw)
                continue;
            const trimmed = raw.trim();
            if (trimmed.startsWith('http://') ||
                trimmed.startsWith('https://') ||
                trimmed.startsWith('data:')) {
                results.push(trimmed);
                continue;
            }
            const diskPath = extractLocalDiskPathFromUrl(trimmed);
            const normDisk = diskPath.replace(/\\/g, '/');
            const fileName = normDisk.replace(/^.*[\\/]/, '');
            // 【中文修复依据】：文章视觉配图（cover/content/pic）必须严格沙箱物理闭环，严禁在非沙箱作用域下模糊命中跨任务旧缓存
            const isVisual = isArticleVisualName(fileName);
            const isPureFileName = normDisk === fileName || !normDisk.includes('/');
            const allowScope = !isVisual || isSandboxScope(effectiveScope);
            const scopedKey = allowScope && effectiveScope ? getScopedMediaCacheKey(fileName, effectiveScope, effectiveWsKey) : '';
            const scopedRawKey = allowScope && effectiveScope ? getScopedMediaCacheKey(trimmed, effectiveScope, effectiveWsKey) : '';
            // 【中文修复依据】：视觉物料（cover/content/pic）严禁以裸短文件名读取全局缓存，必须通过当前沙箱 ScopedKey 命中，杜绝跨任务旧图穿透
            const cached = (!isVisual || !isPureFileName ? resolvedMediaCache.get(normDisk) : undefined) ||
                (scopedKey ? resolvedMediaCache.get(scopedKey) : undefined) ||
                (scopedRawKey ? resolvedMediaCache.get(scopedRawKey) : undefined) ||
                (scopedKey && fileName.includes('cover') ? resolvedCoverCache.get(scopedKey) : undefined);
            if (cached) {
                results.push(cached);
            }
            else {
                results.push(trimmed); // 未就绪前暂用原始链接占位
                // 【中文修复依据】：负缓存拦截，若在 TTL 周期内已确认无法读取，严禁重复加入待加载列表
                const isFailed = isMediaFailed(normDisk) ||
                    (scopedKey ? isMediaFailed(scopedKey) : false) ||
                    isMediaFailed(diskPath);
                // 外部项目路径强阻断拦截：绝对路径带有 tasks/ 或 accounts/ 时，若不属于当前项目或当前沙箱，严禁加入待加载列表
                const isAbs = /^[a-zA-Z]:[\\/]/.test(diskPath) || diskPath.startsWith('/');
                let isIllegalExternal = false;
                if (isAbs && /\/(?:tasks|accounts)\//i.test(normDisk)) {
                    const belongsToWs = Boolean(normWs && (normDisk === normWs || normDisk.startsWith(normWs + '/')));
                    const belongsToSd = Boolean(normSd && (normDisk === normSd || normDisk.startsWith(normSd + '/')));
                    if (!belongsToWs && !belongsToSd) {
                        isIllegalExternal = true;
                    }
                }
                if (!isFailed && !isIllegalExternal && !toLoad.includes(diskPath)) {
                    toLoad.push(diskPath);
                }
            }
        }
        return { targetsToLoad: toLoad, immediateUrls: results };
    }, [rawUrls, cacheVersion, effectiveScope, effectiveWsKey, workspacePath, scriptsDir]);
    // 稳定化待加载凭据，防止数组引用变化引起无休止的 useEffect 自激执行
    const targetsKey = targetsToLoad.join(';;');
    useEffect(() => {
        if (targetsToLoad.length === 0 || !activeServices) {
            return;
        }
        let isDisposed = false;
        let anyLoaded = false;
        // 智能自愈：从待加载路径或 rawUrls 的任一绝对路径/协议 URL 中动态推导 scriptsDir
        let dynamicScripts = scriptsDir;
        for (const raw of rawUrls) {
            if (!raw)
                continue;
            const diskCandidate = extractLocalDiskPathFromUrl(raw);
            const testPath = diskCandidate || raw;
            if (/^[a-zA-Z]:[\\/]/.test(testPath) || testPath.startsWith('/')) {
                const norm = testPath.replace(/\\/g, '/');
                if (!dynamicScripts) {
                    if (norm.includes('/images/')) {
                        dynamicScripts = norm.replace(/\/images\/.*$/, '/images');
                        break;
                    }
                    else if (norm.includes('/articles/')) {
                        dynamicScripts = norm.replace(/\/articles\/.*$/, '/articles');
                        break;
                    }
                    else if (norm.includes('/scripts/')) {
                        dynamicScripts = norm.replace(/\/scripts\/.*$/, '/scripts');
                        break;
                    }
                }
            }
        }
        // 【中文修复依据】：L2 持久化极速预热门禁，阻断重复跨进程 RPC
        const candidateKeysForL2 = [];
        for (const dp of targetsToLoad) {
            const nd = dp.replace(/\\/g, '/');
            const fn = nd.replace(/^.*[\\/]/, '');
            const isVisual = isArticleVisualName(fn);
            const isPure = nd === fn || !nd.includes('/');
            // 视觉物料若为纯短文件名，严禁查询无命名空间的全局 L2 缓存
            if (!isVisual || !isPure) {
                candidateKeysForL2.push(nd);
            }
            if (effectiveScope) {
                if (!isVisual || isSandboxScope(effectiveScope)) {
                    candidateKeysForL2.push(getScopedMediaCacheKey(fn, effectiveScope, effectiveWsKey));
                    if (!isPure) {
                        candidateKeysForL2.push(getScopedMediaCacheKey(dp, effectiveScope, effectiveWsKey));
                    }
                }
            }
        }
        void getBatchPersistentMediaItems(candidateKeysForL2).then((l2Hits) => {
            if (isDisposed)
                return;
            let hitAnyL2 = false;
            if (l2Hits && l2Hits.size > 0) {
                for (const [key, dataUrl] of l2Hits.entries()) {
                    if (dataUrl && !resolvedMediaCache.has(key)) {
                        resolvedMediaCache.set(key, dataUrl);
                        if (key.includes('cover')) {
                            cacheCoverImage(key, dataUrl);
                        }
                        hitAnyL2 = true;
                    }
                }
            }
            if (hitAnyL2) {
                setCacheVersion(v => v + 1);
                anyLoaded = true;
            }
            // 仅对 L2 依然 miss 且未处于负缓存中的项发起跨进程 RPC 读盘
            const remainingTargets = targetsToLoad.filter((dp) => {
                const nd = dp.replace(/\\/g, '/');
                const fn = nd.replace(/^.*[\\/]/, '');
                const sk = getScopedMediaCacheKey(fn, effectiveScope, effectiveWsKey);
                return (!resolvedMediaCache.has(nd) &&
                    (!sk || !resolvedMediaCache.has(sk)) &&
                    !isMediaFailed(nd) &&
                    (!sk || !isMediaFailed(sk)));
            });
            if (remainingTargets.length === 0) {
                return;
            }
            // 【中文修复依据】：按关键视口优先级排序，头条与次条封面优先，插图末尾，保障首屏秒开
            const prioritySorted = [...remainingTargets].sort((a, b) => {
                const score = (p) => {
                    const fn = p.replace(/^.*[\\/]/, '').toLowerCase();
                    if (fn.includes('cover_1') || fn === 'cover.png')
                        return 1;
                    if (fn.includes('cover_'))
                        return 2;
                    if (fn.startsWith('pic_'))
                        return 3;
                    return 4;
                };
                return score(a) - score(b);
            });
            const processTarget = async (diskPath) => {
                const normDisk = diskPath.replace(/\\/g, '/');
                const diskFileName = normDisk.replace(/^.*[\\/]/, '');
                const scopedDiskKey = getScopedMediaCacheKey(diskFileName, effectiveScope, effectiveWsKey);
                if (resolvedMediaCache.has(normDisk) ||
                    (scopedDiskKey && resolvedMediaCache.has(scopedDiskKey)) ||
                    inFlightLoadsRef.current.has(normDisk) ||
                    isMediaFailed(normDisk) ||
                    (scopedDiskKey && isMediaFailed(scopedDiskKey))) {
                    return;
                }
                inFlightLoadsRef.current.add(normDisk);
                let loaded = false;
                try {
                    if (activeServices.fileService?.readMediaPreview) {
                        const candidates = resolveCandidatePaths(diskPath, workspacePath, accountId, dynamicScripts);
                        for (const candPath of candidates) {
                            try {
                                const filePreview = await activeServices.fileService.readMediaPreview({
                                    path: candPath,
                                    maxBytes: 15 * 1024 * 1024,
                                });
                                if (filePreview?.dataBase64) {
                                    const dataUrl = `data:${filePreview.mediaType || 'image/png'};base64,${filePreview.dataBase64}`;
                                    const normCandPath = candPath.replace(/\\/g, '/');
                                    const candFileName = normCandPath.replace(/^.*[\\/]/, '');
                                    const keysToRecord = [
                                        normCandPath,
                                        (!isArticleVisualName(candFileName) || normDisk.includes('/')) ? normDisk : '',
                                        effectiveScope && candFileName ? getScopedMediaCacheKey(candFileName, effectiveScope, effectiveWsKey) : '',
                                        effectiveScope && diskFileName ? getScopedMediaCacheKey(diskFileName, effectiveScope, effectiveWsKey) : '',
                                    ].filter(Boolean);
                                    for (const raw of rawUrls) {
                                        if (!raw)
                                            continue;
                                        const normRaw = extractLocalDiskPathFromUrl(raw).replace(/\\/g, '/');
                                        if (normRaw === normDisk) {
                                            const rawFileName = normRaw.replace(/^.*[\\/]/, '');
                                            if (!isArticleVisualName(rawFileName) || normRaw.includes('/')) {
                                                keysToRecord.push(raw.trim());
                                            }
                                        }
                                    }
                                    recordResolvedMedia(keysToRecord, dataUrl);
                                    loaded = true;
                                    anyLoaded = true;
                                    break;
                                }
                            }
                            catch { }
                        }
                    }
                }
                catch (err) {
                    logger.debug('[useResolvedMediaUrls] 解析本地配图异常', { path: diskPath, error: String(err) });
                }
                finally {
                    inFlightLoadsRef.current.delete(normDisk);
                    if (!loaded) {
                        const failTtl = isSandboxScope(effectiveScope) ? 2000 : 30_000;
                        recordFailedMedia([normDisk, diskPath, scopedDiskKey].filter(Boolean), failTtl);
                    }
                }
            };
            // 限制最大并发度为 4，消除大图集中 RPC 造成的渲染进程卡顿
            const runPool = async () => {
                let cursor = 0;
                const workers = Array.from({ length: Math.min(4, prioritySorted.length) }, async () => {
                    while (cursor < prioritySorted.length && !isDisposed) {
                        const dp = prioritySorted[cursor++];
                        if (dp)
                            await processTarget(dp);
                    }
                });
                await Promise.all(workers);
            };
            void runPool().then(() => {
                if (isDisposed)
                    return;
                if (anyLoaded) {
                    setCacheVersion(v => v + 1);
                }
                // 【中文修复依据】：最多重试 3 次，使用指数退避（2s, 4s, 8s），且仅在未全部记入负缓存时重试
                const hasUnresolved = remainingTargets.some((dp) => {
                    const nd = dp.replace(/\\/g, '/');
                    return !resolvedMediaCache.has(nd);
                });
                if (hasUnresolved && retryCountRef.current < 3) {
                    const delay = Math.min(2000 * Math.pow(2, retryCountRef.current), 8000);
                    retryTimerRef.current = setTimeout(() => {
                        if (!isDisposed) {
                            retryCountRef.current += 1;
                            setRetryVersion(rv => rv + 1);
                        }
                    }, delay);
                }
                else {
                    retryCountRef.current = 0;
                }
            });
        });
        return () => {
            isDisposed = true;
            if (retryTimerRef.current) {
                clearTimeout(retryTimerRef.current);
                retryTimerRef.current = null;
            }
        };
        // 【中文修复依据】：严禁将 cacheVersion 加入依赖数组，使用 targetsKey 阻断数组对象自激死循环
    }, [targetsKey, activeServices, workspacePath, accountId, scriptsDir, effectiveScope, retryVersion]);
    // 根据当前缓存返回最新已解析的 URL 列表
    return useMemo(() => {
        return rawUrls.map((raw) => {
            if (!raw)
                return '';
            const trimmed = raw.trim();
            if (trimmed.startsWith('http://') ||
                trimmed.startsWith('https://') ||
                trimmed.startsWith('data:')) {
                return trimmed;
            }
            const diskPath = extractLocalDiskPathFromUrl(trimmed);
            const normDisk = diskPath.replace(/\\/g, '/');
            const fileName = normDisk.replace(/^.*[\\/]/, '');
            const scopedKey = effectiveScope ? getScopedMediaCacheKey(fileName, effectiveScope, effectiveWsKey) : '';
            const scopedRawKey = effectiveScope ? getScopedMediaCacheKey(trimmed, effectiveScope, effectiveWsKey) : '';
            const scopedCover = scopedKey && fileName.includes('cover') ? resolvedCoverCache.get(scopedKey) : undefined;
            return (resolvedMediaCache.get(normDisk) ||
                (scopedKey ? resolvedMediaCache.get(scopedKey) : undefined) ||
                (scopedRawKey ? resolvedMediaCache.get(scopedRawKey) : undefined) ||
                scopedCover ||
                trimmed);
        });
    }, [rawUrls, cacheVersion, effectiveScope]);
}
//# sourceMappingURL=useResolvedMediaUrls.js.map