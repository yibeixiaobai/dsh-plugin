import { useMemo } from 'react';
import { resolveEffectiveSocialAccounts } from '../../../compat/types.js';
import { useSocialAccountsHealth } from './useSocialAccountsHealth.js';
export function useSocialComposerAccounts(params) {
    const { accounts, socialAccountsLimit = 1, selectedPlatforms, selectedAccountIds, selectAllAccounts, socialPublisherRpc, } = params;
    const quotaResult = useMemo(() => resolveEffectiveSocialAccounts(accounts, socialAccountsLimit), [accounts, socialAccountsLimit]);
    const filteredAccounts = useMemo(() => {
        return quotaResult.activeAccounts.filter((acc) => {
            const platformKey = acc.platform === 'xhs' ? 'xiaohongshu' : acc.platform;
            return selectedPlatforms.includes(platformKey);
        });
    }, [quotaResult.activeAccounts, selectedPlatforms]);
    const effectiveAccounts = useMemo(() => {
        if (selectAllAccounts)
            return filteredAccounts;
        return quotaResult.activeAccounts.filter((a) => a.id && selectedAccountIds.includes(a.id));
    }, [selectAllAccounts, filteredAccounts, quotaResult.activeAccounts, selectedAccountIds]);
    const { accountHealthMap, checkSingleAccount } = useSocialAccountsHealth(socialPublisherRpc, effectiveAccounts);
    const effectivePlatforms = useMemo(() => {
        if (selectAllAccounts)
            return selectedPlatforms;
        const derived = new Set();
        effectiveAccounts.forEach((acc) => {
            const pKey = (acc.platform === 'xhs' ? 'xiaohongshu' : acc.platform);
            if (pKey)
                derived.add(pKey);
        });
        return Array.from(derived);
    }, [selectAllAccounts, selectedPlatforms, effectiveAccounts]);
    return {
        quotaResult,
        filteredAccounts,
        effectiveAccounts,
        effectivePlatforms,
        accountHealthMap,
        checkSingleAccount,
    };
}
//# sourceMappingURL=useSocialComposerAccounts.js.map