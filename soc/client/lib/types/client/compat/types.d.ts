export interface ConversationRow {
    id?: string;
    role?: string;
    content?: any;
    toolCalls?: any[];
    [key: string]: any;
}
export type SocialAccountQuotaStatus = 'active' | 'disabled' | 'over_quota';
export interface ResolvedSocialAccount<T = any> {
    account: T;
    id: string;
    name: string;
    platform: string;
    status: SocialAccountQuotaStatus;
    isCallable: boolean;
    quotaIndex?: number;
    reason?: string;
}
export interface SocialAccountsQuotaResult<T = any> {
    items: ResolvedSocialAccount<T>[];
    activeAccounts: T[];
    activeCount: number;
    disabledCount: number;
    overQuotaCount: number;
    limit: number;
}
export declare const DEFAULT_DESKTOP_CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";
export declare function buildLocalMediaPreviewUrl(filePath: string): string;
export declare function isBrandGeoEnabled(): boolean;
/**
 * 规范化提取账号列表
 */
export declare function normalizeAccountsList<T = any>(raw: any): T[];
/**
 * 按列表自然顺序裁决账号的配额占用与生效状态
 */
export declare function resolveEffectiveSocialAccounts<T = any>(accounts: any, limit?: number): SocialAccountsQuotaResult<T>;
export declare function hasSocialPlatformAuthCredentials(accOrPlat: any, _account?: any, _cookies?: any): any;
export declare function getSocialPlatformLoginUrl(platform: string, _config?: any): string;
export declare function isSocialPlatformSuccessUrl(platform: string, url: string): boolean;
export declare function isSocialPlatformLoginUrl(platform: string, url: string): boolean;
export declare function parseCookieString(raw: string, domain?: string): any[];
//# sourceMappingURL=types.d.ts.map