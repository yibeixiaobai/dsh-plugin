import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect } from "react";
import css from "./SocialPublisherSettings.module.css";
import { SocialPublisherAccountRail } from "./SocialPublisherAccountRail.js";
import { SocialPublisherAccountDetailView } from "./SocialPublisherAccountDetailView.js";
import { SocialPublisherRuntimeTab } from "./SocialPublisherRuntimeTab.js";
import { SocialPublisherBackupTab } from "./SocialPublisherBackupTab.js";
import { useOptionalServices } from "../compat/hooks/useServices.js";
import { socialPublisherConfigStore, useSocialPublisherStore, } from "./SocialPublisherConfigStore.js";
import { normalizeAccountsList } from "./SocialPublisherTypes.js";
import { CheckCircle2, RotateCcw, AlertCircle, RefreshCw } from "lucide-react";
import { ScopedErrorBoundary } from "../ErrorBoundary.js";
function SocialPublisherSectionInner() {
    const services = useOptionalServices();
    const socialPublisherRpc = services?.socialPublisherService ?? null;
    const { config, activeNav, saveStatus, saveError, loading, } = useSocialPublisherStore();
    useEffect(() => {
        socialPublisherConfigStore.init(socialPublisherRpc);
        return () => {
            socialPublisherConfigStore.flushPendingSave();
        };
    }, [socialPublisherRpc]);
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                e.preventDefault();
                socialPublisherConfigStore.executeSave();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);
    const accountsList = normalizeAccountsList(config?.accounts);
    const activeCount = accountsList.filter((a) => a.enabled !== false).length;
    return (_jsxs("div", { className: css.settingsContainer, "data-testid": "social-publisher-section", "data-full-bleed": "true", children: [_jsxs("div", { className: "flex items-center justify-between px-6 py-2.5 border-b border-border/60 bg-surface/40 flex-shrink-0", children: [_jsxs("div", { className: "flex items-center gap-2.5", children: [_jsx("h1", { className: "text-ui-base font-semibold text-foreground tracking-tight", children: "\u793E\u5A92\u591A\u5E73\u53F0\u53D1\u5E03\u8BBE\u7F6E" }), _jsxs("span", { className: "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-border/80 bg-surface/80 text-[11px] font-medium text-muted-foreground", children: [_jsx("span", { className: "size-1.5 rounded-full bg-emerald-500" }), _jsxs("span", { children: ["\u672C\u5730\u670D\u52A1\u6B63\u5E38 \u00B7 ", activeCount, "/", accountsList.length, " \u8D26\u53F7\u5C31\u7EEA"] })] })] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsxs("div", { className: "flex items-center gap-1.5 text-ui-xs text-muted-foreground select-none", children: [saveStatus === "saving" && (_jsxs(_Fragment, { children: [_jsx(RotateCcw, { className: "size-3.5 animate-spin text-primary" }), _jsx("span", { className: "text-primary font-medium", children: "\u6B63\u5728\u4FDD\u5B58..." })] })), saveStatus === "saved" && (_jsxs(_Fragment, { children: [_jsx(CheckCircle2, { className: "size-3.5 text-emerald-500" }), _jsx("span", { className: "text-emerald-600 dark:text-emerald-400 font-medium", children: "\u6240\u6709\u914D\u7F6E\u5DF2\u81EA\u52A8\u4FDD\u5B58" })] })), saveStatus === "error" && (_jsxs(_Fragment, { children: [_jsx(AlertCircle, { className: "size-3.5 text-destructive" }), _jsx("span", { className: "text-destructive font-medium", children: saveError || "保存失败" })] })), saveStatus === "idle" && (_jsxs(_Fragment, { children: [_jsx(CheckCircle2, { className: "size-3.5 text-muted-foreground" }), _jsx("span", { children: "\u5C31\u7EEA" })] }))] }), _jsxs("button", { type: "button", className: "flex h-7 items-center gap-1 rounded border border-border/80 bg-background px-2 text-[11px] font-medium text-foreground hover:bg-accent transition-colors", onClick: () => socialPublisherConfigStore.fetchFromBackend(), title: "\u4ECE\u672C\u5730\u670D\u52A1\u78C1\u76D8\u91CD\u65B0\u62C9\u53D6", disabled: loading, children: [_jsx(RefreshCw, { className: `size-3 text-muted-foreground ${loading ? "animate-spin" : ""}` }), _jsx("span", { children: "\u5237\u65B0" })] })] })] }), _jsxs("div", { className: css.masterDetailLayout, children: [_jsx(SocialPublisherAccountRail, {}), _jsxs("main", { className: css.detailStage, children: [activeNav.startsWith("acc_") && _jsx(SocialPublisherAccountDetailView, {}), activeNav === "sys_runtime" && (_jsxs("div", { className: css.stageContainer, children: [_jsxs("div", { className: "pb-5 border-b border-border/80", children: [_jsx("h2", { className: "text-ui-lg font-bold text-foreground", children: "\u5168\u5C40\u8FD0\u884C\u73AF\u5883\u4E0E\u751F\u56FE\u63A5\u53E3\u6C60" }), _jsx("p", { className: "text-ui-xs text-foreground-subtle", children: "\u914D\u7F6E Python \u89E3\u91CA\u5668\u3001Chrome \u9A71\u52A8\u8DEF\u5F84\u3001\u4EBA\u673A\u9A8C\u8BC1\u5F39\u7A97\u63A5\u7BA1\u4E0E AI \u751F\u56FE Provider \u63A5\u53E3\u6C60" })] }), _jsx(SocialPublisherRuntimeTab, { config: config, setConfig: (updater) => {
                                            if (typeof updater === "function") {
                                                socialPublisherConfigStore.updateConfig(updater);
                                            }
                                            else {
                                                socialPublisherConfigStore.updateConfig(() => updater);
                                            }
                                        } })] })), activeNav === "sys_backup" && (_jsxs("div", { className: css.stageContainer, children: [_jsxs("div", { className: "pb-5 border-b border-border/80", children: [_jsx("h2", { className: "text-ui-lg font-bold text-foreground", children: "\u914D\u7F6E\u5907\u4EFD\u3001\u8FC1\u79FB\u4E0E\u5373\u65F6\u843D\u5730" }), _jsx("p", { className: "text-ui-xs text-foreground-subtle", children: "\u4E0E WinCode \u4FDD\u6301\u4E00\u81F4\u7684 JSON \u5907\u4EFD\u5BFC\u51FA\u3001\u589E\u91CF\u5BFC\u5165\u4E0E\u5168\u91CF\u8986\u76D6\uFF0C\u652F\u6301\u4E00\u952E\u8F7D\u5165\u672C\u673A\u5386\u53F2\u914D\u7F6E" })] }), _jsx(SocialPublisherBackupTab, { config: config, onConfigSaved: (newCfg) => {
                                            socialPublisherConfigStore.updateConfig(() => newCfg, true);
                                        }, setStatusMessage: (msg) => {
                                            if (msg?.type === "error") {
                                                alert(msg.text);
                                            }
                                        } })] }))] })] })] }));
}
export function SocialPublisherSection() {
    return (_jsx(ScopedErrorBoundary, { scope: "SocialPublisherSection", children: _jsx(SocialPublisherSectionInner, {}) }));
}
//# sourceMappingURL=SocialPublisherSection.js.map