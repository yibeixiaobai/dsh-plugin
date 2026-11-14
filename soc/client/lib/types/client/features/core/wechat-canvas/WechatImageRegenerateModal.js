import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { Image as ImageIcon, Loader2, Check, X } from "lucide-react";
import { Button } from "../../../compat/components/ui/button.js";
import { toast } from "../../../compat/components/ui/toast.js";
import { useOptionalServices } from "../../../compat/hooks/useServices.js";
import { publisherApiFetch, safeParseJson } from "../../../settings/SocialPublisherTypes.js";
import { invalidateMediaCache } from "../useResolvedMediaUrls.js";
import css from "./WechatImageRegenerateModal.module.css";
export function WechatImageRegenerateModal({ isOpen, onClose, subIndex, initialPrompt, intentDescription, searchKeywords = [], articleIndex = 1, accountId, platform, scriptsDir, workspacePath, onImageRegenerated, }) {
    const services = useOptionalServices();
    const socialPublisherRpc = services?.socialPublisherService ?? null;
    const [promptText, setPromptText] = useState(initialPrompt);
    const [isGenerating, setIsGenerating] = useState(false);
    useEffect(() => {
        if (isOpen) {
            setPromptText(initialPrompt);
        }
    }, [isOpen, initialPrompt]);
    if (!isOpen)
        return null;
    const handleStartRegenerate = async () => {
        if (!promptText.trim()) {
            toast("生图提示词不能为空");
            return;
        }
        setIsGenerating(true);
        try {
            const targetFileName = `content_${articleIndex}_${subIndex}.png`;
            const res = await publisherApiFetch("/api/gzh-publisher/regenerate-image", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    fileName: targetFileName,
                    kind: "content",
                    index: articleIndex,
                    sub: subIndex,
                    prompt: promptText.trim(),
                    accountId,
                    platform,
                    scriptsDir,
                    workspace: workspacePath,
                }),
            }, socialPublisherRpc);
            const parsed = await safeParseJson(res);
            if (parsed.ok && parsed.data?.ok) {
                const dataUrl = parsed.data.data_url;
                const targetPath = parsed.data.path || targetFileName;
                if (dataUrl) {
                    invalidateMediaCache(targetPath, dataUrl);
                    invalidateMediaCache(targetFileName, dataUrl);
                    onImageRegenerated(dataUrl);
                }
                toast(`已成功重新生成第 ${subIndex} 张正文插图`);
                onClose();
            }
            else {
                toast(parsed.data?.error || "重新生成插图失败，请检查模型接口配置");
            }
        }
        catch (err) {
            toast(`生图异常: ${err.message || String(err)}`);
        }
        finally {
            setIsGenerating(false);
        }
    };
    return (_jsx("div", { className: css.backdrop, onClick: () => !isGenerating && onClose(), children: _jsxs("div", { className: css.modalContainer, onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: css.header, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 10 }, children: [_jsx("div", { style: {
                                        width: 32,
                                        height: 32,
                                        borderRadius: 8,
                                        background: 'rgba(16, 185, 129, 0.12)',
                                        color: '#059669',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }, children: _jsx(ImageIcon, { size: 16 }) }), _jsxs("div", { children: [_jsxs("h3", { className: css.headerTitle, children: ["\u91CD\u65B0\u751F\u6210\uFF1A\u6B63\u6587\u63D2\u56FE #", subIndex] }), _jsx("p", { className: css.headerSubtitle, children: "\u5FAE\u8C03\u753B\u9762 Prompt \u63CF\u8FF0\uFF0CAI \u5C06\u5C31\u5730\u91CD\u7ED8\u5E76\u66F4\u65B0\u753B\u7EB8" })] })] }), _jsx("button", { type: "button", disabled: isGenerating, onClick: onClose, className: css.closeBtn, "aria-label": "\u5173\u95ED\u7A97\u53E3", children: _jsx(X, { size: 16 }) })] }), _jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 10 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }, children: [_jsx("span", { style: { fontWeight: 600, color: 'var(--dsw-alias-label-primary, #111827)' }, children: "\u751F\u56FE\u63D0\u793A\u8BCD\uFF08Prompt\uFF09" }), _jsx("span", { style: { fontSize: 10, color: 'var(--dsw-alias-label-tertiary, #9ca3af)' }, children: "\u5168\u4E2D\u6587\u63CF\u8FF0\uFF0C\u7A81\u51FA\u7ED3\u6784\u4E0E\u4FE1\u606F\u5BF9\u6BD4" })] }), intentDescription && (_jsxs("div", { className: css.intentBox, children: [_jsx("strong", { style: { color: '#059669', marginRight: 4 }, children: "\uD83D\uDCA1 \u539F\u914D\u56FE\u610F\u56FE:" }), _jsx("span", { children: intentDescription })] })), _jsx("textarea", { value: promptText, onChange: (e) => setPromptText(e.target.value), disabled: isGenerating, rows: 4, className: css.textarea, placeholder: "\u63CF\u8FF0\u4F60\u60F3\u8981\u7684\u753B\u9762\uFF0C\u4F8B\u5982\uFF1A\u516D\u5927\u9009\u520A\u5DE5\u5177\u6A2A\u5411\u5BF9\u6BD4\u770B\u677F\u3001\u6DF1\u84DD\u8272\u6A21\u5757\u5316\u6570\u636E\u6D41\u7A0B\u56FE..." }), Array.isArray(searchKeywords) && searchKeywords.length > 0 && (_jsxs("div", { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingTop: 2 }, children: [_jsx("span", { style: { fontSize: 10, color: 'var(--dsw-alias-label-tertiary, #9ca3af)' }, children: "\u63A8\u8350\u5173\u952E\u8BCD:" }), searchKeywords.map((kw, kwIdx) => (_jsxs("button", { type: "button", disabled: isGenerating, onClick: () => {
                                        const trimmed = kw.trim();
                                        if (trimmed && !promptText.includes(trimmed)) {
                                            setPromptText((prev) => (prev ? `${prev}，${trimmed}` : trimmed));
                                        }
                                    }, className: css.keywordPill, title: "\u70B9\u51FB\u8FFD\u52A0\u5230\u63D0\u793A\u8BCD", children: ["+ ", kw] }, kwIdx)))] }))] }), _jsxs("div", { className: css.footer, children: [_jsx("div", { style: { fontSize: 11, color: 'var(--dsw-alias-label-tertiary, #9ca3af)' }, children: "\u89C4\u683C\uFF1A\u6B63\u6587\u63D2\u56FE (16:9 / 1080px \u9AD8\u4FDD\u771F)" }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8 }, children: [_jsx(Button, { type: "button", variant: "outline", size: "sm", disabled: isGenerating, onClick: onClose, children: "\u53D6\u6D88" }), _jsx(Button, { type: "button", size: "sm", disabled: isGenerating, onClick: handleStartRegenerate, style: {
                                        background: '#10b981',
                                        color: '#ffffff',
                                        border: 'none',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 6
                                    }, children: isGenerating ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { size: 14, className: "animate-spin" }), _jsx("span", { children: "AI \u751F\u56FE\u4E2D..." })] })) : (_jsxs(_Fragment, { children: [_jsx(Check, { size: 14 }), _jsx("span", { children: "\u5F00\u59CB\u91CD\u65B0\u751F\u6210" })] })) })] })] })] }) }));
}
//# sourceMappingURL=WechatImageRegenerateModal.js.map