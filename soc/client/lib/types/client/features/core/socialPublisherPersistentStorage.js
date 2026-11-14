/**
 * 社媒中间画布配图、排版正文与品牌配置本地持久化缓存存储库 (IndexedDB + 内存降级)
 * 【中文修复依据】：彻底根治重新打开会话、刷新或重新挂载画布时配图和文章“慢慢加载”与“骨架屏频繁闪烁”的问题。
 * 引入 L2 本地持久化存储，与 L1 内存 Map 配合形成秒开流水线，避免每次跨进程 RPC 逐个读盘转码。
 */
const DB_NAME = 'wincode_social_cache_v1';
const DB_VERSION = 1;
const STORE_MEDIA = 'media_items';
const STORE_ARTICLES = 'article_contents';
const STORE_BRANDS = 'brand_assets';
const MAX_MEDIA_ITEMS = 400;
// 内存降级兜底（用于 Node.js 单测环境或不支持/受限环境）
const memoryMediaFallback = new Map();
const memoryArticleFallback = new Map();
const memoryBrandFallback = new Map();
function isIndexedDBAvailable() {
    return (typeof window !== 'undefined' &&
        typeof window.indexedDB !== 'undefined' &&
        typeof window.indexedDB.open === 'function');
}
let dbPromise = null;
function getDb() {
    if (!isIndexedDBAvailable()) {
        return Promise.resolve(null);
    }
    if (dbPromise) {
        return dbPromise;
    }
    dbPromise = new Promise((resolve) => {
        try {
            const request = window.indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_MEDIA)) {
                    const store = db.createObjectStore(STORE_MEDIA, { keyPath: 'key' });
                    store.createIndex('updatedAt', 'updatedAt', { unique: false });
                }
                if (!db.objectStoreNames.contains(STORE_ARTICLES)) {
                    db.createObjectStore(STORE_ARTICLES, { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains(STORE_BRANDS)) {
                    db.createObjectStore(STORE_BRANDS, { keyPath: 'key' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
        }
        catch {
            resolve(null);
        }
    });
    return dbPromise;
}
/**
 * 从持久化存储中批量读取配图 Data URL
 */
export async function getBatchPersistentMediaItems(keys) {
    const result = new Map();
    if (!keys || keys.length === 0)
        return result;
    const db = await getDb();
    if (!db) {
        for (const k of keys) {
            const hit = memoryMediaFallback.get(k);
            if (hit)
                result.set(k, hit.dataUrl);
        }
        return result;
    }
    return new Promise((resolve) => {
        try {
            const tx = db.transaction(STORE_MEDIA, 'readonly');
            const store = tx.objectStore(STORE_MEDIA);
            let pending = keys.length;
            for (const k of keys) {
                const req = store.get(k);
                req.onsuccess = () => {
                    if (req.result?.dataUrl) {
                        result.set(k, req.result.dataUrl);
                    }
                    pending -= 1;
                    if (pending === 0)
                        resolve(result);
                };
                req.onerror = () => {
                    pending -= 1;
                    if (pending === 0)
                        resolve(result);
                };
            }
        }
        catch {
            resolve(result);
        }
    });
}
/**
 * 异步写入单个配图至本地持久化存储
 */
export async function putPersistentMediaItem(key, dataUrl) {
    if (!key || !dataUrl)
        return;
    const now = Date.now();
    const record = { key, dataUrl, updatedAt: now };
    const db = await getDb();
    if (!db) {
        memoryMediaFallback.set(key, record);
        return;
    }
    try {
        const tx = db.transaction(STORE_MEDIA, 'readwrite');
        const store = tx.objectStore(STORE_MEDIA);
        store.put(record);
        // 轻量级异步容量治理（LRU淘汰超额配图）
        tx.oncomplete = () => {
            pruneMediaCacheIfNeeded(db).catch(() => { });
        };
    }
    catch {
        memoryMediaFallback.set(key, record);
    }
}
/**
 * 当图片缓存总数超过上限时，修剪淘汰最旧的 50 条
 */
async function pruneMediaCacheIfNeeded(db) {
    try {
        const countTx = db.transaction(STORE_MEDIA, 'readonly');
        const countReq = countTx.objectStore(STORE_MEDIA).count();
        countReq.onsuccess = () => {
            const count = countReq.result;
            if (count > MAX_MEDIA_ITEMS) {
                const pruneTx = db.transaction(STORE_MEDIA, 'readwrite');
                const store = pruneTx.objectStore(STORE_MEDIA);
                const index = store.index('updatedAt');
                const cursorReq = index.openCursor();
                let deleted = 0;
                cursorReq.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor && deleted < 50) {
                        cursor.delete();
                        deleted += 1;
                        cursor.continue();
                    }
                };
            }
        };
    }
    catch {
        // 静默容错
    }
}
/**
 * 移除特定的配图持久化缓存项
 */
export async function removePersistentMediaItem(key) {
    if (!key)
        return;
    memoryMediaFallback.delete(key);
    const db = await getDb();
    if (!db)
        return;
    try {
        const tx = db.transaction(STORE_MEDIA, 'readwrite');
        tx.objectStore(STORE_MEDIA).delete(key);
    }
    catch {
        // 静默容错
    }
}
/**
 * 读取已持久化的文章正文 HTML / 排版产物
 */
export async function getPersistentArticleContent(filePathOrKey) {
    if (!filePathOrKey)
        return null;
    const normKey = filePathOrKey.replace(/\\/g, '/');
    const db = await getDb();
    if (!db) {
        return memoryArticleFallback.get(normKey)?.content || null;
    }
    return new Promise((resolve) => {
        try {
            const tx = db.transaction(STORE_ARTICLES, 'readonly');
            const req = tx.objectStore(STORE_ARTICLES).get(normKey);
            req.onsuccess = () => resolve(req.result?.content || null);
            req.onerror = () => resolve(null);
        }
        catch {
            resolve(null);
        }
    });
}
/**
 * 异步写入文章正文 HTML / 排版产物至持久化存储
 */
export async function putPersistentArticleContent(filePathOrKey, content) {
    if (!filePathOrKey || !content)
        return;
    const normKey = filePathOrKey.replace(/\\/g, '/');
    const record = { key: normKey, content, updatedAt: Date.now() };
    const db = await getDb();
    if (!db) {
        memoryArticleFallback.set(normKey, record);
        return;
    }
    try {
        const tx = db.transaction(STORE_ARTICLES, 'readwrite');
        tx.objectStore(STORE_ARTICLES).put(record);
    }
    catch {
        memoryArticleFallback.set(normKey, record);
    }
}
/**
 * 读取已持久化的账号品牌图与样式配置
 */
export async function getPersistentBrandAsset(accountId) {
    if (!accountId)
        return null;
    const db = await getDb();
    if (!db) {
        const hit = memoryBrandFallback.get(accountId);
        return hit ? { brandTopUrl: hit.brandTopUrl, brandBotUrl: hit.brandBotUrl, config: hit.config } : null;
    }
    return new Promise((resolve) => {
        try {
            const tx = db.transaction(STORE_BRANDS, 'readonly');
            const req = tx.objectStore(STORE_BRANDS).get(accountId);
            req.onsuccess = () => {
                if (req.result) {
                    resolve({
                        brandTopUrl: req.result.brandTopUrl,
                        brandBotUrl: req.result.brandBotUrl,
                        config: req.result.config,
                    });
                }
                else {
                    resolve(null);
                }
            };
            req.onerror = () => resolve(null);
        }
        catch {
            resolve(null);
        }
    });
}
/**
 * 异步写入账号品牌图与样式配置至持久化存储
 */
export async function putPersistentBrandAsset(accountId, data) {
    if (!accountId)
        return;
    const record = {
        key: accountId,
        brandTopUrl: data.brandTopUrl,
        brandBotUrl: data.brandBotUrl,
        config: data.config,
        updatedAt: Date.now(),
    };
    const db = await getDb();
    if (!db) {
        memoryBrandFallback.set(accountId, record);
        return;
    }
    try {
        const tx = db.transaction(STORE_BRANDS, 'readwrite');
        tx.objectStore(STORE_BRANDS).put(record);
    }
    catch {
        memoryBrandFallback.set(accountId, record);
    }
}
/**
 * 清空所有社媒本地持久化缓存
 */
export async function clearAllPersistentCache() {
    memoryMediaFallback.clear();
    memoryArticleFallback.clear();
    memoryBrandFallback.clear();
    const db = await getDb();
    if (!db)
        return;
    try {
        const tx = db.transaction([STORE_MEDIA, STORE_ARTICLES, STORE_BRANDS], 'readwrite');
        tx.objectStore(STORE_MEDIA).clear();
        tx.objectStore(STORE_ARTICLES).clear();
        tx.objectStore(STORE_BRANDS).clear();
    }
    catch {
        // 静默容错
    }
}
//# sourceMappingURL=socialPublisherPersistentStorage.js.map