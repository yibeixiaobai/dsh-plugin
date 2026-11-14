export type SocialPlatformKey = 'gzh' | 'zhihu' | 'xiaohongshu' | 'baijiahao' | 'toutiao';
export interface PlatformOption {
    key: SocialPlatformKey;
    label: string;
    shortLabel: string;
    color: string;
    selectedColor: string;
}
export declare const PLATFORMS: PlatformOption[];
export interface SocialAccountTaskPlan {
    accountId: string;
    accountName: string;
    platform: SocialPlatformKey;
    platformLabel: string;
    singlePrompt: string;
    taskId?: string;
    matrixBatchId?: string;
}
export interface SocialPublisherSubmitData {
    platforms: SocialPlatformKey[];
    accountIds: string[];
    selectAllAccounts: boolean;
    topic?: string;
    notes: string;
    formattedPrompt: string;
    accountsPlan: SocialAccountTaskPlan[];
    /** 多会话统一指定的模型选择配置（provider/model） */
    unifiedModel?: {
        provider: string;
        model: string;
        displayName?: string;
    };
    /** 用户在社媒发布卡片中选定的工作区文件夹绝对路径 */
    workspacePath?: string;
}
/**
 * 平台发布能力与专属主题形态
 */
export interface PlatformCapability {
    platform: string;
    platformDisplayName: string;
    supportsDraft: boolean;
    supportsSchedule: boolean;
    supportsDirectPublish: boolean;
    showPrimeTime: boolean;
    draftButtonLabel: string;
    publishButtonLabel: string;
    scheduleButtonLabel: string;
    themeStyle: {
        accentColor: string;
        lightBg: string;
        borderHover: string;
        badgeBg: string;
        badgeText: string;
        badgeBorder: string;
        primaryBtnClass: string;
        ringColor: string;
    };
    getFormatSummary: (totalCount: number, index: number) => string;
}
/**
 * 获取平台精准的能力配置与专属视觉样式
 */
export declare function getPlatformCapability(platform?: string, articleType?: string): PlatformCapability;
//# sourceMappingURL=socialPlatformsMeta.d.ts.map