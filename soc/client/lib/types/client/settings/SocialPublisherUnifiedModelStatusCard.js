import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { memo, useMemo } from "react";
import { Sparkles, AlertCircle, ArrowUpRight } from "lucide-react";
import { Button } from "../compat/components/ui/button.js";
import { useModelProviders } from "../compat/hooks/useModelProviders.js";
import { useTabStore } from "../compat/store/TabStoreProvider.js";
import { setPendingSettingsSectionIntent } from "../compat/lib/settingsNavigation.js";
import { getProviderFormLabel } from "../compat/lib/providerSettingsFormTypes.js";
export const SocialPublisherUnifiedModelStatusCard = memo(function SocialPublisherUnifiedModelStatusCard() {
    const openSettingsTab = useTabStore((state) => state.openSettingsTab);
    const { modelProviders } = useModelProviders({ workspacePath: "" });
    const activeModel = useMemo(() => {
        for (const p of modelProviders || []) {
            if (!p.enabled)
                continue;
            for (const m of p.models || []) {
                const isImage = m.config?.properties?.outputFormat?.supportsImage === true ||
                    m.personalConfig?.properties?.outputFormat?.supportsImage === true;
                if (isImage && m.config?.enabled !== false) {
                    return {
                        providerName: getProviderFormLabel(p),
                        modelId: m.modelId,
                    };
                }
            }
        }
        return null;
    }, [modelProviders]);
    const handleGoToModelSettings = () => {
        setPendingSettingsSectionIntent("modelProvider");
        openSettingsTab();
    };
    return (_jsxs("div", { className: "flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/[0.03] dark:bg-primary/[0.06] p-3.5 text-ui-xs", children: [_jsxs("div", { className: "flex items-start gap-2.5", children: [activeModel ? (_jsx(Sparkles, { className: "size-4 text-emerald-500 shrink-0 mt-0.5" })) : (_jsx(AlertCircle, { className: "size-4 text-amber-500 shrink-0 mt-0.5" })), _jsxs("div", { className: "space-y-0.5", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "font-semibold text-foreground", children: "AI \u751F\u56FE\u6A21\u578B\u670D\u52A1" }), activeModel ? (_jsxs("span", { className: "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium text-[11px] border border-emerald-500/20", children: ["\u5F53\u524D\u751F\u6548\uFF1A", activeModel.providerName, " / ", activeModel.modelId] })) : (_jsx("span", { className: "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium text-[11px] border border-amber-500/20", children: "\u672A\u914D\u7F6E\u751F\u56FE\u6A21\u578B" }))] }), _jsx("p", { className: "text-foreground-subtle text-ui-2xs leading-relaxed", children: "\u793E\u5A92\u53D1\u5E03\u6A21\u5F0F\u751F\u56FE\u6A21\u578B\u73B0\u5DF2\u7EDF\u4E00\u91C7\u7528\u3010\u6A21\u578B\u8BBE\u7F6E\u3011\u4E2D\u52FE\u9009\u4E86\u751F\u56FE\u8F93\u51FA\u7C7B\u578B\u7684\u6A21\u578B\uFF0C\u4E0D\u518D\u4F7F\u7528\u793E\u5A92\u79C1\u6709\u63A5\u53E3\u6C60\u3002" })] })] }), _jsxs(Button, { type: "button", variant: "outline", size: "sm", onClick: handleGoToModelSettings, className: "h-7 text-ui-xs gap-1 shrink-0 self-start sm:self-center", children: [_jsx("span", { children: "\u6A21\u578B\u8BBE\u7F6E" }), _jsx(ArrowUpRight, { className: "size-3" })] })] }));
});
//# sourceMappingURL=SocialPublisherUnifiedModelStatusCard.js.map