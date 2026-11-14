export declare const resolvedMediaCache: Map<string, string>;
export declare const resolvedCoverCache: Map<string, string>;
export declare const resolvedArticleCache: Map<string, string>;
export declare const resolvedBrandCache: Map<string, {
    brandTopUrl?: string;
    brandBotUrl?: string;
    config?: any;
}>;
export declare const failedMediaCache: Map<string, {
    failedAt: number;
    ttl: number;
}>;
export declare function isMediaFailed(key: string): boolean;
export declare function recordFailedMedia(keys: string[], customTtlMs?: number): void;
export declare function clearFailedMedia(key?: string): void;
export declare const mediaCacheListeners: Set<() => void>;
/**
 * 构造带沙箱/账号/工作区作用域的缓存唯一键
 * 【中文修复依据】：严禁以裸短文件名（如 pic_1.png, cover_1.png）作为全局缓存 key，
 * 相对路径与纯文件名必须强制附带沙箱 scriptsDir 或 accountId 及项目工作区命名空间，彻底杜绝跨任务、跨平台、跨项目配图串用
 */
export declare function getScopedMediaCacheKey(pathOrName: string, scope?: string, workspaceKey?: string): string;
/**
 * 同步将封面图写入 L1 极速内存缓存
 * 【中文修复依据】：严格仅以规范化完整沙箱路径或 ScopedKey 索引，严禁使用裸短文件名（cover_1.png 等）
 * 作为全局 Key 注册，彻底杜绝新任务未生图前从全局缓存偷取上一任务或其它项目的同名封面旧图
 */
export declare function cacheCoverImage(key: string, dataUrl: string): void;
/**
 * 失效或直接刷新某个图片 URL/本地路径的缓存，并通知所有使用它的组件即时重绘
 * 【中文修复依据】：无参调用仅用于广播组件重绘，严禁静默调用 clearAllPersistentCache 毁灭 IndexedDB 持久化成果
 */
export declare function invalidateMediaCache(urlOrPath?: string, directDataUrl?: string, scope?: string): void;
/**
 * 同步将已加载的文章 HTML 写入 L1 内存并异步落盘至 L2 持久化存储
 */
export declare function cacheArticleContent(filePath: string, content: string): void;
/**
 * 同步将已获取的品牌配置与 Data URL 写入 L1 内存并异步落盘至 L2 持久化存储
 */
export declare function cacheBrandAsset(accountId: string, data: {
    brandTopUrl?: string;
    brandBotUrl?: string;
    config?: any;
}): void;
//# sourceMappingURL=mediaCacheManager.d.ts.map