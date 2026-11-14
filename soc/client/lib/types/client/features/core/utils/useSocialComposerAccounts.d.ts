import type { SocialPlatformKey } from './socialPlatformsMeta.js';
export declare function useSocialComposerAccounts(params: {
    accounts: any[];
    socialAccountsLimit?: number;
    selectedPlatforms: SocialPlatformKey[];
    selectedAccountIds: string[];
    selectAllAccounts: boolean;
    socialPublisherRpc: any;
}): {
    quotaResult: import("../../../compat/types.js").SocialAccountsQuotaResult<any>;
    filteredAccounts: any[];
    effectiveAccounts: any[];
    effectivePlatforms: SocialPlatformKey[];
    accountHealthMap: Record<string, import("./useSocialAccountsHealth.js").AccountHealthInfo>;
    checkSingleAccount: (platform: string, accountId: string) => Promise<void>;
};
//# sourceMappingURL=useSocialComposerAccounts.d.ts.map