/**
 * 社媒中间画布配图、排版正文与品牌配置本地持久化缓存存储库 (IndexedDB + 内存降级)
 * 【中文修复依据】：彻底根治重新打开会话、刷新或重新挂载画布时配图和文章“慢慢加载”与“骨架屏频繁闪烁”的问题。
 * 引入 L2 本地持久化存储，与 L1 内存 Map 配合形成秒开流水线，避免每次跨进程 RPC 逐个读盘转码。
 */
/**
 * 从持久化存储中批量读取配图 Data URL
 */
export declare function getBatchPersistentMediaItems(keys: readonly string[]): Promise<Map<string, string>>;
/**
 * 异步写入单个配图至本地持久化存储
 */
export declare function putPersistentMediaItem(key: string, dataUrl: string): Promise<void>;
/**
 * 移除特定的配图持久化缓存项
 */
export declare function removePersistentMediaItem(key: string): Promise<void>;
/**
 * 读取已持久化的文章正文 HTML / 排版产物
 */
export declare function getPersistentArticleContent(filePathOrKey: string): Promise<string | null>;
/**
 * 异步写入文章正文 HTML / 排版产物至持久化存储
 */
export declare function putPersistentArticleContent(filePathOrKey: string, content: string): Promise<void>;
/**
 * 读取已持久化的账号品牌图与样式配置
 */
export declare function getPersistentBrandAsset(accountId: string): Promise<{
    brandTopUrl?: string;
    brandBotUrl?: string;
    config?: any;
} | null>;
/**
 * 异步写入账号品牌图与样式配置至持久化存储
 */
export declare function putPersistentBrandAsset(accountId: string, data: {
    brandTopUrl?: string;
    brandBotUrl?: string;
    config?: any;
}): Promise<void>;
/**
 * 清空所有社媒本地持久化缓存
 */
export declare function clearAllPersistentCache(): Promise<void>;
//# sourceMappingURL=socialPublisherPersistentStorage.d.ts.map