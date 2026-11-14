import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { memo } from 'react';
import { Check, Loader2 } from 'lucide-react';
import css from '../SocialPublisherComposerCard.module.css';
export const SocialAccountPickerDrawer = memo(function SocialAccountPickerDrawer({ show, selectedPlatforms, platformsMeta, filteredAccounts, effectiveAccounts, selectedAccountIds, selectAllAccounts, loadingAccounts, accountHealthMap, onSelectAll, onToggleAccount, onOpenLoginModal: _onOpenLoginModal, }) {
    if (!show)
        return null;
    return (_jsxs("div", { className: css.accountDrawerPanel, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '6px' }, children: [_jsx("button", { type: "button", onClick: onSelectAll, className: `${css.accountChip} ${selectAllAccounts ? css.accountChipActive : ''}`, children: "\u5168\u90E8\u8D26\u53F7 (\u9ED8\u8BA4)" }), !selectAllAccounts && (_jsx("span", { style: { fontSize: '11px', color: 'var(--dsw-alias-label-caption, #9ca3af)' }, children: "\u5DF2\u5207\u6362\u4E3A\u7CBE\u786E\u6307\u5B9A\u6A21\u5F0F\uFF0C\u4EC5\u6267\u884C\u6240\u52FE\u9009\u7684\u8D26\u53F7" }))] }), selectedPlatforms.map((pKey) => {
                const platOption = platformsMeta.find(p => p.key === pKey);
                const platAccounts = filteredAccounts.filter((acc) => {
                    const pk = acc.platform === 'xhs' ? 'xiaohongshu' : acc.platform;
                    return pk === pKey;
                });
                if (platAccounts.length === 0)
                    return null;
                const platSelectedCount = effectiveAccounts.filter(a => (a.platform === 'xhs' ? 'xiaohongshu' : a.platform) === pKey).length;
                return (_jsxs("div", { className: css.accountGroupCard, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11.5px' }, children: [_jsxs("span", { style: { fontWeight: 600, color: 'var(--dsw-alias-label-primary, #111827)', display: 'flex', alignItems: 'center', gap: '4px' }, children: [_jsx("span", { children: platOption?.label || pKey }), _jsxs("span", { style: { color: 'var(--dsw-alias-label-caption, #9ca3af)', fontWeight: 400 }, children: ["(", platAccounts.length, "\u4E2A\u53EF\u7528)"] })] }), !selectAllAccounts && platSelectedCount === 0 && (_jsx("span", { style: { color: 'var(--dsw-alias-label-caption, #9ca3af)', fontSize: '11px' }, children: "\u672A\u9009\u8D26\u53F7 (\u4E0D\u53D1\u5E03\u8BE5\u5E73\u53F0)" }))] }), _jsx("div", { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' }, children: platAccounts.map((account) => {
                                const isChecked = !selectAllAccounts && selectedAccountIds.includes(account.id);
                                const health = accountHealthMap[account.id];
                                const isHealthy = health?.valid === true;
                                const isExpired = health?.valid === false;
                                const isChecking = health?.checking === true;
                                return (_jsx("div", { style: { display: 'flex', alignItems: 'center' }, children: _jsxs("button", { type: "button", onClick: () => onToggleAccount(account.id), title: health?.userName
                                            ? `已授权创作者：${health.userName}`
                                            : isExpired
                                                ? `登录态已失效或未登录：${health?.error || '请前往设置页账号列表扫码登录'}`
                                                : account.name || account.id, className: `${css.accountChip} ${isChecked ? css.accountChipActive : ''}`, children: [isChecking ? (_jsx(Loader2, { size: 10, style: { animation: 'spin 1s linear infinite' } })) : isHealthy ? (_jsx("span", { style: { width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' } })) : isExpired ? (_jsx("span", { style: { width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b' } })) : (_jsx("span", { style: {
                                                    width: '5px',
                                                    height: '5px',
                                                    borderRadius: '50%',
                                                    background: account.enabled ? '#10b981' : '#9ca3af',
                                                } })), _jsx("span", { children: account.name || account.id }), isChecked && _jsx(Check, { size: 10, strokeWidth: 2.5, style: { color: '#059669' } })] }) }, account.id));
                            }) })] }, pKey));
            }), filteredAccounts.length === 0 && !loadingAccounts ? (_jsx("span", { style: { fontSize: '11px', color: 'var(--dsw-alias-label-caption, #9ca3af)' }, children: "\u5F53\u524D\u6240\u9009\u5E73\u53F0\u672A\u914D\u7F6E\u4EFB\u4F55\u8D26\u53F7" })) : null] }));
});
//# sourceMappingURL=SocialAccountPickerDrawer.js.map