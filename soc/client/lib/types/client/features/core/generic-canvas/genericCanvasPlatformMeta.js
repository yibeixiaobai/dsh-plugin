/**
 * 通用专栏长图文（知乎、今日头条、百家号）画布平台元信息与样式定义
 * [中文修复依据]：将平台样式元数据抽离，保持组件极简专注与符合 400 行架构约束。
 */
export function resolveGenericPlatformMeta(platform) {
    if (platform === 'toutiao') {
        return {
            label: '今日头条',
            badge: '头条文章',
            badgeClass: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
            ratioLabel: '16:9',
            aspectRatio: 'aspect-[16/9]',
            subtitle: '头条号创作者 · 优质资讯流排版仿真',
        };
    }
    if (platform === 'baijiahao') {
        return {
            label: '百家号',
            badge: '百度百家号',
            badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
            ratioLabel: '2.35:1',
            aspectRatio: 'aspect-[2.35/1]',
            subtitle: '百度内容创作者 · 百家号专栏排版仿真',
        };
    }
    return {
        label: '知乎专栏',
        badge: '知乎专栏',
        badgeClass: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
        ratioLabel: '16:9',
        aspectRatio: 'aspect-[16/9]',
        subtitle: '知乎创作者 · 盐选与专栏排版仿真',
    };
}
//# sourceMappingURL=genericCanvasPlatformMeta.js.map