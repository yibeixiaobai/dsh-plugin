import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect, useCallback, useRef } from "react";
import { Download, Copy, CheckCircle2, XCircle, FileCode, Check, RefreshCw } from "lucide-react";
import { Switch } from "../compat/components/ui/switch.js";
import { useOptionalServices } from "../compat/hooks/useServices.js";
import { publisherApiFetch, safeParseJson, serializePublisherConfigPayload } from "./SocialPublisherTypes.js";
import { clientValidateImportConfig, clientMergeConfigData, clientExportConfigData, } from "./SocialPublisherConfigIO.js";
import css from "./SocialPublisherSettings.module.css";
const SCOPE_OPTIONS = [
    { label: "全量配置 (所有账号、接口池、排版规则与运行时)", value: "all" },
    { label: "仅账号档案 (accounts)", value: "accounts" },
    { label: "仅生图接口池 (image_providers)", value: "image_providers" },
    { label: "仅排版与配图视觉规则 (typography & image_spec)", value: "visual_rules" },
    { label: "仅运行环境设置 (runtime)", value: "runtime" },
];
export function SocialPublisherBackupTab({ config: _config, onConfigSaved, setStatusMessage, }) {
    const services = useOptionalServices();
    const socialPublisherRpc = services?.socialPublisherService ?? null;
    // 导出状态：默认开启安全脱敏 (置空密钥)
    const [exportScope, setExportScope] = useState("all");
    const [maskSecrets, setMaskSecrets] = useState(true);
    const [exportLoading, setExportLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    // 导入状态
    const [importJson, setImportJson] = useState("");
    const [validating, setValidating] = useState(false);
    const [validationResult, setValidationResult] = useState(null);
    const [importing, setImporting] = useState(false);
    const fileInputRef = useRef(null);
    // 执行导出获取数据：优先 RPC/后台接口，遭遇断连或 HTML 响应时无缝降级至前端内存快照导出，100% 杜绝输出 HTML
    const fetchExportData = useCallback(async () => {
        setExportLoading(true);
        try {
            const includeSecrets = !maskSecrets;
            try {
                const route = `/api/gzh-publisher/config/export?scope=${exportScope}&include_secrets=${includeSecrets}&download=false`;
                const res = await publisherApiFetch(route, {}, socialPublisherRpc);
                const parsed = await safeParseJson(res);
                if (parsed.ok && parsed.data && typeof parsed.data === "object") {
                    const raw = parsed.data.config || parsed.data;
                    if (raw && typeof raw === "object") {
                        return parsed.data;
                    }
                }
            }
            catch {
                // 后台未响应时静默走前端高可靠内存快照
            }
            return clientExportConfigData(_config, {
                scope: exportScope,
                includeSecrets,
            });
        }
        catch (err) {
            setStatusMessage({ type: "error", text: `获取导出数据失败: ${err.message}` });
            return null;
        }
        finally {
            setExportLoading(false);
        }
    }, [exportScope, maskSecrets, setStatusMessage, socialPublisherRpc, _config]);
    // 复制到剪贴板
    const handleCopyExport = async () => {
        const data = await fetchExportData();
        if (!data)
            return;
        try {
            await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
            setStatusMessage({ type: "success", text: "已将导出配置复制到剪贴板！" });
        }
        catch (e) {
            setStatusMessage({ type: "error", text: `复制失败: ${e.message}` });
        }
    };
    // 下载配置文件：采用纯客户端 Blob 内存生成，杜绝任何外部 URL 导致下载到 index.html
    const handleDownloadExport = async () => {
        setExportLoading(true);
        try {
            const data = await fetchExportData();
            if (!data)
                return;
            if (typeof data === "string" && (data.includes("<html") || data.startsWith("<!"))) {
                throw new Error("检测到异常网页内容，已自动阻止导出非 JSON 文件");
            }
            const jsonString = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonString], { type: "application/json;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
            a.href = url;
            a.download = `wincast-social-publisher-config-${exportScope}-${dateStr}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            setStatusMessage({ type: "success", text: "配置文件导出成功并已开始下载！" });
        }
        catch (err) {
            setStatusMessage({ type: "error", text: `导出下载失败: ${err.message}` });
        }
        finally {
            setExportLoading(false);
        }
    };
    // 前端即时快速校验 + 后端双轨校验
    const runValidation = useCallback(async (text) => {
        const trimmed = text.trim();
        if (!trimmed) {
            setValidationResult(null);
            return;
        }
        const localResult = clientValidateImportConfig(text);
        setValidationResult(localResult);
        if (!localResult.valid) {
            return;
        }
        if (socialPublisherRpc) {
            setValidating(true);
            try {
                const res = await publisherApiFetch("/api/gzh-publisher/config/validate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: text,
                }, socialPublisherRpc);
                const parsed = await safeParseJson(res);
                if (parsed.ok && parsed.data?.valid) {
                    setValidationResult((prev) => ({
                        ...prev,
                        ...parsed.data,
                        valid: true,
                    }));
                }
            }
            catch {
                // 保持本地校验通过的结果
            }
            finally {
                setValidating(false);
            }
        }
    }, [socialPublisherRpc]);
    useEffect(() => {
        const timer = setTimeout(() => {
            if (importJson.trim())
                runValidation(importJson);
            else
                setValidationResult(null);
        }, 300);
        return () => clearTimeout(timer);
    }, [importJson, runValidation]);
    const handleFile = (file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = String(e.target?.result || "");
            setImportJson(content);
            runValidation(content);
        };
        reader.readAsText(file, "utf-8");
    };
    const executeImport = async (mode) => {
        if (!importJson.trim())
            return;
        const validated = validationResult?.valid ? validationResult : clientValidateImportConfig(importJson);
        if (!validated.valid || !validated.data) {
            setStatusMessage({ type: "error", text: "配置结构校验未通过，请检查错误提示后再执行导入" });
            return;
        }
        setImporting(true);
        setStatusMessage(null);
        const mergedConfig = clientMergeConfigData(_config, validated.data, mode);
        onConfigSaved(mergedConfig);
        try {
            const payload = serializePublisherConfigPayload(mergedConfig);
            const res = await publisherApiFetch("/api/gzh-publisher/config/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            }, socialPublisherRpc);
            const parsed = await safeParseJson(res);
            if (parsed.ok) {
                setStatusMessage({
                    type: "success",
                    text: mode === "merge"
                        ? "已成功增量合并导入配置并即时同步落盘！"
                        : "已成功全量覆盖导入配置并即时同步落盘！",
                });
            }
            else {
                setStatusMessage({
                    type: "success",
                    text: `配置已成功${mode === "merge" ? "增量合并" : "全量覆盖"}导入并在当前界面即时生效！（后台离线，已保留于本地）`,
                });
            }
        }
        catch {
            setStatusMessage({
                type: "success",
                text: `配置已成功${mode === "merge" ? "增量合并" : "全量覆盖"}导入并在当前界面即时生效！`,
            });
        }
        finally {
            setImporting(false);
        }
    };
    const summary = validationResult?.summary;
    return (_jsxs("div", { className: "space-y-6", "data-testid": "social-publisher-backup-tab", children: [_jsxs("section", { className: css.macosGroup, children: [_jsxs("div", { className: css.macosGroupHeader, children: [_jsx("span", { children: "\u914D\u7F6E\u5BFC\u51FA\u4E0E\u8131\u654F\u5907\u4EFD" }), _jsx("span", { className: "text-[11px] font-normal text-muted-foreground", children: "Export & Backup" })] }), _jsxs("div", { className: css.macosGroupCard, children: [_jsxs("div", { className: css.macosRow, children: [_jsxs("div", { className: css.macosRowInfo, children: [_jsx("div", { className: css.macosRowLabel, children: "\u9009\u62E9\u5BFC\u51FA\u8303\u56F4 (Scope)" }), _jsx("div", { className: css.macosRowHint, children: "\u53EF\u9009\u62E9\u4EC5\u5907\u4EFD\u8D26\u53F7\u3001\u751F\u56FE\u63A5\u53E3\u3001\u6392\u7248\u89C4\u5219\u6216\u5168\u91CF\u914D\u7F6E" })] }), _jsx("div", { className: css.macosRowControl, children: _jsx("select", { className: "h-7 rounded border border-border/80 bg-background px-2 text-[12px] text-foreground font-medium focus:border-primary focus:outline-none", value: exportScope, onChange: (e) => setExportScope(e.target.value), children: SCOPE_OPTIONS.map((opt) => (_jsx("option", { value: opt.value, children: opt.label }, opt.value))) }) })] }), _jsxs("div", { className: css.macosRow, children: [_jsxs("div", { className: css.macosRowInfo, children: [_jsx("div", { className: css.macosRowLabel, children: "\u5B89\u5168\u8131\u654F\u5BFC\u51FA (Mask Secrets)" }), _jsx("div", { className: css.macosRowHint, children: "\u81EA\u52A8\u7F6E\u7A7A\u5FAE\u4FE1 AppSecret \u4E0E\u751F\u56FE API \u5BC6\u94A5\uFF0C\u9002\u5408\u516C\u5F00\u5206\u4EAB\u6216\u56E2\u961F\u5F52\u6863" })] }), _jsx("div", { className: css.macosRowControl, children: _jsx(Switch, { checked: maskSecrets, onCheckedChange: (c) => setMaskSecrets(c) }) })] }), _jsxs("div", { className: css.macosRow, children: [_jsxs("div", { className: css.macosRowInfo, children: [_jsx("div", { className: css.macosRowLabel, children: "\u751F\u6210\u4E0E\u83B7\u53D6\u5907\u4EFD\u6587\u4EF6" }), _jsx("div", { className: css.macosRowHint, children: "\u652F\u6301\u7EAF\u5BA2\u6237\u7AEF\u5185\u5B58 Blob \u5FEB\u901F\u4E0B\u8F7D\u6216\u590D\u5236\u683C\u5F0F\u5316 JSON" })] }), _jsxs("div", { className: css.macosRowControl, children: [_jsxs("button", { type: "button", className: "flex h-7 items-center justify-center gap-1.5 rounded border border-border/80 bg-background px-2.5 text-[12px] font-medium text-foreground hover:bg-accent transition-colors shadow-2xs cursor-pointer", onClick: handleCopyExport, disabled: exportLoading, children: [copied ? _jsx(Check, { className: "size-3 text-emerald-500" }) : _jsx(Copy, { className: "size-3 text-muted-foreground" }), _jsx("span", { children: copied ? "已复制" : "复制 JSON" })] }), _jsxs("button", { type: "button", className: "flex h-7 items-center justify-center gap-1.5 rounded bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer", onClick: handleDownloadExport, disabled: exportLoading, children: [_jsx(Download, { className: "size-3.5" }), _jsx("span", { children: "\u4E0B\u8F7D\u914D\u7F6E\u6587\u4EF6" })] })] })] })] })] }), _jsxs("section", { className: css.macosGroup, children: [_jsxs("div", { className: css.macosGroupHeader, children: [_jsx("span", { children: "\u914D\u7F6E\u5BFC\u5165\u3001\u7ED3\u6784\u9884\u68C0\u4E0E\u843D\u5730" }), _jsx("span", { className: "text-[11px] font-normal text-muted-foreground", children: "Import & Restore" })] }), _jsxs("div", { className: css.macosGroupCard, children: [_jsxs("div", { className: css.macosRow, children: [_jsxs("div", { className: css.macosRowInfo, children: [_jsx("div", { className: css.macosRowLabel, children: "\u9009\u62E9\u914D\u7F6E\u6587\u4EF6\u6216\u8F7D\u5165\u5FEB\u7167" }), _jsx("div", { className: css.macosRowHint, children: "\u652F\u6301\u9009\u62E9\u672C\u5730 JSON \u5907\u4EFD\u6587\u4EF6\u6216\u4E00\u952E\u8BFB\u53D6\u5F53\u524D\u751F\u6548\u7684\u672C\u5730\u914D\u7F6E" })] }), _jsxs("div", { className: css.macosRowControl, children: [_jsx("input", { type: "file", ref: fileInputRef, accept: ".json", style: { display: "none" }, onChange: (e) => {
                                                    if (e.target.files?.[0])
                                                        handleFile(e.target.files[0]);
                                                } }), _jsxs("button", { type: "button", className: "flex h-7 items-center justify-center gap-1.5 rounded border border-border/80 bg-background px-2.5 text-[12px] font-medium text-foreground hover:bg-accent transition-colors shadow-2xs cursor-pointer", onClick: () => fileInputRef.current?.click(), children: [_jsx(FileCode, { className: "size-3.5 text-muted-foreground" }), _jsx("span", { children: "\u9009\u62E9\u6587\u4EF6" })] }), _jsxs("button", { type: "button", className: "flex h-7 items-center justify-center gap-1.5 rounded border border-border/80 bg-background px-2.5 text-[12px] font-medium text-foreground hover:bg-accent transition-colors shadow-2xs cursor-pointer", onClick: async () => {
                                                    const data = await fetchExportData();
                                                    if (data) {
                                                        const jsonStr = JSON.stringify(data, null, 2);
                                                        setImportJson(jsonStr);
                                                        runValidation(jsonStr);
                                                        setStatusMessage({ type: "success", text: "已为您成功填入本机当前社媒发布配置！" });
                                                    }
                                                }, children: [_jsx(RefreshCw, { className: "size-3 text-muted-foreground" }), _jsx("span", { children: "\u8F7D\u5165\u672C\u673A\u914D\u7F6E" })] })] })] }), _jsxs("div", { className: css.macosRow, children: [_jsxs("div", { className: css.macosRowInfo, children: [_jsx("div", { className: css.macosRowLabel, children: "\u6267\u884C\u5BFC\u5165\u4E0E\u843D\u5730\u5E94\u7528" }), _jsx("div", { className: css.macosRowHint, children: "\u589E\u91CF\u5408\u5E76\u4FDD\u7559\u672C\u5730\u5DF2\u6709\u51ED\u636E\u5E76\u8FFD\u52A0\u65B0\u9879\uFF1B\u5168\u91CF\u8986\u76D6\u5C06\u5F7B\u5E95\u66FF\u6362\u5F53\u524D\u6240\u6709\u8BBE\u7F6E" })] }), _jsxs("div", { className: css.macosRowControl, children: [_jsx("button", { type: "button", className: "flex h-7 items-center justify-center gap-1 rounded border border-border/80 bg-background px-2.5 text-[12px] font-medium text-foreground hover:bg-accent transition-colors shadow-2xs cursor-pointer disabled:opacity-50", onClick: () => executeImport("merge"), disabled: !validationResult?.valid || importing, title: "\u4FDD\u7559\u672C\u5730\u5DF2\u6709\u51ED\u636E\u4E0E\u8BBE\u7F6E\uFF0C\u8FFD\u52A0\u65B0\u589E\u8D26\u53F7/\u63A5\u53E3\uFF08\u63A8\u8350\uFF09", children: _jsx("span", { children: "\u589E\u91CF\u5408\u5E76 (\u63A8\u8350)" }) }), _jsx("button", { type: "button", className: "flex h-7 items-center justify-center gap-1 rounded border border-destructive/40 bg-destructive/10 px-2.5 text-[12px] font-medium text-destructive hover:bg-destructive/20 transition-colors shadow-2xs cursor-pointer disabled:opacity-50", onClick: () => executeImport("overwrite"), disabled: !validationResult?.valid || importing, title: "\u5B8C\u5168\u4F7F\u7528\u5BFC\u5165\u7684\u5185\u5BB9\u66FF\u6362\u672C\u5730\u73B0\u6709\u914D\u7F6E", children: _jsx("span", { children: "\u5168\u91CF\u8986\u76D6" }) })] })] }), validationResult && (_jsxs("div", { className: "p-3.5 border-t border-border/60 text-[12px] space-y-2.5", style: {
                                    background: validationResult.valid ? "rgba(16, 185, 129, 0.04)" : "rgba(239, 68, 68, 0.04)",
                                }, children: [_jsx("div", { className: "flex items-center gap-2 font-semibold", children: validationResult.valid ? (_jsxs(_Fragment, { children: [_jsx(CheckCircle2, { className: "size-4 text-emerald-500 shrink-0" }), _jsx("span", { className: "text-emerald-600 dark:text-emerald-400", children: "\u914D\u7F6E\u7ED3\u6784\u6821\u9A8C\u901A\u8FC7\uFF0C\u53EF\u5B89\u5168\u6267\u884C\u5BFC\u5165" })] })) : (_jsxs(_Fragment, { children: [_jsx(XCircle, { className: "size-4 text-destructive shrink-0" }), _jsx("span", { className: "text-destructive", children: "\u914D\u7F6E\u6821\u9A8C\u672A\u901A\u8FC7\uFF0C\u8BF7\u68C0\u67E5\u9519\u8BEF\u63D0\u793A" })] })) }), summary && (_jsxs("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11.5px]", children: [_jsxs("div", { className: "p-2 rounded border border-border/60 bg-surface/50", children: [_jsx("span", { className: "block text-muted-foreground", children: "\u793E\u5A92\u8D26\u53F7" }), _jsxs("span", { className: "font-semibold text-foreground", children: [summary.account_count, " \u4E2A"] })] }), _jsxs("div", { className: "p-2 rounded border border-border/60 bg-surface/50", children: [_jsx("span", { className: "block text-muted-foreground", children: "\u751F\u56FE\u63A5\u53E3\u6C60" }), _jsxs("span", { className: "font-semibold text-foreground", children: [summary.provider_count, " \u4E2A"] })] }), _jsxs("div", { className: "p-2 rounded border border-border/60 bg-surface/50", children: [_jsx("span", { className: "block text-muted-foreground", children: "\u6392\u7248\u4E0E\u914D\u56FE\u89C4\u5219" }), _jsx("span", { className: "font-semibold text-foreground", children: summary.has_typography ? "包含" : "无" })] }), _jsxs("div", { className: "p-2 rounded border border-border/60 bg-surface/50", children: [_jsx("span", { className: "block text-muted-foreground", children: "\u8FD0\u884C\u73AF\u5883" }), _jsx("span", { className: "font-semibold text-foreground", children: summary.has_runtime ? "包含" : "无" })] })] })), ((validationResult.errors && validationResult.errors.length > 0) || validationResult.error) && (_jsxs("div", { className: "space-y-1 text-destructive text-[11.5px]", children: [validationResult.errors?.map((err, i) => (_jsxs("div", { className: "flex items-start gap-1.5", children: [_jsx(XCircle, { className: "size-3.5 shrink-0 mt-0.5" }), _jsx("span", { children: err })] }, i))), validationResult.error && !validationResult.errors?.length && (_jsxs("div", { className: "flex items-start gap-1.5", children: [_jsx(XCircle, { className: "size-3.5 shrink-0 mt-0.5" }), _jsx("span", { children: validationResult.error })] }))] }))] })), _jsxs("div", { className: "p-3.5 border-t border-border/60 relative", children: [_jsx("textarea", { className: "h-36 w-full rounded border border-border/80 bg-background p-2.5 font-mono text-[12px] text-foreground focus:border-primary focus:outline-none resize-y", placeholder: "\u5728\u6B64\u7C98\u8D34\u5BFC\u51FA\u7684\u914D\u7F6E JSON \u6216\u5C06 .json \u914D\u7F6E\u6587\u4EF6\u62D6\u62FD\u81F3\u6B64...", value: importJson, onChange: (e) => setImportJson(e.target.value), onDragOver: (e) => e.preventDefault(), onDrop: (e) => {
                                            e.preventDefault();
                                            if (e.dataTransfer.files?.[0])
                                                handleFile(e.dataTransfer.files[0]);
                                        } }), validating && (_jsx("div", { className: "absolute right-6 bottom-6 text-[11px] text-muted-foreground bg-surface px-2 py-0.5 rounded border border-border/80", children: "\u6B63\u5728\u6821\u9A8C\u7ED3\u6784\u4E2D..." }))] })] })] })] }));
}
//# sourceMappingURL=SocialPublisherBackupTab.js.map