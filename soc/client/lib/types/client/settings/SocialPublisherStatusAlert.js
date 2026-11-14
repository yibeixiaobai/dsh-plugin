import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
export function SocialPublisherStatusAlert({ statusMessage, onClose, }) {
    if (!statusMessage)
        return null;
    return (_jsxs("div", { role: "alert", className: `flex items-start justify-between gap-3 rounded-xl border p-3.5 text-ui-xs transition-all ${statusMessage.type === "success"
            ? "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-300"
            : "border-destructive/25 bg-destructive/[0.08] text-destructive"}`, children: [_jsxs("div", { className: "flex items-start gap-2.5", children: [statusMessage.type === "success" ? (_jsx(CheckCircle2, { className: "size-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" })) : (_jsx(AlertCircle, { className: "size-4 shrink-0 text-destructive mt-0.5" })), _jsx("span", { className: "leading-relaxed font-medium", children: statusMessage.text })] }), _jsx("button", { type: "button", onClick: onClose, className: "text-foreground-subtle hover:text-foreground p-0.5 rounded transition-colors", title: "\u5173\u95ED\u63D0\u793A", children: _jsx(X, { className: "size-3.5" }) })] }));
}
//# sourceMappingURL=SocialPublisherStatusAlert.js.map