import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from "react";
import { CheckCircle2, Monitor } from "lucide-react";
import { cn } from "../../compat/components/lib/utils.js";
export function SocialPlanAccountSelector({ accounts, selectedAccountId, onSelectAccount, onOpenLoginModal, scheduledCountsByAccount = {}, draftCountsByAccount = {}, }) {
    const gzhAccounts = useMemo(() => {
        return accounts.filter((a) => (a.platform || "gzh") === "gzh");
    }, [accounts]);
    if (gzhAccounts.length === 0) {
        return null;
    }
    return (_jsxs("div", { className: "space-y-2.5", "data-testid": "social-plan-account-selector", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-ui-xs font-semibold tracking-tight text-foreground", children: "\u5FAE\u4FE1\u516C\u4F17\u53F7\u53D1\u5E03\u77E9\u9635" }), _jsxs("span", { className: "rounded-full bg-surface-active px-2 py-0.5 text-[10px] font-mono text-foreground-subtle border border-border/50", children: [gzhAccounts.length, " \u4E2A\u8D26\u53F7"] })] }), _jsx("span", { className: "text-[11px] text-foreground-subtle", children: "\u70B9\u51FB\u5207\u6362\u5F53\u524D\u5DE5\u4F5C\u8D26\u53F7\uFF0C\u4E0B\u65B9\u6392\u671F\u4E0E\u8349\u7A3F\u81EA\u52A8\u8054\u52A8" })] }), _jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5", children: gzhAccounts.map((account) => {
                    const isSelected = account.id === selectedAccountId;
                    const scheduledCount = scheduledCountsByAccount[account.id] ?? 0;
                    const draftCount = draftCountsByAccount[account.id] ?? 0;
                    const displayName = account.name || account.id || "未命名公众号";
                    return (_jsxs("div", { onClick: () => onSelectAccount(account.id), className: cn("group relative flex flex-col justify-between rounded-xl border p-3 cursor-pointer select-none transition-all duration-150", isSelected
                            ? "border-emerald-500/50 bg-emerald-500/[0.04] shadow-xs ring-1 ring-emerald-500/30"
                            : "border-card-border/80 bg-card/60 hover:border-border hover:bg-card/90"), children: [_jsxs("div", { className: "flex items-start justify-between gap-2", children: [_jsxs("div", { className: "flex items-center gap-2.5 min-w-0", children: [_jsx("div", { className: cn("flex size-7 shrink-0 items-center justify-center rounded-lg border text-ui-xs font-bold font-mono transition-colors", isSelected
                                                    ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                                                    : "bg-surface-active/80 border-border/60 text-foreground-subtle"), children: "\u5FAE" }), _jsxs("div", { className: "min-w-0", children: [_jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("span", { className: cn("text-ui-xs font-semibold truncate", isSelected ? "text-foreground" : "text-foreground/80"), title: displayName, children: displayName }), isSelected ? (_jsx(CheckCircle2, { className: "size-3 shrink-0 text-emerald-600 dark:text-emerald-400" })) : null] }), _jsxs("div", { className: "text-[10px] font-mono text-foreground-subtle truncate", children: ["ID: ", account.id] })] })] }), onOpenLoginModal ? (_jsx("button", { type: "button", onClick: (e) => {
                                            e.stopPropagation();
                                            onOpenLoginModal(account.id);
                                        }, className: "shrink-0 p-1 rounded-md text-foreground-subtle hover:text-foreground hover:bg-surface-hover/80 transition-colors", title: "\u626B\u7801\u6388\u6743/\u91CD\u8FDE\u5FAE\u4FE1", children: _jsx(Monitor, { className: "size-3.5" }) })) : null] }), _jsxs("div", { className: "mt-2.5 flex items-center gap-2 border-t border-border/40 pt-2 text-[11px] text-foreground-subtle", children: [_jsxs("span", { className: "flex items-center gap-1", children: [_jsx("span", { children: "\u6392\u671F" }), _jsx("span", { className: "font-mono font-semibold text-emerald-600 dark:text-emerald-400", children: scheduledCount })] }), _jsx("span", { children: "\u00B7" }), _jsxs("span", { className: "flex items-center gap-1", children: [_jsx("span", { children: "\u8349\u7A3F" }), _jsx("span", { className: "font-mono font-semibold text-sky-600 dark:text-sky-400", children: draftCount })] }), _jsx("span", { className: "ml-auto text-[10px] text-foreground-subtle/70", children: isSelected ? "当前选定" : "点击选择" })] })] }, account.id));
                }) })] }));
}
//# sourceMappingURL=SocialPlanAccountSelector.js.map