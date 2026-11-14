export const DEFAULT_DESKTOP_CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';
export function buildLocalMediaPreviewUrl(filePath) {
    if (!filePath)
        return '';
    if (filePath.startsWith('http://') || filePath.startsWith('https://') || filePath.startsWith('data:')) {
        return filePath;
    }
    return `dsh-resource://file/${encodeURIComponent(filePath)}`;
}
export function isBrandGeoEnabled() {
    return false;
}
/**
 * 规范化提取账号列表
 */
export function normalizeAccountsList(raw) {
    if (!raw)
        return [];
    if (Array.isArray(raw))
        return raw;
    if (typeof raw === 'object') {
        return Object.entries(raw).map(([id, val]) => ({
            id,
            ...(typeof val === 'object' ? val : {}),
        }));
    }
    return [];
}
/**
 * 按列表自然顺序裁决账号的配额占用与生效状态
 */
export function resolveEffectiveSocialAccounts(accounts, limit = -1) {
    const list = normalizeAccountsList(accounts);
    const effectiveLimit = typeof limit === 'number' ? limit : -1;
    const isUnlimited = effectiveLimit === -1;
    let activeCount = 0;
    let disabledCount = 0;
    let overQuotaCount = 0;
    const activeAccounts = [];
    const items = list.map((acc, index) => {
        const id = String(acc.id || `account_${index}`);
        const name = String(acc.name || id);
        const platform = String(acc.platform || 'gzh');
        const isEnabled = acc.enabled !== false;
        // 1. 未开启账户：不占用配额，不可调用
        if (!isEnabled) {
            disabledCount++;
            return {
                account: acc,
                id,
                name,
                platform,
                status: 'disabled',
                isCallable: false,
                reason: '账号已处于停用状态，不占用会员配额，不可在任务中调用',
            };
        }
        // 2. 已开启账户：检查是否在前 N 个配额内
        if (isUnlimited || activeCount < effectiveLimit) {
            activeCount++;
            activeAccounts.push(acc);
            return {
                account: acc,
                id,
                name,
                platform,
                status: 'active',
                isCallable: true,
                quotaIndex: activeCount,
            };
        }
        // 3. 超额开启账户：按列表顺序超出配额上限，进入超额休眠
        overQuotaCount++;
        return {
            account: acc,
            id,
            name,
            platform,
            status: 'over_quota',
            isCallable: false,
            reason: `超出当前会员等级配额上限（限 ${effectiveLimit} 个），已按顺序自动休眠，任务中严禁调用`,
        };
    });
    return {
        items,
        activeAccounts,
        activeCount,
        disabledCount,
        overQuotaCount,
        limit: effectiveLimit,
    };
}
export function hasSocialPlatformAuthCredentials(accOrPlat, _account, _cookies) {
    return { valid: true, reason: '' };
}
export function getSocialPlatformLoginUrl(platform, _config) {
    switch (platform) {
        case 'gzh':
        case 'wechat':
            return 'https://mp.weixin.qq.com/';
        case 'xiaohongshu':
        case 'xhs':
            return 'https://creator.xiaohongshu.com/login';
        case 'zhihu':
            return 'https://www.zhihu.com/signin';
        case 'baijiahao':
            return 'https://baijiahao.baidu.com/builder/author/register/login';
        case 'toutiao':
            return 'https://mp.toutiao.com/auth/page/login';
        default:
            return 'https://mp.weixin.qq.com/';
    }
}
export function isSocialPlatformSuccessUrl(platform, url) {
    if (!url)
        return false;
    if (platform === 'gzh' || platform === 'wechat')
        return url.includes('cgi-bin/home') || url.includes('cgi-bin/frame');
    if (platform === 'xiaohongshu' || platform === 'xhs')
        return url.includes('creator.xiaohongshu.com/creator/home') || url.includes('/publish');
    if (platform === 'zhihu')
        return url.includes('zhihu.com/creator') || url.includes('zhihu.com/hot');
    if (platform === 'baijiahao')
        return url.includes('baijiahao.baidu.com/builder/rc/home');
    if (platform === 'toutiao')
        return url.includes('mp.toutiao.com/profile_v4/index');
    return false;
}
export function isSocialPlatformLoginUrl(platform, url) {
    return !isSocialPlatformSuccessUrl(platform, url);
}
export function parseCookieString(raw, domain) {
    if (!raw || typeof raw !== 'string')
        return [];
    return raw
        .split(';')
        .map((part) => {
        const [name, ...val] = part.trim().split('=');
        return { name: name?.trim() || '', value: val.join('=').trim(), domain };
    })
        .filter(c => Boolean(c.name));
}
//# sourceMappingURL=types.js.map