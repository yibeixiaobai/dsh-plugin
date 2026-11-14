export function getProviderFormLabel(provider) {
    return provider || 'Provider';
}
export function getProviderFormApiKey(target) {
    if (!target)
        return '';
    return target.config?.apiKey || target.config?.api?.key || target.personalConfig?.apiKey || '';
}
//# sourceMappingURL=providerSettingsFormTypes.js.map