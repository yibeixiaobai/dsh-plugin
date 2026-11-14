import { jsx as _jsx } from "react/jsx-runtime";
import { memo, useMemo } from 'react';
import { useTabStore } from '../../../compat/store/TabStoreProvider.js';
import { useWinCodeIntl } from '../../../compat/i18n/IntlProvider.js';
import { setPendingSettingsSectionIntent } from '../../../compat/lib/settingsNavigation.js';
import { ModelConfigSelect } from '../../../compat/ModelConfigSelect.js';
export const SocialPublisherModelPicker = memo(function SocialPublisherModelPicker({ modelSelectionView, value, onChange, disabled = false, }) {
    const { intl } = useWinCodeIntl();
    const openSettingsTab = useTabStore(state => state.openSettingsTab);
    // 从 ModelSelectionView 构建多级 Provider 分组 (与普通模式同构，支持二级子菜单展开)
    const modelGroups = useMemo(() => {
        if (!modelSelectionView?.providers || modelSelectionView.providers.length === 0) {
            return [];
        }
        const groups = [];
        for (const p of modelSelectionView.providers) {
            if (!p.models || p.models.length === 0)
                continue;
            const pLabel = p.providerName?.trim() || p.providerId;
            groups.push({
                key: p.providerId,
                label: pLabel,
                items: p.models.map(m => ({
                    key: `${p.providerId}:${m.modelId}`,
                    value: `${p.providerId}/${m.modelId}`,
                    name: m.modelId,
                })),
            });
        }
        return groups;
    }, [modelSelectionView]);
    // 计算当前有效选中的 normalizedValue: `${providerId}/${modelId}`
    const normalizedValue = useMemo(() => {
        if (value?.provider && value?.model) {
            return `${value.provider}/${value.model}`;
        }
        const firstGroup = modelGroups[0];
        if (firstGroup && firstGroup.items[0]) {
            return firstGroup.items[0].value;
        }
        return '';
    }, [value, modelGroups]);
    // 计算触发按钮的标签显示
    const { triggerLabel, triggerPrefix, triggerModel } = useMemo(() => {
        const defaultLabel = intl.formatMessage({ id: 'chat.toolbar.model' });
        if (!normalizedValue) {
            return { triggerLabel: defaultLabel, triggerPrefix: undefined, triggerModel: defaultLabel };
        }
        const slashIndex = normalizedValue.indexOf('/');
        if (slashIndex > 0) {
            const pId = normalizedValue.slice(0, slashIndex);
            const mId = normalizedValue.slice(slashIndex + 1);
            const targetGroup = modelGroups.find(g => g.key === pId);
            const targetItem = targetGroup?.items.find(item => item.value === normalizedValue);
            const pName = targetGroup?.label || pId;
            const mName = targetItem?.name || mId;
            const full = `${pName}/${mName}`;
            return {
                triggerLabel: full,
                triggerPrefix: `${pName}/`,
                triggerModel: mName,
            };
        }
        return { triggerLabel: normalizedValue, triggerPrefix: undefined, triggerModel: normalizedValue };
    }, [normalizedValue, modelGroups, intl]);
    // 当在二级菜单中点击选择模型时触发
    const handleModelValueChange = (nextValue) => {
        const slashIndex = nextValue.indexOf('/');
        if (slashIndex > 0) {
            const pId = nextValue.slice(0, slashIndex);
            const mId = nextValue.slice(slashIndex + 1);
            const targetGroup = modelGroups.find(g => g.key === pId);
            const targetItem = targetGroup?.items.find(item => item.value === nextValue);
            const pName = targetGroup?.label || pId;
            const mName = targetItem?.name || mId;
            onChange({
                provider: pId,
                model: mId,
                displayName: `${pName}/${mName}`,
            });
            return;
        }
        onChange({
            provider: '',
            model: nextValue,
            displayName: nextValue,
        });
    };
    const handleOpenModelSettings = () => {
        setPendingSettingsSectionIntent('modelProvider');
        openSettingsTab();
    };
    if (modelGroups.length === 0) {
        return null;
    }
    return (_jsx(ModelConfigSelect, { modelGroups: modelGroups, normalizedValue: normalizedValue, triggerLabel: triggerLabel, triggerLabelPrefix: triggerPrefix, triggerLabelValue: triggerModel, showManageModelsAction: true, lockReasonMessage: "", isItemLocked: () => false, manageModelsLabel: intl.formatMessage({
            id: 'chat.toolbar.model.manageModels',
        }), onManageModels: handleOpenModelSettings, onValueChange: handleModelValueChange, disabled: disabled, tooltipTitle: triggerLabel, contentSide: "top", contentAlign: "end", labelVisibilityClassName: "inline-flex", triggerClassName: 
        // 与普通模式一致的微胶囊触发器外观，融入 iPhone 液态玻璃质感
        'h-7 px-2.5 rounded-xl border border-white/60 dark:border-white/15 bg-white/50 dark:bg-white/[0.08] backdrop-blur-xl shadow-[0_2px_8px_rgba(0,0,0,0.03),inset_0_1px_1px_0_rgba(255,255,255,0.85)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.25),inset_0_1px_1px_0_rgba(255,255,255,0.18)] text-ui-xs font-medium text-foreground hover:bg-white/70 dark:hover:bg-white/[0.12] active:scale-[0.985] transition-all cursor-pointer' }));
});
//# sourceMappingURL=SocialPublisherModelPicker.js.map