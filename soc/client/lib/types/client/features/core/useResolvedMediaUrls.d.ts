import type { IServiceAccessor } from '../../compat/hooks/useServices.js';
import { isSafeMediaUrl, isRenderableImageUrl } from './socialPublisherWorkflowExtractor.js';
import { resolvedMediaCache, mediaCacheListeners, getScopedMediaCacheKey, invalidateMediaCache, isMediaFailed, recordFailedMedia } from './mediaCacheManager.js';
export { isSafeMediaUrl, isRenderableImageUrl, resolvedMediaCache, mediaCacheListeners, getScopedMediaCacheKey, invalidateMediaCache, isMediaFailed, recordFailedMedia, };
export interface UseResolvedMediaUrlsOptions {
    services?: IServiceAccessor | null;
    workspacePath?: string;
    workspaceIdentity?: string;
    accountId?: string;
    scriptsDir?: string;
    sessionId?: string;
}
export declare function useResolvedMediaUrls(rawUrls: readonly string[], options?: UseResolvedMediaUrlsOptions): string[];
//# sourceMappingURL=useResolvedMediaUrls.d.ts.map