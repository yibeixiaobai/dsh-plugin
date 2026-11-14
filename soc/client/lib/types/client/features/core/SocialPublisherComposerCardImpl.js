import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from 'react';
import { Send, AlertCircle, ChevronDown, ChevronUp, ShieldCheck, ShieldAlert, SlidersHorizontal } from 'lucide-react';
import { useOptionalServices } from '../../compat/hooks/useServices.js';
import { publisherApiFetch, safeParseJson, normalizeAccountsList } from '../../settings/SocialPublisherTypes.js';
import { SocialAccountPickerDrawer } from './components/SocialAccountPickerDrawer.js';
import { SocialComposerHeader } from './components/SocialComposerHeader.js';
import { useMembership } from '../../compat/hooks/useMembership.js';
import { SocialPublisherComposerModals } from './components/SocialPublisherComposerModals.js';
import { SocialPlatformGridPicker } from './components/SocialPlatformGridPicker.js';
import { SocialViralSparksBar } from './components/SocialViralSparksBar.js';
import { useSocialComposerAccounts } from './utils/useSocialComposerAccounts.js';
import { buildSocialComposerPrompts } from './utils/socialComposerPromptBuilder.js';
import { PLATFORMS } from './utils/socialPlatformsMeta.js';
import { SocialPublisherModelPicker } from './components/SocialPublisherModelPicker.js';
import { SocialPublisherWorkspacePicker } from './components/SocialPublisherWorkspacePicker.js';
import css from './SocialPublisherComposerCard.module.css';
export function SocialPublisherComposerCard({ onClose, onSubmit, disabled = false, modelSelectionView, defaultModelSelection, sessionId, workspacePath, }) {
    const services = useOptionalServices();
    const socialPublisherRpc = services?.socialPublisherService ?? null;
    const [selectedPlatforms, setSelectedPlatforms] = useState(['gzh']);
    const [selectedAccountIds, setSelectedAccountIds] = useState([]);
    const [selectAllAccounts, setSelectAllAccounts] = useState(true);
    const [showAccountDrawer, setShowAccountDrawer] = useState(false);
    const [isDryRun, setIsDryRun] = useState(true);
    const [notes, setNotes] = useState('');
    const [accounts, setAccounts] = useState([]);
    const [loadingAccounts, setLoadingAccounts] = useState(false);
    const [errorMessage, setErrorMessage] = useState(null);
    const [loginModalState, setLoginModalState] = useState({ open: false, platform: 'gzh', accountId: '', accountName: '' });
    const [preflightGateOpen, setPreflightGateOpen] = useState(false);
    const [featureGateOpen, setFeatureGateOpen] = useState(false);
    const { checkFeature, profile } = useMembership();
    const [unreadyAccountsList, setUnreadyAccountsList] = useState([]);
    const [currentWorkspacePath, setCurrentWorkspacePath] = useState(workspacePath || '');
    useEffect(() => {
        if (workspacePath && !currentWorkspacePath)
            setCurrentWorkspacePath(workspacePath);
    }, [workspacePath, currentWorkspacePath]);
    const [selectedUnifiedModel, setSelectedUnifiedModel] = useState(defaultModelSelection
        ? { provider: defaultModelSelection.provider, model: defaultModelSelection.model }
        : null);
    useEffect(() => {
        if (defaultModelSelection && !selectedUnifiedModel) {
            setSelectedUnifiedModel({ provider: defaultModelSelection.provider, model: defaultModelSelection.model });
        }
    }, [defaultModelSelection, selectedUnifiedModel]);
    const fetchAccounts = useCallback(async () => {
        setLoadingAccounts(true);
        try {
            const res = await publisherApiFetch('/api/gzh-publisher/config/export?include_secrets=true&download=false', {}, socialPublisherRpc);
            const parsed = await safeParseJson(res);
            if (parsed.ok) {
                const rawConfig = parsed.data.config || parsed.data;
                setAccounts(normalizeAccountsList(rawConfig.accounts));
                if (rawConfig.runtime?.dry_run !== undefined)
                    setIsDryRun(Boolean(rawConfig.runtime.dry_run));
            }
        }
        catch (error) {
            console.warn('[SocialPublisherComposerCard] 加载账号失败:', error);
        }
        finally {
            setLoadingAccounts(false);
        }
    }, [socialPublisherRpc]);
    useEffect(() => {
        fetchAccounts();
    }, [fetchAccounts]);
    const { filteredAccounts, effectiveAccounts, effectivePlatforms, accountHealthMap, checkSingleAccount, } = useSocialComposerAccounts({
        accounts,
        socialAccountsLimit: profile?.privileges.socialAccountsLimit,
        selectedPlatforms,
        selectedAccountIds,
        selectAllAccounts,
        socialPublisherRpc,
    });
    const togglePlatform = (platformKey) => {
        setSelectedPlatforms(prev => prev.includes(platformKey) ? (prev.length === 1 ? prev : prev.filter(k => k !== platformKey)) : [...prev, platformKey]);
    };
    const toggleAccount = (accountId) => {
        setSelectAllAccounts(false);
        setSelectedAccountIds(prev => prev.includes(accountId) ? prev.filter(id => id !== accountId) : [...prev, accountId]);
    };
    const doSubmit = useCallback((platformsToSubmit = effectivePlatforms, notesToSubmit = notes, selectAll = selectAllAccounts, accountsToUse = effectiveAccounts) => {
        if (!selectAll && accountsToUse.length === 0) {
            setErrorMessage('请至少选择一个执行账号，或点击切换为「全部账号」');
            return;
        }
        if (platformsToSubmit.length === 0) {
            setErrorMessage('当前所选账号无对应生效发布平台，请重新选择');
            return;
        }
        setErrorMessage(null);
        const effectiveWorkspace = currentWorkspacePath || workspacePath;
        const { formattedPrompt, accountsPlan } = buildSocialComposerPrompts({
            platformsToSubmit,
            accountsToUse,
            selectAll,
            notesToSubmit,
            isDryRun,
            platformsMeta: PLATFORMS,
            sessionId,
            workspacePath: effectiveWorkspace,
        });
        onSubmit({
            platforms: platformsToSubmit,
            accountIds: accountsToUse.map((a) => String(a.id || '')).filter(Boolean),
            selectAllAccounts: selectAll,
            topic: '',
            notes: notesToSubmit.trim(),
            formattedPrompt,
            accountsPlan,
            unifiedModel: selectedUnifiedModel || undefined,
            workspacePath: effectiveWorkspace,
        });
    }, [currentWorkspacePath, effectiveAccounts, effectivePlatforms, isDryRun, notes, onSubmit, selectAllAccounts, selectedUnifiedModel, sessionId, workspacePath]);
    const handleSubmit = async (e) => {
        if (effectiveAccounts.length > 1) {
            const gate = await checkFeature('social_matrix_concurrency');
            if (!gate.allowed) {
                setFeatureGateOpen(true);
                return;
            }
        }
        if (e)
            e.preventDefault();
        if (!isDryRun) {
            const unready = effectiveAccounts.filter((a) => a.id && accountHealthMap[a.id]?.valid === false);
            if (unready.length > 0) {
                setUnreadyAccountsList(unready);
                setPreflightGateOpen(true);
                return;
            }
        }
        doSubmit();
    };
    return (_jsxs("div", { className: css.card, "data-testid": "social-publisher-composer-card", children: [_jsx(SocialComposerHeader, { isDryRun: isDryRun, selectedPlatformsCount: selectedPlatforms.length, onClose: onClose }), _jsx(SocialPlatformGridPicker, { selectedPlatforms: selectedPlatforms, onTogglePlatform: togglePlatform }), _jsxs("div", { className: css.accountBar, children: [_jsxs("div", { className: css.accountBarTop, children: [_jsxs("div", { className: css.accountBarTitle, children: [effectiveAccounts.some((a) => a.id && accountHealthMap[a.id]?.valid === false) ? (_jsx(ShieldAlert, { size: 12, style: { color: '#f59e0b', flexShrink: 0 } })) : (_jsx(ShieldCheck, { size: 12, style: { color: '#10b981', flexShrink: 0 } })), _jsx("span", { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: selectAllAccounts
                                            ? `全自动免密发布 (${effectiveAccounts.length} 个账号)`
                                            : `指定账号 (${effectiveAccounts.length} 个)` })] }), _jsxs("button", { type: "button", onClick: () => setShowAccountDrawer(v => !v), className: css.accountSettingsToggle, title: "\u9009\u62E9\u7279\u5B9A\u53D1\u5E03\u8D26\u53F7", children: [_jsx(SlidersHorizontal, { size: 11 }), _jsx("span", { children: "\u8D26\u53F7\u8BBE\u7F6E" }), showAccountDrawer ? (_jsx(ChevronUp, { size: 11 })) : (_jsx(ChevronDown, { size: 11 }))] })] }), _jsx(SocialAccountPickerDrawer, { show: showAccountDrawer, selectedPlatforms: selectedPlatforms, platformsMeta: PLATFORMS, filteredAccounts: filteredAccounts, effectiveAccounts: effectiveAccounts, selectedAccountIds: selectedAccountIds, selectAllAccounts: selectAllAccounts, loadingAccounts: loadingAccounts, accountHealthMap: accountHealthMap, onSelectAll: () => {
                            setSelectAllAccounts(true);
                            setSelectedAccountIds([]);
                        }, onToggleAccount: toggleAccount, onOpenLoginModal: (acc) => {
                            setLoginModalState({
                                open: true,
                                platform: acc.platform === 'xhs' ? 'xiaohongshu' : acc.platform || 'gzh',
                                accountId: acc.id,
                                accountName: acc.name || acc.id,
                            });
                        } })] }), _jsxs("div", { className: css.composerInputArea, children: [_jsxs("div", { className: css.inputAreaHeader, children: [_jsx("span", { className: css.inputAreaTitle, children: "\u5B9A\u5236\u8981\u6C42 / \u9009\u9898\u7075\u611F" }), _jsx("span", { className: css.inputAreaHint, children: "\u7559\u7A7A\u5219\u5168\u81EA\u52A8\u70ED\u70B9\u5DE1\u822A" })] }), _jsx("textarea", { rows: 3, value: notes, onChange: (e) => {
                            setNotes(e.target.value);
                            if (errorMessage)
                                setErrorMessage(null);
                        }, disabled: disabled, placeholder: "\u4F8B\u5982\uFF1A\u56F4\u7ED5\u672C\u5468\u6700\u65B0\u884C\u4E1A\u524D\u6CBF\u70ED\u70B9\u5199\u4E00\u7BC7\u6DF1\u5EA6\u7EFC\u8FF0\uFF0C\u8981\u6C42\u903B\u8F91\u4E25\u5BC6\uFF0C\u5E76\u9488\u5BF9\u5C0F\u7EA2\u4E66\u751F\u6210 4 \u5F20 3:4 \u7AD6\u7248\u56FE\u6587...", className: css.textarea }), _jsx(SocialViralSparksBar, { onSelectPrompt: (prompt) => {
                            setNotes(prompt);
                            if (errorMessage)
                                setErrorMessage(null);
                        } })] }), errorMessage && (_jsxs("div", { className: css.errorMessage, children: [_jsx(AlertCircle, { size: 12, style: { flexShrink: 0 } }), _jsx("span", { children: errorMessage })] })), _jsxs("div", { className: css.footer, children: [_jsxs("div", { className: css.footerLeft, children: [_jsx(SocialPublisherWorkspacePicker, { currentWorkspacePath: currentWorkspacePath, onSelectWorkspacePath: setCurrentWorkspacePath, disabled: disabled }), _jsxs("div", { className: css.modeHint, children: [_jsx(ShieldCheck, { size: 13, style: { flexShrink: 0 } }), _jsx("span", { children: isDryRun ? '演练模式（不耗额度·不发布）' : '实盘模式 · 选题查重 · 真实排版 · 一键多发' })] })] }), _jsxs("div", { className: css.footerRight, children: [_jsx(SocialPublisherModelPicker, { modelSelectionView: modelSelectionView, value: selectedUnifiedModel, onChange: setSelectedUnifiedModel, disabled: disabled }), _jsxs("button", { type: "button", disabled: disabled ||
                                    (!selectAllAccounts && effectiveAccounts.length === 0) ||
                                    effectivePlatforms.length === 0, onClick: () => handleSubmit(), className: css.submitBtn, children: [_jsx("span", { children: effectiveAccounts.length > 1
                                            ? `启动矩阵并行 (${effectiveAccounts.length}账号)`
                                            : '开始执行' }), _jsx(Send, { size: 12, style: { flexShrink: 0 } })] })] })] }), _jsx(SocialPublisherComposerModals, { loginModalState: loginModalState, setLoginModalState: setLoginModalState, checkSingleAccount: checkSingleAccount, preflightGateOpen: preflightGateOpen, setPreflightGateOpen: setPreflightGateOpen, unreadyAccountsList: unreadyAccountsList, doSubmit: doSubmit, effectivePlatforms: effectivePlatforms, notes: notes, selectAllAccounts: selectAllAccounts, effectiveAccounts: effectiveAccounts, setErrorMessage: setErrorMessage, featureGateOpen: featureGateOpen, setFeatureGateOpen: setFeatureGateOpen })] }));
}
//# sourceMappingURL=SocialPublisherComposerCardImpl.js.map