export const PLATFORMS = [
    {
        key: 'gzh',
        label: '微信公众号',
        shortLabel: '公众号',
        color: 'text-emerald-600 dark:text-emerald-400',
        selectedColor: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30',
    },
    {
        key: 'xiaohongshu',
        label: '小红书',
        shortLabel: '小红书',
        color: 'text-rose-600 dark:text-rose-400',
        selectedColor: 'border-rose-500/50 bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/30',
    },
    {
        key: 'zhihu',
        label: '知乎专栏',
        shortLabel: '知乎',
        color: 'text-blue-600 dark:text-blue-400',
        selectedColor: 'border-blue-500/50 bg-blue-500/10 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500/30',
    },
    {
        key: 'baijiahao',
        label: '百家号',
        shortLabel: '百家号',
        color: 'text-indigo-600 dark:text-indigo-400',
        selectedColor: 'border-indigo-500/50 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-500/30',
    },
    {
        key: 'toutiao',
        label: '今日头条',
        shortLabel: '头条',
        color: 'text-red-600 dark:text-red-400',
        selectedColor: 'border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300 ring-1 ring-red-500/30',
    },
];
/**
 * 获取平台精准的能力配置与专属视觉样式
 */
export function getPlatformCapability(platform, articleType) {
    const p = (platform || '').toLowerCase();
    // 1. 微信公众号 (含长文与小绿书)
    if (p === 'gzh' || p === 'wechat' || p === 'weixin') {
        const isNewspic = articleType === 'newspic';
        return {
            platform: 'gzh',
            platformDisplayName: isNewspic ? '微信小绿书' : '微信公众号',
            supportsDraft: true,
            // 微信公众号支持通过后台自动化模拟操作（Playwright/Puppeteer）在微信公众平台后台执行定时发表（5 分钟 ~ 7 天）
            supportsSchedule: true,
            supportsDirectPublish: false,
            showPrimeTime: true,
            draftButtonLabel: isNewspic ? '存入公众号小绿书草稿' : '推送到公众号草稿箱',
            publishButtonLabel: isNewspic ? '发布小绿书图文' : '群发公众号长文',
            scheduleButtonLabel: '公众号定时排期',
            themeStyle: {
                accentColor: 'text-emerald-600 dark:text-emerald-400',
                lightBg: 'bg-emerald-500/[0.03]',
                borderHover: 'hover:border-emerald-500/50',
                badgeBg: 'bg-emerald-500/10',
                badgeText: 'text-emerald-700 dark:text-emerald-300',
                badgeBorder: 'border-emerald-500/25',
                primaryBtnClass: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20',
                ringColor: 'ring-emerald-500/20',
            },
            getFormatSummary: (totalCount, index) => {
                if (isNewspic)
                    return '微信小绿书 (3:4 多图卡片 · 瀑布流)';
                if (totalCount > 1) {
                    return index === 0 ? '公众号首篇 (2.35:1 题图 · 13px 单行)' : `公众号次篇 #${index + 1} (1:1 方形封面 · 13px 单行)`;
                }
                return '微信公众号长文排版 (13px 单行 · 2.35:1 题图)';
            },
        };
    }
    // 2. 知乎专栏
    if (p === 'zhihu') {
        return {
            platform: 'zhihu',
            platformDisplayName: '知乎专栏',
            supportsDraft: true,
            supportsSchedule: false, // 知乎专栏无定时发布体系，彻底隐藏定时排期按钮与时段
            supportsDirectPublish: true,
            showPrimeTime: false,
            draftButtonLabel: '存为知乎草稿',
            publishButtonLabel: '一键发布知乎专栏',
            scheduleButtonLabel: '',
            themeStyle: {
                accentColor: 'text-sky-600 dark:text-sky-400',
                lightBg: 'bg-sky-500/[0.03]',
                borderHover: 'hover:border-sky-500/50',
                badgeBg: 'bg-sky-500/10',
                badgeText: 'text-sky-700 dark:text-sky-300',
                badgeBorder: 'border-sky-500/25',
                primaryBtnClass: 'bg-sky-600 hover:bg-sky-700 text-white shadow-sky-600/20',
                ringColor: 'ring-sky-500/20',
            },
            getFormatSummary: () => '知乎专栏 · 深度研报 · Markdown 排版',
        };
    }
    // 3. 小红书
    if (p === 'xiaohongshu' || p === 'xhs') {
        return {
            platform: 'xiaohongshu',
            platformDisplayName: '小红书',
            supportsDraft: true,
            supportsSchedule: true,
            supportsDirectPublish: true,
            showPrimeTime: true,
            draftButtonLabel: '存为小红书草稿',
            publishButtonLabel: '一键发布小红书笔记',
            scheduleButtonLabel: '定时发布笔记',
            themeStyle: {
                accentColor: 'text-rose-600 dark:text-rose-400',
                lightBg: 'bg-rose-500/[0.03]',
                borderHover: 'hover:border-rose-500/50',
                badgeBg: 'bg-rose-500/10',
                badgeText: 'text-rose-700 dark:text-rose-300',
                badgeBorder: 'border-rose-500/25',
                primaryBtnClass: 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20',
                ringColor: 'ring-rose-500/20',
            },
            getFormatSummary: () => '小红书图文笔记 (3:4 竖版多图 · 标签优化)',
        };
    }
    // 4. 今日头条
    if (p === 'toutiao') {
        return {
            platform: 'toutiao',
            platformDisplayName: '今日头条',
            supportsDraft: true,
            supportsSchedule: true,
            supportsDirectPublish: true,
            showPrimeTime: true,
            draftButtonLabel: '存入头条号草稿箱',
            publishButtonLabel: '一键发布头条文章',
            scheduleButtonLabel: '头条定时排期',
            themeStyle: {
                accentColor: 'text-red-600 dark:text-red-400',
                lightBg: 'bg-red-500/[0.03]',
                borderHover: 'hover:border-red-500/50',
                badgeBg: 'bg-red-500/10',
                badgeText: 'text-red-700 dark:text-red-300',
                badgeBorder: 'border-red-500/25',
                primaryBtnClass: 'bg-red-600 hover:bg-red-700 text-white shadow-red-600/20',
                ringColor: 'ring-red-500/20',
            },
            getFormatSummary: () => '头条号专栏文章 · 16:9 横版封面 · 红色强调排版',
        };
    }
    // 5. 百家号
    if (p === 'baijiahao') {
        return {
            platform: 'baijiahao',
            platformDisplayName: '百家号',
            supportsDraft: true,
            supportsSchedule: true,
            supportsDirectPublish: true,
            showPrimeTime: true,
            draftButtonLabel: '存入百家号草稿箱',
            publishButtonLabel: '一键发布百家号文章',
            scheduleButtonLabel: '百家号定时排期',
            themeStyle: {
                accentColor: 'text-indigo-600 dark:text-indigo-400',
                lightBg: 'bg-indigo-500/[0.03]',
                borderHover: 'hover:border-indigo-500/50',
                badgeBg: 'bg-indigo-500/10',
                badgeText: 'text-indigo-700 dark:text-indigo-300',
                badgeBorder: 'border-indigo-500/25',
                primaryBtnClass: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/20',
                ringColor: 'ring-indigo-500/20',
            },
            getFormatSummary: () => '百家号图文 · 2.35:1 宽幅封面 · 搜索收录优化',
        };
    }
    // 兜底通用平台
    return {
        platform: p || 'generic',
        platformDisplayName: '社媒专栏',
        supportsDraft: true,
        supportsSchedule: false,
        supportsDirectPublish: true,
        showPrimeTime: false,
        draftButtonLabel: '存为草稿',
        publishButtonLabel: '一键发布',
        scheduleButtonLabel: '定时发布',
        themeStyle: {
            accentColor: 'text-primary',
            lightBg: 'bg-primary/[0.02]',
            borderHover: 'hover:border-primary/50',
            badgeBg: 'bg-primary/10',
            badgeText: 'text-primary',
            badgeBorder: 'border-primary/20',
            primaryBtnClass: 'bg-primary hover:bg-primary/90 text-primary-foreground',
            ringColor: 'ring-primary/20',
        },
        getFormatSummary: () => '深度图文专栏排版',
    };
}
//# sourceMappingURL=socialPlatformsMeta.js.map