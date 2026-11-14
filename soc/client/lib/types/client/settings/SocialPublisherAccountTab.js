import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import css from "./SocialPublisherSettings.module.css";
import { Button } from "../compat/components/ui/button.js";
import { Switch } from "../compat/components/ui/switch.js";
import { Plus, Trash2, Copy, CheckCircle2, AlertCircle, ShieldCheck, Crown, AlertTriangle, } from "lucide-react";
import { resolveEffectiveSocialAccounts, normalizeAccountsList, } from "../compat/types.js";
import { DEFAULT_PLATFORM_INFO, PLATFORM_MAP, DEFAULT_BRAND_IMAGES_CONFIG, mergeAccountBrandImages, } from "./SocialPublisherBrandHelpers.js";
import { SocialPublisherAccountLoginCard } from "./SocialPublisherAccountLoginCard.js";
import { SocialPublisherAccountForm } from "./SocialPublisherAccountForm.js";
import { useMembership } from "../compat/hooks/useMembership.js";
import { MembershipUpgradeDialog } from "./MembershipUpgradeDialog.js";
export function SocialPublisherAccountTab({ config, setConfig, selectedAccountId, setSelectedAccountId, revealSecrets, setRevealSecrets, triggerLogin, loginStatusMap, checkingLogin, checkLoginStatus, loginingAccountId, fetchConfig, }) {
    const accountsList = useMemo(() => normalizeAccountsList(config.accounts), [config.accounts]);
    const currentAccount = useMemo(() => accountsList.find((a) => a.id === selectedAccountId) || accountsList[0] || {}, [accountsList, selectedAccountId]);
    const updateCurrentAccount = (patch) => {
        setConfig((prev) => ({
            ...prev,
            // [中文修复依据]：账号更新深拷贝隔离，杜绝跨账号引用污染
            accounts: normalizeAccountsList(prev.accounts).map((a) => {
                if (a.id !== selectedAccountId)
                    return a;
                const cloned = JSON.parse(JSON.stringify(a));
                return {
                    ...cloned,
                    ...patch,
                    brand_images: mergeAccountBrandImages(cloned.brand_images, patch.brand_images),
                };
            }),
        }));
    };
    const isGzh = currentAccount.platform === "gzh";
    const autoOriginal = Boolean(currentAccount.wechat?.auto_enable_original ?? currentAccount.auto_enable_original);
    const needsBrowserSession = !(isGzh &&
        currentAccount.publish_mode !== "browser" &&
        !autoOriginal);
    const { profile } = useMembership();
    const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);
    const [upgradeReason, setUpgradeReason] = useState("");
    const accountLimit = profile?.privileges.socialAccountsLimit ?? 1;
    const currentTier = profile?.tier ?? "free";
    const tierLabel = currentTier === "platinum" ? "铂金会员" : currentTier === "pro" ? "高级会员" : "普通会员";
    const quotaResult = useMemo(() => resolveEffectiveSocialAccounts(accountsList, accountLimit), [accountsList, accountLimit]);
    const isQuotaFull = accountLimit !== -1 && quotaResult.activeCount >= accountLimit;
    return (_jsxs("div", { className: "space-y-6", "data-testid": "social-publisher-account-tab", children: [_jsxs("div", { className: "flex flex-col gap-3 rounded-xl border border-card-border bg-card/60 p-4 shadow-2xs backdrop-blur-md sm:flex-row sm:items-center sm:justify-between", children: [_jsxs("div", { className: "space-y-1", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("h3", { className: "text-ui-base font-bold text-foreground", children: "\u793E\u5A92\u77E9\u9635\u53D1\u5E03\u8D26\u53F7" }), _jsxs("span", { className: "rounded-full border border-border bg-surface px-2.5 py-0.5 text-ui-xs text-foreground-subtle", children: [quotaResult.activeCount, " \u4E2A\u751F\u6548 \u00B7 ", quotaResult.disabledCount, " \u4E2A\u5DF2\u505C\u7528 \u00B7 \u5171", " ", accountsList.length, " \u4E2A"] })] }), _jsx("p", { className: "text-ui-xs text-foreground-subtle", children: "\u914D\u7F6E\u516C\u4F17\u53F7\u3001\u77E5\u4E4E\u3001\u5C0F\u7EA2\u4E66\u3001\u767E\u5BB6\u53F7\u4E0E\u5934\u6761\u53F7\u7684\u53D1\u5E03\u51ED\u636E\u4E0E\u6388\u6743\u4F1A\u8BDD" })] }), _jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsxs("div", { className: "flex items-center gap-1.5 rounded-lg border border-border/80 bg-surface/80 px-2.5 py-1 text-ui-xs text-foreground-subtle", children: [_jsx(Crown, { className: "size-3.5 text-amber-500 shrink-0" }), _jsxs("span", { children: ["\u914D\u989D: ", quotaResult.activeCount, " / ", accountLimit === -1 ? "无限" : `${accountLimit}个`, " ", "(", tierLabel, ")"] }), isQuotaFull && (_jsx("button", { type: "button", onClick: () => {
                                            setUpgradeReason("升级会员解锁更多社媒账号生效配额");
                                            setUpgradeDialogOpen(true);
                                        }, className: "ml-1 font-medium text-primary hover:underline cursor-pointer", children: "\u5347\u7EA7" }))] }), _jsxs(Button, { type: "button", variant: "outline", size: "sm", onClick: () => {
                                    const newId = `account_${Date.now().toString().slice(-4)}`;
                                    // [中文修复依据]：克隆账号深拷贝完整数据结构，杜绝与源账号共享 brand_images 对象引用
                                    const clonedSource = JSON.parse(JSON.stringify(currentAccount || {}));
                                    const newAcc = {
                                        ...clonedSource,
                                        id: newId,
                                        name: `${currentAccount.name || "新账号"}-克隆`,
                                        enabled: !isQuotaFull,
                                    };
                                    setConfig((prev) => ({
                                        ...prev,
                                        accounts: [...normalizeAccountsList(prev.accounts), newAcc],
                                    }));
                                    setSelectedAccountId(newId);
                                }, className: "h-8 gap-1 text-ui-xs", children: [_jsx(Copy, { className: "size-3.5" }), _jsx("span", { children: "\u514B\u9686" })] }), _jsxs(Button, { type: "button", variant: "default", size: "sm", onClick: () => {
                                    const newId = `account_${Date.now().toString().slice(-4)}`;
                                    const newAcc = {
                                        id: newId,
                                        name: "新社媒账号",
                                        platform: "gzh",
                                        enabled: !isQuotaFull,
                                        publish_mode: "api",
                                        publish_immediately: false,
                                        wechat: { appid: "", app_secret: "", author_name: "", brand_name: "" },
                                        content: { articles_per_day: 6, min_words: 2000, topics: [], forbidden_words: [] },
                                        // [中文修复依据]：新建账号赋予完全独立的 brand_images 出厂深拷贝，杜绝引用全局配置
                                        brand_images: JSON.parse(JSON.stringify(DEFAULT_BRAND_IMAGES_CONFIG)),
                                    };
                                    setConfig((prev) => ({
                                        ...prev,
                                        accounts: [...normalizeAccountsList(prev.accounts), newAcc],
                                    }));
                                    setSelectedAccountId(newId);
                                }, className: "h-8 gap-1 text-ui-xs", children: [_jsx(Plus, { className: "size-3.5" }), _jsx("span", { children: "\u65B0\u5EFA\u8D26\u53F7" })] })] })] }), _jsx("div", { className: "grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4", children: quotaResult.items.map((item) => {
                    const acc = item.account;
                    const isSelected = item.id === selectedAccountId;
                    const status = item.status;
                    const pInfo = PLATFORM_MAP[item.platform] ?? DEFAULT_PLATFORM_INFO;
                    const isAccGzh = item.platform === "gzh";
                    const accAutoOriginal = Boolean(acc.wechat?.auto_enable_original ?? acc.auto_enable_original);
                    const accNeedsBrowser = !(isAccGzh && acc.publish_mode !== "browser" && !accAutoOriginal);
                    const isAuthed = loginStatusMap ? loginStatusMap[item.id] : null;
                    return (_jsxs("div", { role: "button", tabIndex: 0, onClick: () => setSelectedAccountId(item.id), onKeyDown: (e) => {
                            if (e.key === "Enter" || e.key === " ")
                                setSelectedAccountId(item.id);
                        }, className: `${css.accountCard} ${isSelected ? css.accountCardSelected : ""} ${status === "disabled" ? css.accountCardDisabled : ""}`, children: [_jsxs("div", { className: "space-y-1.5", children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx("span", { className: "truncate font-semibold text-ui-sm text-foreground", title: item.name, children: item.name }), _jsxs("div", { className: "flex items-center gap-1.5 shrink-0", onClick: (e) => e.stopPropagation(), children: [_jsx("span", { className: `inline-flex items-center rounded border px-1.5 py-0.5 text-ui-xs font-medium ${status === "active"
                                                            ? pInfo.color
                                                            : status === "over_quota"
                                                                ? "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                                                : "border-border bg-muted text-muted-foreground"}`, title: item.reason, children: status === "active"
                                                            ? pInfo.badge
                                                            : status === "over_quota"
                                                                ? "超额未生效"
                                                                : "已停用" }), _jsx(Switch, { checked: acc.enabled !== false, onCheckedChange: (checked) => {
                                                            if (checked && isQuotaFull && acc.enabled === false) {
                                                                setUpgradeReason(`当前有效配额已达上限(${accountLimit}个)，开启后将按顺序处于超额未生效状态。`);
                                                            }
                                                            setConfig((prev) => ({
                                                                ...prev,
                                                                accounts: normalizeAccountsList(prev.accounts).map((a) => a.id === item.id ? { ...a, enabled: checked } : a),
                                                            }));
                                                        }, className: "scale-75 origin-right", title: acc.enabled === false ? "点击启用此账号" : "点击停用此账号" })] })] }), _jsxs("div", { className: "truncate font-mono text-ui-xs text-foreground-subtle", children: ["ID: ", item.id] })] }), _jsxs("div", { className: "mt-3 flex items-center justify-between border-t border-border/40 pt-2 text-ui-xs", children: [_jsx("span", { className: "text-foreground-subtle", children: status === "disabled"
                                            ? "未开启(跳过)"
                                            : status === "over_quota"
                                                ? "超额暂缓"
                                                : acc.publish_mode === "browser"
                                                    ? "免 API 模式"
                                                    : acc.platform === "gzh"
                                                        ? "API 接口"
                                                        : "自动化" }), status === "active" && accNeedsBrowser ? (isAuthed ? (_jsxs("span", { className: "flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium", children: [_jsx(CheckCircle2, { className: "size-3" }), " \u5DF2\u767B\u5F55"] })) : (_jsxs("span", { className: "flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium", children: [_jsx(AlertCircle, { className: "size-3" }), " \u5F85\u626B\u7801"] }))) : status === "active" ? (_jsxs("span", { className: "flex items-center gap-1 text-foreground-subtle", children: [_jsx(ShieldCheck, { className: "size-3 text-muted-foreground" }), " \u7EAFAPI\u514D\u626B\u7801"] })) : status === "over_quota" ? (_jsxs("span", { className: "flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium", title: item.reason, children: [_jsx(AlertTriangle, { className: "size-3" }), " \u8D85\u989D\u4F11\u7720"] })) : (_jsx("span", { className: "text-muted-foreground", children: "\u672A\u542F\u7528" }))] })] }, item.id));
                }) }), _jsxs("div", { className: "space-y-4 rounded-xl border border-card-border bg-card/70 p-5 shadow-2xs backdrop-blur-md", children: [_jsxs("div", { className: "flex items-center justify-between border-b border-border/70 pb-3", children: [_jsxs("div", { className: "flex items-center gap-2.5", children: [_jsxs("h3", { className: "text-ui-base font-bold text-foreground", children: ["\u8D26\u53F7\u914D\u7F6E: ", currentAccount.name || currentAccount.id] }), _jsx("span", { className: "rounded bg-surface-active px-2 py-0.5 font-mono text-ui-xs text-foreground-subtle", children: currentAccount.id })] }), accountsList.length > 1 && (_jsxs(Button, { type: "button", variant: "ghost", size: "sm", className: "h-8 gap-1 text-ui-xs text-destructive hover:bg-destructive/10 hover:text-destructive", onClick: () => {
                                    setConfig((prev) => ({
                                        ...prev,
                                        accounts: normalizeAccountsList(prev.accounts).filter((a) => a.id !== selectedAccountId),
                                    }));
                                    setSelectedAccountId(accountsList.find((a) => a.id !== selectedAccountId)?.id || "");
                                }, children: [_jsx(Trash2, { className: "size-3.5" }), _jsx("span", { children: "\u5220\u9664\u8D26\u53F7" })] }))] }), _jsx(SocialPublisherAccountForm, { currentAccount: currentAccount, selectedAccountId: selectedAccountId, updateCurrentAccount: updateCurrentAccount, revealSecrets: revealSecrets, setRevealSecrets: setRevealSecrets })] }), _jsx(SocialPublisherAccountLoginCard, { currentAccount: currentAccount, selectedAccountId: selectedAccountId, isGzh: isGzh, needsBrowserSession: needsBrowserSession, loginStatusMap: loginStatusMap, checkingLogin: checkingLogin, loginingAccountId: loginingAccountId, checkLoginStatus: checkLoginStatus, triggerLogin: triggerLogin, fetchConfig: fetchConfig }), _jsx(MembershipUpgradeDialog, { open: upgradeDialogOpen, onClose: () => setUpgradeDialogOpen(false), reason: upgradeReason })] }));
}
//# sourceMappingURL=SocialPublisherAccountTab.js.map