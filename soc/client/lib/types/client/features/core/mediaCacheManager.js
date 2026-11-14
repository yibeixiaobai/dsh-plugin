import { extractLocalDiskPathFromUrl } from './socialPublisherWorkflowExtractor.js';
import { putPersistentMediaItem, removePersistentMediaItem, putPersistentArticleContent, putPersistentBrandAsset, } from './socialPublisherPersistentStorage.js';
// 全局 L1 内存配图缓存，避免频繁切换 Tab 或重复渲染时反复读取磁盘和执行 RPC 序列化
export const resolvedMediaCache = new Map();
// 专门的封面图极速内存缓存，按 fileName / scopedKey 索引，保障画布首帧 0ms 秒开无白屏
export const resolvedCoverCache = new Map();
// 全局 L1 内存文章正文缓存，实现组件重新挂载与切 Tab 时的 0ms 同步秒开
export const resolvedArticleCache = new Map();
// 全局 L1 内存品牌配置缓存，实现微信公众号头尾品牌图的 0ms 同步秒开
export const resolvedBrandCache = new Map();
// [中文修复依据]：失败路径负缓存（Negative Cache），支持动态 TTL 机制。
// 对于处于活跃执行期的沙箱任务，TTL 缩短为 2s，物料落盘后迅速自愈；静态失效文件保持 30s。
export const failedMediaCache = new Map();
const DEFAULT_FAILED_TTL_MS = 30_000;
export function isMediaFailed(key) {
    if (!key)
        return false;
    const entry = failedMediaCache.get(key);
    if (!entry)
        return false;
    if (Date.now() - entry.failedAt > entry.ttl) {
        failedMediaCache.delete(key);
        return false;
    }
    return true;
}
export function recordFailedMedia(keys, customTtlMs) {
    const now = Date.now();
    const ttl = typeof customTtlMs === 'number' && customTtlMs > 0 ? customTtlMs : DEFAULT_FAILED_TTL_MS;
    for (const k of keys) {
        if (k) {
            failedMediaCache.set(k, { failedAt: now, ttl });
        }
    }
}
export function clearFailedMedia(key) {
    if (key) {
        failedMediaCache.delete(key);
    }
    else {
        failedMediaCache.clear();
    }
}
export const mediaCacheListeners = new Set();
/**
 * 构造带沙箱/账号/工作区作用域的缓存唯一键
 * 【中文修复依据】：严禁以裸短文件名（如 pic_1.png, cover_1.png）作为全局缓存 key，
 * 相对路径与纯文件名必须强制附带沙箱 scriptsDir 或 accountId 及项目工作区命名空间，彻底杜绝跨任务、跨平台、跨项目配图串用
 */
export function getScopedMediaCacheKey(pathOrName, scope, workspaceKey) {
    const trimmed = pathOrName.trim();
    const cleanScope = (scope || 'global').replace(/\\/g, '/').replace(/\/+$/, '');
    const cleanWs = (workspaceKey || '').replace(/\\/g, '/').replace(/\/+$/, '');
    const wsPrefix = cleanWs ? `${cleanWs}::` : '';
    if (/^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith('/')) {
        return `${wsPrefix}${trimmed.replace(/\\/g, '/')}`;
    }
    return `${wsPrefix}${cleanScope}::${trimmed}`;
}
/**
 * 同步将封面图写入 L1 极速内存缓存
 * 【中文修复依据】：严格仅以规范化完整沙箱路径或 ScopedKey 索引，严禁使用裸短文件名（cover_1.png 等）
 * 作为全局 Key 注册，彻底杜绝新任务未生图前从全局缓存偷取上一任务或其它项目的同名封面旧图
 */
export function cacheCoverImage(key, dataUrl) {
    if (!key || !dataUrl)
        return;
    const normKey = key.replace(/\\/g, '/');
    resolvedCoverCache.set(normKey, dataUrl);
}
/**
 * 失效或直接刷新某个图片 URL/本地路径的缓存，并通知所有使用它的组件即时重绘
 * 【中文修复依据】：无参调用仅用于广播组件重绘，严禁静默调用 clearAllPersistentCache 毁灭 IndexedDB 持久化成果
 */
export function invalidateMediaCache(urlOrPath, directDataUrl, scope) {
    if (urlOrPath) {
        const trimmed = urlOrPath.trim();
        const diskPath = extractLocalDiskPathFromUrl(trimmed);
        const fileName = trimmed.replace(/^.*[\\/]/, '');
        const scopedKey = getScopedMediaCacheKey(trimmed, scope);
        const scopedDiskKey = diskPath ? getScopedMediaCacheKey(diskPath, scope) : '';
        const scopedFileKey = fileName ? getScopedMediaCacheKey(fileName, scope) : '';
        if (directDataUrl) {
            if (/^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith('/')) {
                const norm = trimmed.replace(/\\/g, '/');
                resolvedMediaCache.set(norm, directDataUrl);
                void putPersistentMediaItem(norm, directDataUrl);
            }
            if (diskPath && (/^[a-zA-Z]:[\\/]/.test(diskPath) || diskPath.startsWith('/'))) {
                const normD = diskPath.replace(/\\/g, '/');
                resolvedMediaCache.set(normD, directDataUrl);
                void putPersistentMediaItem(normD, directDataUrl);
            }
            if (scopedKey) {
                resolvedMediaCache.set(scopedKey, directDataUrl);
                void putPersistentMediaItem(scopedKey, directDataUrl);
            }
            if (scopedDiskKey) {
                resolvedMediaCache.set(scopedDiskKey, directDataUrl);
                void putPersistentMediaItem(scopedDiskKey, directDataUrl);
            }
            if (scopedFileKey) {
                resolvedMediaCache.set(scopedFileKey, directDataUrl);
                void putPersistentMediaItem(scopedFileKey, directDataUrl);
            }
            if (fileName && fileName.includes('cover')) {
                // 【中文修复依据】：严禁以裸短文件名（如 cover_1.png）注册全局缓存，必须带作用域，杜绝跨任务跨账号串图
                if (scopedFileKey)
                    cacheCoverImage(scopedFileKey, directDataUrl);
            }
        }
        else {
            const normTrimmed = trimmed.replace(/\\/g, '/');
            resolvedMediaCache.delete(normTrimmed);
            clearFailedMedia(normTrimmed);
            void removePersistentMediaItem(normTrimmed);
            if (diskPath) {
                const normDisk = diskPath.replace(/\\/g, '/');
                resolvedMediaCache.delete(normDisk);
                clearFailedMedia(normDisk);
                void removePersistentMediaItem(normDisk);
            }
            if (scopedKey) {
                resolvedMediaCache.delete(scopedKey);
                clearFailedMedia(scopedKey);
                void removePersistentMediaItem(scopedKey);
            }
            if (scopedDiskKey) {
                resolvedMediaCache.delete(scopedDiskKey);
                void removePersistentMediaItem(scopedDiskKey);
            }
            if (scopedFileKey) {
                resolvedMediaCache.delete(scopedFileKey);
                void removePersistentMediaItem(scopedFileKey);
            }
            if (fileName) {
                resolvedCoverCache.delete(fileName);
                if (scopedFileKey)
                    resolvedCoverCache.delete(scopedFileKey);
            }
            if (scope) {
                const cleanScope = scope.replace(/\\/g, '/').replace(/\/+$/, '');
                for (const [k] of resolvedMediaCache.entries()) {
                    if (k.startsWith(`${cleanScope}::`)) {
                        resolvedMediaCache.delete(k);
                        void removePersistentMediaItem(k);
                    }
                }
            }
        }
    }
    else if (scope) {
        const cleanScope = scope.replace(/\\/g, '/').replace(/\/+$/, '');
        for (const [k] of resolvedMediaCache.entries()) {
            if (k.startsWith(`${cleanScope}::`)) {
                resolvedMediaCache.delete(k);
                void removePersistentMediaItem(k);
            }
        }
    }
    else {
        // 仅清理内存缓存以触发组件重新比对，严禁误清空 L2 IndexedDB 持久化存储
        resolvedMediaCache.clear();
        resolvedCoverCache.clear();
        failedMediaCache.clear();
    }
    for (const listener of mediaCacheListeners) {
        listener();
    }
}
/**
 * 同步将已加载的文章 HTML 写入 L1 内存并异步落盘至 L2 持久化存储
 */
export function cacheArticleContent(filePath, content) {
    if (!filePath || !content)
        return;
    const normPath = filePath.replace(/\\/g, '/');
    resolvedArticleCache.set(normPath, content);
    resolvedArticleCache.set(filePath, content);
    void putPersistentArticleContent(normPath, content);
}
/**
 * 同步将已获取的品牌配置与 Data URL 写入 L1 内存并异步落盘至 L2 持久化存储
 */
export function cacheBrandAsset(accountId, data) {
    if (!accountId)
        return;
    resolvedBrandCache.set(accountId, data);
    void putPersistentBrandAsset(accountId, data);
}
//# sourceMappingURL=mediaCacheManager.js.map