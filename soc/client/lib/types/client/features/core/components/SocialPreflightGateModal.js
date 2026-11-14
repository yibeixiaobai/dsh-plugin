import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AlertTriangle, QrCode } from 'lucide-react';
import { Button } from '../../../compat/components/ui/button.js';
/**
 * 社媒账号登录态前置预检门禁弹窗
 *
 * 【安全与意图规范】：
 * 演练模式意图严格受全局设置（runtime.dry_run）管控，绝不允许在弹窗中随意篡改系统运行模式；
 * 遇到未就绪账号时，用户可选择立即扫码授权，或仅执行已就绪账号。
 */
export function SocialPreflightGateModal({ open, unreadyAccounts, onClose, onOpenLoginModal, onContinueWithReadyOnly, }) {
    if (!open)
        return null;
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4 animate-in fade-in duration-150", children: _jsxs("div", { className: "flex flex-col gap-3 max-w-md w-full rounded-2xl border border-amber-500/40 bg-card p-4 shadow-xl", children: [_jsxs("div", { className: "flex items-start gap-2.5", children: [_jsx("div", { className: "flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400", children: _jsx(AlertTriangle, { className: "size-4" }) }), _jsxs("div", { className: "flex flex-col gap-0.5", children: [_jsx("h4", { className: "text-ui-sm font-bold text-foreground", children: "\u793E\u5A92\u8D26\u53F7\u767B\u5F55\u6001\u9884\u68C0\u63D0\u9192" }), _jsx("p", { className: "text-ui-2xs text-foreground-muted", children: "\u68C0\u6D4B\u5230\u4EE5\u4E0B\u9009\u4E2D\u8D26\u53F7\u5C1A\u672A\u767B\u5F55\u6216\u4F1A\u8BDD\u51ED\u636E\u5DF2\u5931\u6548\uFF0C\u5B9E\u76D8\u53D1\u5E03\u65F6\u53EF\u80FD\u4F1A\u906D\u9047\u62E6\u622A\uFF1A" })] })] }), _jsx("div", { className: "flex flex-col gap-1.5 rounded-lg border border-border/40 bg-surface/40 p-2.5 max-h-36 overflow-y-auto", children: unreadyAccounts.map(acc => (_jsxs("div", { className: "flex items-center justify-between text-ui-xs py-0.5", children: [_jsxs("span", { className: "font-medium text-foreground", children: [acc.name || acc.id, " (", acc.platform, ")"] }), _jsxs("button", { type: "button", onClick: () => onOpenLoginModal(acc), className: "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer", children: [_jsx(QrCode, { className: "size-2.5" }), _jsx("span", { children: "\u7ACB\u5373\u626B\u7801" })] })] }, acc.id))) }), _jsxs("div", { className: "flex items-center justify-end gap-2 border-t border-border/30 pt-2", children: [_jsx(Button, { type: "button", variant: "ghost", size: "sm", onClick: onClose, className: "h-7 text-ui-2xs cursor-pointer", children: "\u53D6\u6D88" }), _jsx(Button, { type: "button", size: "sm", onClick: onContinueWithReadyOnly, className: "h-7 text-ui-2xs cursor-pointer", children: "\u4EC5\u53D1\u5E03\u5DF2\u5C31\u7EEA\u8D26\u53F7" })] })] }) }));
}
//# sourceMappingURL=SocialPreflightGateModal.js.map