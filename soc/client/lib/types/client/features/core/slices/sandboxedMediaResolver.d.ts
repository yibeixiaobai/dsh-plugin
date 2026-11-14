/**
 * 任务沙箱媒体资源与预览寻址切片 (Sandboxed Media Resolver)
 * 职责：负责将任务沙箱内的相对/绝对物料路径解析为安全的本地预览 URL，并计算微光骨架屏状态
 */
export interface MediaResolutionParams {
    rawUrlOrPath?: string;
    workspacePath?: string;
    workspaceIdentity?: string;
    sessionId?: string;
    scriptsDir?: string;
}
/**
 * 将物料路径解析为可供前端高保真渲染的安全预览 URL
 */
export declare function resolveSafeMediaPreviewUrl(params: MediaResolutionParams): string | undefined;
/**
 * 判断图片槽位是否正处于微光生成中
 */
export declare function isMediaSlotPending(status?: string, hasImage?: boolean): boolean;
//# sourceMappingURL=sandboxedMediaResolver.d.ts.map