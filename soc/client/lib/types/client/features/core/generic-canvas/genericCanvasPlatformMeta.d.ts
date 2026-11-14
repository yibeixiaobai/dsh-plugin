/**
 * 通用专栏长图文（知乎、今日头条、百家号）画布平台元信息与样式定义
 * [中文修复依据]：将平台样式元数据抽离，保持组件极简专注与符合 400 行架构约束。
 */
export interface GenericPlatformMeta {
    label: string;
    badge: string;
    badgeClass: string;
    ratioLabel: string;
    aspectRatio: string;
    subtitle: string;
}
export declare function resolveGenericPlatformMeta(platform?: string): GenericPlatformMeta;
//# sourceMappingURL=genericCanvasPlatformMeta.d.ts.map