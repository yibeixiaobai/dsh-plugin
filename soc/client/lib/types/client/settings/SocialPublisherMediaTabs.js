import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ImageQuotaBadge } from "./ImageQuotaBadge.js";
import { useMemo } from "react";
import { Input } from "../compat/components/ui/input.js";
import { Button } from "../compat/components/ui/button.js";
import { Switch } from "../compat/components/ui/switch.js";
import { Plus, Trash2, RefreshCw, Layers } from "lucide-react";
import { WinCodeModelImportDropdown, } from "./WinCodeModelImportDropdown.js";
import { getProviderFormApiKey } from "../compat/lib/providerSettingsFormTypes.js";
function getProvidersList(raw) {
    if (!raw)
        return [];
    if (Array.isArray(raw))
        return raw;
    if (typeof raw === "object") {
        return Object.entries(raw).map(([id, val]) => ({
            id,
            ...(typeof val === "object" ? val : {}),
        }));
    }
    return [];
}
export function SocialPublisherMediaTabs({ config, setConfig, activeTab, testingProvider, testProvider, modelProviders, }) {
    const providersList = useMemo(() => getProvidersList(config.image_providers), [config.image_providers]);
    // 从 WinCode 模型库导入
    const handleImportWinCodeModel = (item) => {
        const newP = {
            id: `${item.providerId}_${item.model.split("/").pop() || "image"}`,
            base_url: item.baseUrl,
            api_key: item.apiKey,
            model: item.model,
            priority: (providersList.length || 0) + 1,
            enabled: true,
            wincodeProviderId: item.providerId,
            wincodeProviderName: item.providerName,
        };
        setConfig((prev) => {
            const list = getProvidersList(prev.image_providers);
            return { ...prev, image_providers: [...list, newP] };
        });
    };
    // 刷新与 WinCode 绑定的凭据
    const handleSyncWinCodeCredentials = (provider) => {
        if (!provider.wincodeProviderId || !modelProviders)
            return;
        const target = modelProviders.find((p) => p.providerId === provider.wincodeProviderId);
        if (!target)
            return;
        const latestKey = getProviderFormApiKey(target);
        const latestBaseUrl = target.config.api?.baseUrl || provider.base_url;
        setConfig((prev) => {
            const list = getProvidersList(prev.image_providers);
            return {
                ...prev,
                image_providers: list.map((p) => p.id === provider.id
                    ? { ...p, api_key: latestKey || p.api_key, base_url: latestBaseUrl || p.base_url }
                    : p),
            };
        });
    };
    if (activeTab === "image_providers") {
        return (_jsxs("div", { className: "space-y-6", "data-testid": "social-publisher-media-tabs", children: [_jsx(ImageQuotaBadge, {}), _jsxs("div", { className: "flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border/70 pb-3", children: [_jsxs("div", { className: "space-y-0.5", children: [_jsx("h4", { className: "text-ui-base font-bold text-foreground", children: "\u591A\u6E20\u9053 AI \u751F\u56FE\u63A5\u53E3\u6C60" }), _jsx("p", { className: "text-ui-xs text-foreground-subtle", children: "\u751F\u56FE\u9047\u5230\u8D85\u65F6\u6216\u914D\u989D\u4E0D\u8DB3\u65F6\uFF0C\u7CFB\u7EDF\u5C06\u6309\u4F18\u5148\u7EA7\u79D2\u7EA7\u5207\u6362\u81F3\u4E0B\u4E00\u4E2A\u53EF\u7528\u63A5\u53E3\u3002\u5DF2\u505C\u7528\u63A5\u53E3\u81EA\u52A8\u8DF3\u8FC7\u3002" })] }), _jsxs("div", { className: "flex items-center gap-2", children: [modelProviders && (_jsx(WinCodeModelImportDropdown, { modelProviders: modelProviders, onImport: handleImportWinCodeModel })), _jsxs(Button, { type: "button", variant: "outline", size: "sm", onClick: () => {
                                        const newP = {
                                            id: `provider_${Date.now().toString().slice(-4)}`,
                                            base_url: "https://api.openai.com/v1",
                                            api_key: "",
                                            model: "dall-e-3",
                                            priority: (providersList.length || 0) + 1,
                                            enabled: true,
                                        };
                                        setConfig((prev) => {
                                            const list = getProvidersList(prev.image_providers);
                                            return { ...prev, image_providers: [...list, newP] };
                                        });
                                    }, className: "h-8 gap-1 text-ui-xs", children: [_jsx(Plus, { className: "size-3.5" }), _jsx("span", { children: "\u81EA\u5B9A\u4E49\u63A5\u53E3" })] })] })] }), _jsx("div", { className: "space-y-3.5", children: providersList.map((provider, idx) => {
                        const isEnabled = provider.enabled !== false;
                        return (_jsxs("div", { className: `rounded-xl border p-4 space-y-3.5 transition-all shadow-2xs backdrop-blur-md ${isEnabled
                                ? "border-card-border bg-card/80"
                                : "border-border/60 bg-surface/40 opacity-70"}`, children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-3", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx("span", { className: "font-semibold text-ui-sm text-foreground", children: provider.id }), provider.wincodeProviderId && (_jsxs("span", { className: "inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-ui-xs text-emerald-600 dark:text-emerald-400 font-medium border border-emerald-500/20", children: [_jsx(Layers, { className: "size-3" }), _jsxs("span", { children: ["\u5DF2\u7ED1\u5B9A\u670D\u52A1\u5546: ", provider.wincodeProviderName || provider.wincodeProviderId] })] })), _jsxs("span", { className: "rounded-full bg-primary/10 px-2 py-0.5 text-ui-xs text-primary font-medium", children: ["\u4F18\u5148\u7EA7: ", provider.priority || idx + 1] }), _jsx("span", { className: `inline-flex items-center rounded border px-2 py-0.5 text-ui-xs font-medium ${isEnabled
                                                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                                        : "bg-muted text-muted-foreground border-border"}`, children: isEnabled ? "启用中" : "已停用" })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("div", { className: "flex items-center gap-1.5 mr-2", children: [_jsx("span", { className: "text-ui-xs text-foreground-subtle font-medium", children: "\u542F\u505C" }), _jsx(Switch, { checked: isEnabled, onCheckedChange: (checked) => {
                                                                setConfig((prev) => {
                                                                    const list = getProvidersList(prev.image_providers);
                                                                    return {
                                                                        ...prev,
                                                                        image_providers: list.map((p) => p.id === provider.id ? { ...p, enabled: checked } : p),
                                                                    };
                                                                });
                                                            }, className: "scale-80 origin-right" })] }), provider.wincodeProviderId && (_jsxs(Button, { type: "button", variant: "ghost", size: "sm", title: "\u4ECE\u670D\u52A1\u5546\u5237\u65B0\u6700\u65B0 API Key \u4E0E Base URL", onClick: () => handleSyncWinCodeCredentials(provider), className: "h-7 text-ui-xs gap-1", children: [_jsx(RefreshCw, { className: "size-3" }), _jsx("span", { children: "\u540C\u6B65\u51ED\u636E" })] })), _jsxs(Button, { type: "button", variant: "outline", size: "sm", onClick: () => testProvider(provider), disabled: testingProvider === provider.id, className: "h-7 text-ui-xs gap-1", children: [_jsx(RefreshCw, { className: `size-3 ${testingProvider === provider.id ? "animate-spin" : ""}` }), _jsx("span", { children: testingProvider === provider.id ? "测试中..." : "测试连接" })] }), _jsx(Button, { type: "button", variant: "ghost", size: "sm", className: "size-7 p-0 text-foreground-subtle hover:text-destructive hover:bg-destructive/10", onClick: () => {
                                                        setConfig((prev) => {
                                                            const list = getProvidersList(prev.image_providers);
                                                            return {
                                                                ...prev,
                                                                image_providers: list.filter((p) => p.id !== provider.id),
                                                            };
                                                        });
                                                    }, title: "\u5220\u9664\u8BE5\u751F\u56FE\u63A5\u53E3", children: _jsx(Trash2, { className: "size-3.5" }) })] })] }), _jsxs("div", { className: "grid gap-3 sm:grid-cols-3", children: [_jsxs("label", { className: "space-y-1 text-ui-xs text-foreground", children: [_jsx("span", { className: "font-medium text-foreground-subtle", children: "Base URL \u63A5\u53E3\u5730\u5740" }), _jsx(Input, { value: provider.base_url || "", onChange: (e) => {
                                                        const val = e.target.value;
                                                        setConfig((prev) => {
                                                            const list = getProvidersList(prev.image_providers);
                                                            return {
                                                                ...prev,
                                                                image_providers: list.map((p) => p.id === provider.id ? { ...p, base_url: val } : p),
                                                            };
                                                        });
                                                    }, className: "h-8.5 font-mono text-ui-xs" })] }), _jsxs("label", { className: "space-y-1 text-ui-xs text-foreground", children: [_jsx("span", { className: "font-medium text-foreground-subtle", children: "Model \u6A21\u578B\u540D\u79F0" }), _jsx(Input, { value: provider.model || "", onChange: (e) => {
                                                        const val = e.target.value;
                                                        setConfig((prev) => {
                                                            const list = getProvidersList(prev.image_providers);
                                                            return {
                                                                ...prev,
                                                                image_providers: list.map((p) => p.id === provider.id ? { ...p, model: val } : p),
                                                            };
                                                        });
                                                    }, className: "h-8.5 font-mono text-ui-xs" })] }), _jsxs("label", { className: "space-y-1 text-ui-xs text-foreground", children: [_jsx("span", { className: "font-medium text-foreground-subtle", children: "API Key \u6388\u6743\u79D8\u94A5" }), _jsx(Input, { type: "password", value: provider.api_key || "", onChange: (e) => {
                                                        const val = e.target.value;
                                                        setConfig((prev) => {
                                                            const list = getProvidersList(prev.image_providers);
                                                            return {
                                                                ...prev,
                                                                image_providers: list.map((p) => p.id === provider.id ? { ...p, api_key: val } : p),
                                                            };
                                                        });
                                                    }, placeholder: "sk-...", className: "h-8.5 font-mono text-ui-xs" })] })] })] }, provider.id || idx));
                    }) })] }));
    }
    return null;
}
//# sourceMappingURL=SocialPublisherMediaTabs.js.map