import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { SocialPublisherLoginModal } from '../../../settings/SocialPublisherLoginModal.js';
import { SocialPreflightGateModal } from './SocialPreflightGateModal.js';
import { ProFeatureGateModal } from '../../../settings/ProFeatureGateModal.js';
export function SocialPublisherComposerModals({ loginModalState, setLoginModalState, checkSingleAccount, preflightGateOpen, setPreflightGateOpen, unreadyAccountsList, doSubmit, effectivePlatforms: _effectivePlatforms, notes, selectAllAccounts: _selectAllAccounts, effectiveAccounts, setErrorMessage, featureGateOpen, setFeatureGateOpen, }) {
    return (_jsxs(_Fragment, { children: [loginModalState.open && (_jsx(SocialPublisherLoginModal, { open: loginModalState.open, onOpenChange: open => setLoginModalState(prev => ({ ...prev, open })), platform: loginModalState.platform, accountId: loginModalState.accountId, accountName: loginModalState.accountName, onLoginSuccess: () => {
                    setLoginModalState(prev => ({ ...prev, open: false }));
                    checkSingleAccount(loginModalState.platform, loginModalState.accountId);
                } })), _jsx(SocialPreflightGateModal, { open: preflightGateOpen, unreadyAccounts: unreadyAccountsList, onClose: () => setPreflightGateOpen(false), onOpenLoginModal: (acc) => {
                    setPreflightGateOpen(false);
                    setLoginModalState({
                        open: true,
                        platform: acc.platform === 'xhs' ? 'xiaohongshu' : acc.platform || 'gzh',
                        accountId: acc.id,
                        accountName: acc.name || acc.id,
                    });
                }, onContinueWithReadyOnly: () => {
                    setPreflightGateOpen(false);
                    const readyAccounts = effectiveAccounts.filter(a => !unreadyAccountsList.some(u => u.id === a.id));
                    if (readyAccounts.length > 0)
                        doSubmit(undefined, notes, false, readyAccounts);
                    else
                        setErrorMessage('已无就绪账号可供发布，请先完成扫码登录');
                } }), _jsx(ProFeatureGateModal, { open: featureGateOpen, onOpenChange: setFeatureGateOpen, featureId: "social_matrix_concurrency", featureTitle: "\u793E\u5A92\u591A\u5E73\u53F0\u591A\u8D26\u53F7\u77E9\u9635\u5E76\u53D1\u53D1\u5E03", description: "\u7CFB\u7EDF\u68C0\u6D4B\u5230\u60A8\u5DF2\u52FE\u9009\u591A\u4E2A\u53D1\u5E03\u8D26\u53F7\u3002\u77E9\u9635\u5E76\u53D1\u6267\u884C\u5C06\u4E3A\u6BCF\u4E2A\u8D26\u53F7\u521B\u5EFA\u72EC\u7ACB\u7684 AI \u8C03\u5EA6\u4F1A\u8BDD\u4E0E\u5E76\u53D1\u5185\u5BB9\u751F\u4EA7\uFF0C\u5C5E\u4E8E\u9AD8\u7EA7\u4F1A\u5458\u4E13\u5C5E\u7279\u6743\u3002", onConfirmTrial: () => {
                    doSubmit();
                } })] }));
}
//# sourceMappingURL=SocialPublisherComposerModals.js.map