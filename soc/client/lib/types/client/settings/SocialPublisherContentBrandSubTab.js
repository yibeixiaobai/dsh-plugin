import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef, useEffect } from "react";
import { Input } from "../compat/components/ui/input.js";
import { Switch } from "../compat/components/ui/switch.js";
import { Button } from "../compat/components/ui/button.js";
import { Upload, Image as ImageIcon, Info } from "lucide-react";
import { useOptionalServices } from "../compat/hooks/useServices.js";
import { getApiBaseUrl, publisherApiFetch, safeParseJson } from "./SocialPublisherTypes.js";
export function SocialPublisherContentBrandSubTab({ currentAccount, updateCurrentAccount, isCardFlow, isXhs, }) {
    const services = useOptionalServices();
    const socialPublisherRpc = services?.socialPublisherService ?? null;
    const [brandSlot, setBrandSlot] = useState("header");
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef(null);
    // [中文修复依据]：按 `${accountId}_${slot}` 粒度隔离的瞬时乐观预览缓存字典，实现 0 毫秒即时呈现与防串号
    const [previewCache, setPreviewCache] = useState({});
    const accountId = currentAccount.id || "default";
    const brandData = currentAccount.brand_images?.[brandSlot] || {};
    const currentFileName = brandData.file || (brandSlot === "header" ? "brand_top.jpg" : "brand_bot.jpg");
    const cacheKey = `${accountId}_${brandSlot}`;
    // [中文修复依据]：仅在当前账号专属缓存未命中时发起静默拉取，严禁首行清空，杜绝旧图回闪与操作延迟
    useEffect(() => {
        if (!socialPublisherRpc)
            return;
        if (previewCache[cacheKey])
            return;
        let isMounted = true;
        socialPublisherRpc
            .handleGenericRoute("/api/gzh-publisher/brand-image", "GET", undefined, {
            slot: brandSlot,
            account: accountId,
            file: currentFileName,
        })
            .then((res) => {
            if (isMounted && res?.data?.data_url) {
                setPreviewCache((prev) => ({
                    ...prev,
                    [cacheKey]: res.data.data_url,
                }));
            }
        })
            .catch(() => { });
        return () => {
            isMounted = false;
        };
    }, [brandSlot, accountId, currentFileName, cacheKey, previewCache, socialPublisherRpc]);
    // 【中文修复依据】：体裁精准边界——纯多图卡片流（小红书/小绿书）展示体裁说明，不嵌入长图文首尾横幅品牌图；长图文（知乎、百家号、头条号、公众号长文）全面开放品牌头尾图配置
    if (isCardFlow || isXhs) {
        return (_jsxs("div", { className: "flex items-start gap-3 rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-4 text-ui-xs text-foreground", children: [_jsx(Info, { className: "size-4.5 text-rose-500 shrink-0 mt-0.5" }), _jsx("p", { className: "text-foreground-subtle leading-relaxed", children: "\u5F53\u524D\u8D26\u53F7\u4E3A 3:4 \u7AD6\u7248\u591A\u56FE\u5361\u7247\u6D41\u4F53\u88C1\uFF0C\u4E13\u6CE8\u4E8E\u56FE\u6587\u5361\u7247\u4E0E\u5C01\u9762\u89C6\u89C9\uFF0C\u4E0D\u63D2\u5165\u6587\u7AE0\u578B\u9996\u5C3E\u6A2A\u5E45\u54C1\u724C\u56FE\u3002" })] }));
    }
    const activePreviewUrl = previewCache[cacheKey] ||
        `${getApiBaseUrl()}/api/gzh-publisher/brand-image?slot=${brandSlot}&account=${accountId}&file=${encodeURIComponent(currentFileName)}`;
    const handleUploadBrandImage = async (file) => {
        setUploading(true);
        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64Data = String(e.target?.result || "");
                // 1. 0毫秒乐观更新当前账号专属预览，用户选图瞬间立即呈现新图！
                setPreviewCache((prev) => ({ ...prev, [cacheKey]: base64Data }));
                // 2. 发起后端专属目录落盘
                const route = `/api/gzh-publisher/brand-image?slot=${brandSlot}&account=${accountId}&file=${encodeURIComponent(file.name)}`;
                const res = await publisherApiFetch(route, {
                    method: "POST",
                    headers: {
                        "Content-Type": file.type || "image/jpeg",
                        "x-dsh-gzh-upload": "brand-image",
                        "x-dsh-gzh-filename": encodeURIComponent(file.name),
                    },
                    body: base64Data,
                }, socialPublisherRpc);
                const parsed = await safeParseJson(res);
                const data = parsed.data || {};
                if (parsed.ok && data.ok) {
                    const finalFile = data.file || file.name;
                    // [中文修复依据]：深度解耦当前账号 brand_images，绝不引用共享对象
                    const clonedBrandImages = JSON.parse(JSON.stringify(currentAccount.brand_images || {}));
                    // 3. 靶向更新当前账号专属 brand_images
                    updateCurrentAccount({
                        brand_images: {
                            ...clonedBrandImages,
                            [brandSlot]: {
                                ...clonedBrandImages[brandSlot],
                                file: finalFile,
                            },
                        },
                    });
                }
                setUploading(false);
            };
            reader.readAsDataURL(file);
        }
        catch (err) {
            console.warn("上传品牌图失败:", err);
            setUploading(false);
        }
    };
    const updateBrandField = (fieldPatch) => {
        // [中文修复依据]：深度解耦当前账号 brand_images，精准更新目标账号字段，彻底杜绝一改全改
        const clonedBrandImages = JSON.parse(JSON.stringify(currentAccount.brand_images || {}));
        updateCurrentAccount({
            brand_images: {
                ...clonedBrandImages,
                [brandSlot]: {
                    ...clonedBrandImages[brandSlot],
                    ...fieldPatch,
                },
            },
        });
    };
    return (_jsxs("div", { className: "space-y-4", "data-testid": "social-publisher-brand-settings", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-3", children: [_jsxs("div", { className: "inline-flex rounded-xl bg-surface/80 p-1 border border-border/70 shadow-2xs", children: [_jsx("button", { type: "button", onClick: () => setBrandSlot("header"), className: `px-3.5 py-1.5 rounded-lg text-ui-xs font-semibold transition-all cursor-pointer ${brandSlot === "header"
                                    ? "bg-card text-foreground shadow-xs border border-border/80"
                                    : "text-foreground-subtle hover:text-foreground"}`, children: "\u5934\u90E8\u54C1\u724C\u56FE\uFF08\u6587\u7AE0\u5F00\u5934\uFF09" }), _jsx("button", { type: "button", onClick: () => setBrandSlot("footer"), className: `px-3.5 py-1.5 rounded-lg text-ui-xs font-semibold transition-all cursor-pointer ${brandSlot === "footer"
                                    ? "bg-card text-foreground shadow-xs border border-border/80"
                                    : "text-foreground-subtle hover:text-foreground"}`, children: "\u5C3E\u90E8\u54C1\u724C\u56FE\uFF08\u5F15\u5BFC\u5173\u6CE8\uFF09" })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-ui-xs text-foreground font-medium", children: "\u542F\u7528\u8BE5\u54C1\u724C\u56FE" }), _jsx(Switch, { checked: Boolean(brandData.enabled ?? true), onCheckedChange: (checked) => updateBrandField({ enabled: checked }) })] })] }), _jsxs("div", { className: "flex flex-wrap items-center gap-5 rounded-xl border border-border/80 bg-surface/50 p-4", children: [_jsxs("div", { className: "relative size-24 shrink-0 overflow-hidden rounded-xl border border-card-border bg-background flex items-center justify-center shadow-xs", children: [_jsx("img", { src: activePreviewUrl, alt: brandSlot === "header" ? "头部品牌图" : "尾部品牌图", className: "size-full object-contain", onLoad: (e) => {
                                    e.target.style.display = "block";
                                }, onError: (e) => {
                                    e.target.style.display = "none";
                                } }), _jsx(ImageIcon, { className: "size-8 text-foreground-subtle opacity-40 absolute -z-10" })] }), _jsxs("div", { className: "space-y-2 flex-1 min-w-[200px]", children: [_jsxs("div", { className: "text-ui-sm font-semibold text-foreground", children: ["\u56FE\u7247\u6587\u4EF6: ", currentFileName] }), _jsx("p", { className: "text-ui-xs text-foreground-subtle", children: "\u5EFA\u8BAE\u4E0A\u4F20\u5BBD\u5EA6 \u2265 900px \u7684\u6E05\u6670\u957F\u6761\u56FE\uFF0C\u81EA\u52A8\u9002\u5E94\u6587\u7AE0\u7248\u5FC3\u5BBD\u5EA6\u3002" }), _jsx("input", { type: "file", ref: fileInputRef, accept: "image/jpeg,image/png,image/webp", className: "hidden", onChange: (e) => {
                                    if (e.target.files?.[0])
                                        handleUploadBrandImage(e.target.files[0]);
                                } }), _jsxs(Button, { type: "button", variant: "outline", size: "sm", onClick: () => fileInputRef.current?.click(), disabled: uploading, className: "h-8 gap-1.5 text-ui-xs", children: [_jsx(Upload, { className: "size-3.5" }), _jsx("span", { children: uploading ? "上传中..." : "上传替换图片 (JPG/PNG/WebP)" })] })] })] }), _jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsxs("label", { className: "space-y-1.5 text-ui-xs text-foreground", children: [_jsx("span", { className: "font-medium text-foreground-subtle", children: "\u663E\u793A\u5BBD\u5EA6\u6BD4\u4F8B (0~100%\uFF0C0=\u81EA\u9002\u5E94)" }), _jsx(Input, { type: "number", value: brandData.width ?? (brandSlot === "header" ? 100 : 60), onChange: (e) => updateBrandField({ width: Number(e.target.value) }), className: "h-8.5 font-mono text-ui-xs" })] }), _jsxs("label", { className: "space-y-1.5 text-ui-xs text-foreground", children: [_jsx("span", { className: "font-medium text-foreground-subtle", children: "\u56FE\u7247\u5706\u89D2\u5927\u5C0F (px)" }), _jsx(Input, { type: "number", value: brandData.radius ?? 0, onChange: (e) => updateBrandField({ radius: Number(e.target.value) }), className: "h-8.5 font-mono text-ui-xs" })] }), _jsxs("label", { className: "space-y-1.5 text-ui-xs text-foreground", children: [_jsx("span", { className: "font-medium text-foreground-subtle", children: "\u4E0A\u65B9\u95F4\u8DDD (margin_top px)" }), _jsx(Input, { type: "number", value: brandData.margin_top ?? 0, onChange: (e) => updateBrandField({ margin_top: Number(e.target.value) }), className: "h-8.5 font-mono text-ui-xs" })] }), _jsxs("label", { className: "space-y-1.5 text-ui-xs text-foreground", children: [_jsx("span", { className: "font-medium text-foreground-subtle", children: "\u4E0B\u65B9\u95F4\u8DDD (margin_bottom px)" }), _jsx(Input, { type: "number", value: brandData.margin_bottom ?? 0, onChange: (e) => updateBrandField({ margin_bottom: Number(e.target.value) }), className: "h-8.5 font-mono text-ui-xs" })] }), _jsxs("div", { className: "flex items-center justify-between rounded-lg border border-border/80 bg-surface/50 p-3 sm:col-span-2", children: [_jsxs("div", { className: "space-y-0.5", children: [_jsx("div", { className: "text-ui-xs font-semibold text-foreground", children: "\u5361\u7247\u8FB9\u6846\u4E0E\u67D4\u548C\u9634\u5F71" }), _jsx("div", { className: "text-ui-xs text-foreground-subtle", children: "\u5728\u54C1\u724C\u56FE\u5468\u56F4\u589E\u52A0\u4E00\u5C42\u5361\u7247\u5916\u6846\u4E0E\u9634\u5F71\uFF0C\u66F4\u5177\u8D28\u611F" })] }), _jsx(Switch, { checked: Boolean(brandData.frame), onCheckedChange: (checked) => updateBrandField({ frame: checked }) })] })] })] }));
}
//# sourceMappingURL=SocialPublisherContentBrandSubTab.js.map