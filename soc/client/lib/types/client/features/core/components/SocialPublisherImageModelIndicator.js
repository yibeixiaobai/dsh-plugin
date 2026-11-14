import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { memo, useMemo } from 'react';
import { Sparkles, AlertCircle, ExternalLink } from 'lucide-react';
import { useModelProviders } from '../../../compat/hooks/useModelProviders.js';
import { useTabStore } from '../../../compat/store/TabStoreProvider.js';
import { setPendingSettingsSectionIntent } from '../../../compat/lib/settingsNavigation.js';
import { cn } from '../../../compat/components/lib/utils.js';
import { getProviderFormLabel } from '../../../compat/lib/providerSettingsFormTypes.js';
export const SocialPublisherImageModelIndicator = memo(function SocialPublisherImageModelIndicator({ workspacePath = '', disabled = false, }) {
    const openSettingsTab = useTabStore(state => state.openSettingsTab);
    const { modelProviders } = useModelProviders({ workspacePath });
    // 筛选当前项目模型设置中勾选了生图输出类型的模型
    const imageModels = useMemo(() => {
        const list = [];
        for (const p of modelProviders || []) {
            if (!p.enabled)
                continue;
            for (const m of p.models || []) {
                const isImage = m.config?.properties?.outputFormat?.supportsImage === true ||
                    m.personalConfig?.properties?.outputFormat?.supportsImage === true;
                if (isImage && m.config?.enabled !== false) {
                    list.push({
                        providerId: p.providerId,
                        providerName: getProviderFormLabel(p),
                        modelId: m.modelId,
                        modelName: m.modelId,
                    });
                }
            }
        }
        return list;
    }, [modelProviders]);
    const activeModel = imageModels[0] || null;
    const handleOpenSettings = () => {
        setPendingSettingsSectionIntent('modelProvider');
        openSettingsTab();
    };
    if (activeModel) {
        return (_jsxs("button", { type: "button", onClick: handleOpenSettings, disabled: disabled, title: `社媒生图模型：${activeModel.providerName} / ${activeModel.modelName}\n（默认采用模型设置中勾选了生图输出类型的模型，点击前往模型设置调整）`, className: cn('group inline-flex items-center gap-1.5 h-7 px-2.5 rounded-xl text-ui-xs font-medium cursor-pointer transition-all', 'border border-white/60 dark:border-white/15 bg-white/50 dark:bg-white/[0.08] backdrop-blur-xl', 'shadow-[0_2px_8px_rgba(0,0,0,0.03),inset_0_1px_1px_0_rgba(255,255,255,0.85)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.25),inset_0_1px_1px_0_rgba(255,255,255,0.18)]', 'hover:bg-white/70 dark:hover:bg-white/[0.12] active:scale-[0.985]', 'text-foreground'), children: [_jsx(Sparkles, { className: "size-3 text-emerald-500 shrink-0" }), _jsx("span", { className: "text-[11px] text-foreground-subtle hidden sm:inline", children: "\u751F\u56FE:" }), _jsx("span", { className: "truncate max-w-[120px] text-[11px] font-semibold text-foreground", children: activeModel.modelName }), _jsx(ExternalLink, { className: "size-2.5 opacity-0 group-hover:opacity-60 transition-opacity shrink-0 ml-0.5 text-foreground-subtle" })] }));
    }
    return (_jsxs("button", { type: "button", onClick: handleOpenSettings, disabled: disabled, title: "\u5F53\u524D\u9879\u76EE\u672A\u5728\u6A21\u578B\u8BBE\u7F6E\u4E2D\u52FE\u9009\u751F\u56FE\u6A21\u578B\u3002\u6F14\u7EC3\u6A21\u5F0F\u5C06\u751F\u6210\u6F14\u7EC3\u56FE\uFF0C\u5B9E\u76D8\u6A21\u5F0F\u9700\u524D\u5F80\u6A21\u578B\u8BBE\u7F6E\u5F00\u542F\u751F\u56FE\u6A21\u6001\u3002\u70B9\u51FB\u524D\u5F80\u914D\u7F6E\u3002", className: cn('group inline-flex items-center gap-1.5 h-7 px-2 rounded-xl text-[11px] font-medium cursor-pointer transition-all', 'border border-amber-500/30 bg-amber-500/[0.08] text-amber-700 dark:text-amber-300 backdrop-blur-xl', 'hover:bg-amber-500/[0.15] active:scale-[0.985]'), children: [_jsx(AlertCircle, { className: "size-3 text-amber-500 shrink-0" }), _jsx("span", { className: "truncate max-w-[130px]", children: "\u672A\u8BBE\u751F\u56FE\u6A21\u578B" }), _jsx(ExternalLink, { className: "size-2.5 opacity-60 group-hover:opacity-100 transition-opacity shrink-0" })] }));
});
//# sourceMappingURL=SocialPublisherImageModelIndicator.js.map