import { useState, useCallback, useEffect } from 'react';
import { publisherApiFetch, safeParseJson } from '../../../settings/SocialPublisherTypes.js';
export function useSocialAccountsHealth(socialPublisherRpc, effectiveAccounts) {
    const [accountHealthMap, setAccountHealthMap] = useState({});
    const checkSingleAccount = useCallback(async (platform, accountId) => {
        setAccountHealthMap(prev => ({
            ...prev,
            [accountId]: { ...prev[accountId], checking: true },
        }));
        try {
            const platNorm = platform === 'xiaohongshu' ? 'xhs' : platform === 'wechat' ? 'gzh' : platform;
            const res = await publisherApiFetch(`/api/gzh-publisher/login/${platNorm}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ account_id: accountId, action: 'check' }),
            }, socialPublisherRpc);
            const parsed = await safeParseJson(res);
            const isValid = parsed.ok ? Boolean(parsed.data?.logged_in) : false;
            setAccountHealthMap(prev => ({
                ...prev,
                [accountId]: {
                    valid: isValid,
                    checking: false,
                    userName: parsed.data?.user_name,
                    error: parsed.data?.error,
                },
            }));
        }
        catch {
            setAccountHealthMap(prev => ({
                ...prev,
                [accountId]: { valid: false, checking: false, error: '检测超时或异常' },
            }));
        }
    }, [socialPublisherRpc]);
    const checkEffectiveAccountsHealth = useCallback(async (targets) => {
        if (!targets || targets.length === 0)
            return;
        const accountsPayload = targets.map(a => ({
            platform: a.platform === 'xiaohongshu' ? 'xhs' : a.platform === 'wechat' ? 'gzh' : a.platform || 'gzh',
            account_id: a.id,
        }));
        setAccountHealthMap((prev) => {
            const next = { ...prev };
            for (const t of targets) {
                next[t.id] = { ...next[t.id], checking: true };
            }
            return next;
        });
        try {
            const res = await publisherApiFetch('/api/gzh-publisher/login/batch-check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accounts: accountsPayload }),
            }, socialPublisherRpc);
            const parsed = await safeParseJson(res);
            if (parsed.ok && parsed.data?.results) {
                const results = parsed.data.results;
                setAccountHealthMap((prev) => {
                    const next = { ...prev };
                    for (const [aid, resData] of Object.entries(results)) {
                        next[aid] = {
                            valid: Boolean(resData?.logged_in),
                            checking: false,
                            userName: resData?.user_name,
                            error: resData?.error,
                        };
                    }
                    return next;
                });
                return;
            }
        }
        catch { }
        await Promise.all(targets.map(a => checkSingleAccount(a.platform || 'gzh', a.id)));
    }, [checkSingleAccount, socialPublisherRpc]);
    useEffect(() => {
        if (effectiveAccounts.length === 0)
            return;
        const timer = setTimeout(() => {
            checkEffectiveAccountsHealth(effectiveAccounts);
        }, 200);
        return () => clearTimeout(timer);
    }, [effectiveAccounts, checkEffectiveAccountsHealth]);
    return {
        accountHealthMap,
        checkSingleAccount,
        checkEffectiveAccountsHealth,
    };
}
//# sourceMappingURL=useSocialAccountsHealth.js.map