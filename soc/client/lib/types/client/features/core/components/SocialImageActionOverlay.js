import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useRef, useEffect } from 'react';
import { RefreshCw, Upload, ZoomIn, Loader2, Image as ImageIcon, Check, X, Trash2 } from 'lucide-react';
import { Button } from '../../../compat/components/ui/button.js';
import { toast } from '../../../compat/components/ui/toast.js';
import { useOptionalServices } from '../../../compat/hooks/useServices.js';
import { publisherApiFetch, safeParseJson } from '../../../settings/SocialPublisherTypes.js';
import { invalidateMediaCache } from '../useResolvedMediaUrls.js';
export function SocialImageActionOverlay({ slotTitle, kind, articleIndex = 1, subIndex = 1, currentImageUrl: _currentImageUrl, currentPrompt = '', intentDescription, searchKeywords, scriptsDir, targetFileName, targetDiskPath, accountId, platform, workspacePath, onImageChanged, onZoom, onDelete, canDelete, className = '', alwaysVisible = false, }) {
    const services = useOptionalServices();
    const socialPublisherRpc = services?.socialPublisherService ?? null;
    const [dialogOpen, setDialogOpen] = useState(false);
    const defaultFallbackPrompt = kind === 'cover'
        ? '现代科技学术风格，大气简约构图，符合文章主题意象，中文字符艺术排版'
        : kind === 'pic'
            ? '小红书爆款排版风格，3:4 竖版构图，信息卡片清晰，全中文排版'
            : '高信息密度学术图表，严谨工整，信息漏斗/流程图，浅色干净背景';
    const [promptText, setPromptText] = useState(currentPrompt || defaultFallbackPrompt);
    // 【中文修复依据】：弹窗打开或槽位 Prompt 变化时实时同步预填原生图 Prompt 与设计意图，杜绝残留空值或假模板
    useEffect(() => {
        if (dialogOpen) {
            if (currentPrompt?.trim()) {
                setPromptText(currentPrompt.trim());
            }
            else if (intentDescription?.trim()) {
                setPromptText(intentDescription.trim());
            }
        }
    }, [dialogOpen, currentPrompt, intentDescription]);
    const [generating, setGenerating] = useState(false);
    const [replacing, setReplacing] = useState(false);
    const fileInputRef = useRef(null);
    // 1. 本地文件上传替换
    const handleSelectLocalFile = (e) => {
        const file = e.target.files?.[0];
        if (!file)
            return;
        setReplacing(true);
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const base64Data = String(event.target?.result || '');
                const fallbackName = targetFileName ||
                    (kind === 'cover'
                        ? `cover_${articleIndex}.png`
                        : kind === 'pic'
                            ? `pic_${articleIndex}_${subIndex}.png`
                            : `content_${articleIndex}_${subIndex}.png`);
                const res = await publisherApiFetch('/api/gzh-publisher/replace-image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        targetPath: targetDiskPath,
                        fileName: fallbackName,
                        scriptsDir,
                        base64Data,
                        workspace: workspacePath,
                    }),
                }, socialPublisherRpc);
                const parsed = await safeParseJson(res);
                if (parsed.ok && parsed.data?.ok) {
                    const writtenPath = parsed.data.path || targetDiskPath || fallbackName;
                    invalidateMediaCache(writtenPath, base64Data);
                    if (fallbackName)
                        invalidateMediaCache(fallbackName, base64Data);
                    onImageChanged?.(base64Data);
                    toast(`已成功替换【${slotTitle}】为本地图片`);
                }
                else {
                    toast(parsed.data?.error || '替换图片失败，请检查写入权限');
                }
            }
            catch (err) {
                toast(`替换图片异常: ${err.message || String(err)}`);
            }
            finally {
                setReplacing(false);
                if (fileInputRef.current)
                    fileInputRef.current.value = '';
            }
        };
        reader.readAsDataURL(file);
    };
    // 2. 调用 AI 重新生成图片
    const handleStartRegenerate = async () => {
        if (!promptText.trim()) {
            toast('生图提示词不能为空');
            return;
        }
        setGenerating(true);
        try {
            const fallbackName = targetFileName ||
                (kind === 'cover'
                    ? `cover_${articleIndex}.png`
                    : kind === 'pic'
                        ? `pic_${articleIndex}_${subIndex}.png`
                        : `content_${articleIndex}_${subIndex}.png`);
            const res = await publisherApiFetch('/api/gzh-publisher/regenerate-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targetPath: targetDiskPath,
                    fileName: fallbackName,
                    kind,
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
                const writtenPath = parsed.data.path || targetDiskPath || fallbackName;
                invalidateMediaCache(writtenPath, dataUrl);
                if (fallbackName)
                    invalidateMediaCache(fallbackName, dataUrl);
                if (dataUrl)
                    onImageChanged?.(dataUrl);
                toast(`已成功重新生成【${slotTitle}】`);
                setDialogOpen(false);
            }
            else {
                toast(parsed.data?.error || '重新生成配图失败，请检查生图接口配置');
            }
        }
        catch (err) {
            toast(`生图异常: ${err.message || String(err)}`);
        }
        finally {
            setGenerating(false);
        }
    };
    return (_jsxs(_Fragment, { children: [_jsx("input", { ref: fileInputRef, type: "file", accept: "image/png,image/jpeg,image/webp,image/jpg", className: "hidden", onChange: handleSelectLocalFile }), _jsxs("div", { className: `absolute top-2 right-2 z-20 flex items-center gap-1 p-1 rounded-full bg-black/65 backdrop-blur-md border border-white/20 shadow-lg text-white transition-all duration-200 ${alwaysVisible
                    ? 'opacity-100 scale-100'
                    : 'opacity-0 group-hover:opacity-100 hover:opacity-100 scale-95 group-hover:scale-100'} ${className}`, onClick: e => e.stopPropagation(), children: [_jsxs("button", { type: "button", onClick: () => setDialogOpen(true), disabled: generating || replacing, className: "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/80 hover:bg-primary text-primary-foreground shadow-xs transition-colors cursor-pointer disabled:opacity-50", title: "\u5FAE\u8C03\u63D0\u793A\u8BCD\u5E76\u91CD\u65B0\u751F\u6210\u8BE5\u56FE", children: [generating ? _jsx(Loader2, { className: "size-3 animate-spin" }) : _jsx(RefreshCw, { className: "size-3" }), _jsx("span", { children: "\u91CD\u65B0\u751F\u6210" })] }), _jsxs("button", { type: "button", onClick: () => fileInputRef.current?.click(), disabled: generating || replacing, className: "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-white/15 hover:bg-white/25 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50", title: "\u9009\u62E9\u672C\u5730\u56FE\u7247\u6587\u4EF6\u76F4\u63A5\u66FF\u6362", children: [replacing ? _jsx(Loader2, { className: "size-3 animate-spin" }) : _jsx(Upload, { className: "size-3" }), _jsx("span", { children: "\u66FF\u6362" })] }), onZoom && (_jsx("button", { type: "button", onClick: onZoom, className: "p-1 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-zoom-in", title: "\u9AD8\u6E05\u653E\u5927\u67E5\u770B", children: _jsx(ZoomIn, { className: "size-3.5" }) })), canDelete && onDelete && (_jsx("button", { type: "button", onClick: (e) => {
                            e.stopPropagation();
                            onDelete();
                        }, className: "p-1 rounded-full hover:bg-rose-500/30 text-rose-300 hover:text-rose-100 transition-colors cursor-pointer", title: "\u5220\u9664\u6B64\u5361\u7247", children: _jsx(Trash2, { className: "size-3.5" }) }))] }), dialogOpen && (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in", onClick: () => !generating && setDialogOpen(false), children: _jsxs("div", { className: "w-full max-w-lg rounded-2xl bg-card border border-border p-5 shadow-2xl text-card-foreground space-y-4", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "flex items-center justify-between border-b border-border/50 pb-3", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "p-1.5 rounded-lg bg-primary/10 text-primary", children: _jsx(ImageIcon, { className: "size-4" }) }), _jsxs("div", { children: [_jsxs("h3", { className: "text-ui-sm font-semibold text-foreground", children: ["\u91CD\u65B0\u751F\u6210\uFF1A", slotTitle] }), _jsx("p", { className: "text-[11px] text-foreground-muted", children: "\u5FAE\u8C03\u753B\u9762 Prompt \u63CF\u8FF0\uFF0CAI \u5C06\u5C31\u5730\u91CD\u7ED8\u5E76\u66FF\u6362\u5F53\u524D\u69FD\u4F4D" })] })] }), _jsx("button", { type: "button", disabled: generating, onClick: () => setDialogOpen(false), className: "p-1 rounded-lg hover:bg-surface text-foreground-muted hover:text-foreground cursor-pointer disabled:opacity-50", children: _jsx(X, { className: "size-4" }) })] }), _jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "flex items-center justify-between text-ui-xs", children: [_jsx("span", { className: "font-medium text-foreground", children: "\u751F\u56FE\u63D0\u793A\u8BCD\uFF08Prompt\uFF09" }), _jsx("span", { className: "text-[10px] text-foreground-subtle", children: "\u652F\u6301\u4E2D\u6587\u63CF\u8FF0\uFF0C\u7A81\u51FA\u98CE\u683C\u4E0E\u4E3B\u4F53" })] }), intentDescription && (_jsxs("div", { className: "p-2.5 rounded-xl bg-primary/5 border border-primary/15 text-ui-2xs text-foreground-muted leading-relaxed", children: [_jsx("span", { className: "font-bold text-primary mr-1.5", children: "\uD83D\uDCA1 \u539F\u914D\u56FE\u610F\u56FE:" }), _jsx("span", { children: intentDescription })] })), _jsx("textarea", { value: promptText, onChange: e => setPromptText(e.target.value), disabled: generating, rows: 4, className: "w-full rounded-xl border border-input bg-background p-3 text-ui-xs text-foreground placeholder:text-foreground-subtle focus:outline-hidden ring-2 ring-primary/20 focus:border-primary disabled:opacity-50 leading-relaxed", placeholder: "\u63CF\u8FF0\u4F60\u60F3\u8981\u7684\u753B\u9762\uFF0C\u4F8B\u5982\uFF1A\u6DF1\u84DD\u8272\u5B66\u672F\u56FE\u8868\u3001\u6241\u5E73\u5316\u79D1\u6280\u6298\u7EBF\u56FE\uFF0C\u6781\u7B80\u7559\u767D..." }), Array.isArray(searchKeywords) && searchKeywords.length > 0 && (_jsxs("div", { className: "flex flex-wrap items-center gap-1.5 pt-1", children: [_jsx("span", { className: "text-[10px] text-foreground-subtle", children: "\u63A8\u8350\u5173\u952E\u8BCD:" }), searchKeywords.map((kw, kwIdx) => (_jsxs("button", { type: "button", disabled: generating, onClick: () => {
                                                const trimmed = kw.trim();
                                                if (trimmed && !promptText.includes(trimmed)) {
                                                    setPromptText(prev => (prev ? `${prev}，${trimmed}` : trimmed));
                                                }
                                            }, className: "inline-flex items-center rounded-md bg-surface px-1.5 py-0.5 text-[10px] text-foreground-muted hover:text-primary hover:bg-primary/10 border border-border/60 transition-colors cursor-pointer", title: "\u70B9\u51FB\u8FFD\u52A0\u5230\u63D0\u793A\u8BCD", children: ["+ ", kw] }, kwIdx)))] }))] }), _jsxs("div", { className: "flex items-center justify-between pt-2", children: [_jsxs("div", { className: "text-[11px] text-foreground-subtle", children: ["\u89C4\u683C\uFF1A", kind === 'cover' ? '封面比例' : kind === 'pic' ? '3:4 竖版多图' : '正文插图'] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Button, { type: "button", variant: "outline", size: "sm", disabled: generating, onClick: () => setDialogOpen(false), children: "\u53D6\u6D88" }), _jsx(Button, { type: "button", size: "sm", disabled: generating, onClick: handleStartRegenerate, className: "gap-1.5", children: generating ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "size-3.5 animate-spin" }), _jsx("span", { children: "AI \u751F\u56FE\u4E2D..." })] })) : (_jsxs(_Fragment, { children: [_jsx(Check, { className: "size-3.5" }), _jsx("span", { children: "\u5F00\u59CB\u91CD\u65B0\u751F\u6210" })] })) })] })] })] }) }))] }));
}
//# sourceMappingURL=SocialImageActionOverlay.js.map