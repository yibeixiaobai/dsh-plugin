export interface AccountHealthInfo {
    valid?: boolean;
    checking?: boolean;
    userName?: string;
    error?: string;
}
export declare function useSocialAccountsHealth(socialPublisherRpc: any, effectiveAccounts: any[]): {
    accountHealthMap: Record<string, AccountHealthInfo>;
    checkSingleAccount: (platform: string, accountId: string) => Promise<void>;
    checkEffectiveAccountsHealth: (targets: any[]) => Promise<void>;
};
//# sourceMappingURL=useSocialAccountsHealth.d.ts.map