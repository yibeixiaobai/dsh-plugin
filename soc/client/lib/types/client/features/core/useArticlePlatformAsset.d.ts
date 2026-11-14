import type { ArticleItem } from './socialPublisherWorkflowExtractor.js';
export interface UseArticlePlatformAssetOptions {
    article: ArticleItem;
    workspaceServices?: any;
    socialPublisherRpc?: any;
}
export interface ArticlePlatformAssetResult {
    brandTopRpcUrl: string | null;
    brandBotRpcUrl: string | null;
    brandImagesConfig: any;
    loadedHtml: string | null;
    loadingHtml: boolean;
}
/**
 * 微信公众号/专栏文章正文与品牌资产 SWR（Stale-While-Revalidate）秒开 Hook
 * 【中文修复依据】：将正文与品牌配置的 L1 内存 + L2 IndexedDB 双层加载逻辑独立收敛，
 * 重新打开会话或切换 Tab 时，首帧 0ms 瞬间呈现已有产物，并在后台静默校验，消除骨架屏跳变。
 */
export declare function useArticlePlatformAsset({ article, workspaceServices, socialPublisherRpc, }: UseArticlePlatformAssetOptions): ArticlePlatformAssetResult;
//# sourceMappingURL=useArticlePlatformAsset.d.ts.map