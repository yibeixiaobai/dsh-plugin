import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Plus, X, Trash2 } from "lucide-react";
import { Input } from "../compat/components/ui/input.js";
import { Button } from "../compat/components/ui/button.js";
import { cn } from "../compat/components/lib/utils.js";
/**
 * 关键词胶囊标签输入组件
 * 对齐定时规则（SocialPublisherContentScheduleSubTab）交互范式：
 * 胶囊标签展示、单项点击 X 移除、回车/逗号成词、多行智能粘贴解析、常用预设一键点选。
 */
export function SocialPublisherKeywordTagInput({ label, subLabel, tags = [], onChange, placeholder = "输入关键词后按回车添加...", presetTags, emptyHint = "暂未配置关键词标签", className, }) {
    const [inputValue, setInputValue] = useState("");
    const safeTags = Array.isArray(tags) ? tags : [];
    const addTag = (text) => {
        const trimmed = text.trim();
        if (!trimmed)
            return;
        if (!safeTags.includes(trimmed)) {
            onChange([...safeTags, trimmed]);
        }
        setInputValue("");
    };
    const removeTag = (tagToRemove) => {
        onChange(safeTags.filter((t) => t !== tagToRemove));
    };
    const clearAll = () => {
        onChange([]);
        setInputValue("");
    };
    const handleKeyDown = (e) => {
        if (e.key === "Enter" || e.key === "," || e.key === "，") {
            e.preventDefault();
            addTag(inputValue);
        }
        else if (e.key === "Backspace" && !inputValue && safeTags.length > 0) {
            const lastTag = safeTags[safeTags.length - 1];
            if (lastTag !== undefined) {
                removeTag(lastTag);
            }
        }
    };
    const handlePaste = (e) => {
        const pasteText = e.clipboardData.getData("text");
        if (!pasteText)
            return;
        const tokens = pasteText
            .split(/[\n,，、\t\r]+/)
            .map((s) => s.trim())
            .filter(Boolean);
        if (tokens.length > 1) {
            e.preventDefault();
            const combined = Array.from(new Set([...safeTags, ...tokens]));
            onChange(combined);
            setInputValue("");
        }
    };
    return (_jsxs("div", { className: cn("rounded-xl border border-border/80 bg-surface/50 p-4 space-y-3 transition-colors", className), children: [_jsxs("div", { className: "flex items-start justify-between gap-2", children: [_jsxs("div", { className: "space-y-0.5", children: [_jsxs("div", { className: "text-ui-xs font-semibold text-foreground flex items-center gap-2", children: [_jsx("span", { children: label }), _jsxs("span", { className: "text-ui-2xs font-normal text-foreground-subtle bg-background px-1.5 py-0.5 rounded border border-border", children: [safeTags.length, " \u4E2A"] })] }), subLabel && _jsx("p", { className: "text-ui-2xs text-foreground-subtle leading-tight", children: subLabel })] }), safeTags.length > 0 && (_jsxs(Button, { type: "button", variant: "ghost", size: "sm", onClick: clearAll, className: "h-6 gap-1 px-1.5 text-ui-2xs text-foreground-subtle hover:text-destructive cursor-pointer", children: [_jsx(Trash2, { className: "size-3" }), _jsx("span", { children: "\u6E05\u7A7A" })] }))] }), _jsxs("div", { className: "flex flex-wrap items-center gap-2 min-h-9 p-1.5 rounded-lg border border-border/60 bg-background/60", children: [safeTags.map((tag) => (_jsxs("div", { className: "inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-ui-xs font-medium text-foreground shadow-2xs group hover:border-primary/50 transition-colors", children: [_jsx("span", { children: tag }), _jsx("button", { type: "button", onClick: () => removeTag(tag), className: "text-foreground-subtle hover:text-destructive cursor-pointer p-0.5 rounded transition-colors", title: `移除 ${tag}`, children: _jsx(X, { className: "size-3" }) })] }, tag))), _jsxs("div", { className: "inline-flex items-center gap-1 flex-1 min-w-[140px]", children: [_jsx(Input, { type: "text", placeholder: safeTags.length === 0 ? emptyHint : placeholder, value: inputValue, onChange: (e) => setInputValue(e.target.value), onKeyDown: handleKeyDown, onPaste: handlePaste, className: "h-7.5 text-ui-xs px-2.5 border-dashed focus:border-solid bg-transparent shadow-none" }), inputValue.trim() && (_jsxs(Button, { type: "button", variant: "outline", size: "sm", onClick: () => addTag(inputValue), className: "h-7.5 px-2 text-ui-xs cursor-pointer gap-0.5 shrink-0", children: [_jsx(Plus, { className: "size-3" }), _jsx("span", { children: "\u6DFB\u52A0" })] }))] })] }), Array.isArray(presetTags) && presetTags.length > 0 && (_jsxs("div", { className: "flex items-center gap-1.5 flex-wrap pt-0.5", children: [_jsx("span", { className: "text-ui-2xs text-foreground-subtle", children: "\u5E38\u7528\u63A8\u8350:" }), presetTags.map((pt) => {
                        const isAdded = safeTags.includes(pt);
                        return (_jsxs("button", { type: "button", disabled: isAdded, onClick: () => addTag(pt), className: cn("text-ui-2xs px-2 py-0.5 rounded border transition-colors cursor-pointer", isAdded
                                ? "opacity-40 border-border text-foreground-subtle cursor-default"
                                : "border-border/70 hover:border-primary/60 text-foreground-subtle hover:text-primary bg-background/50"), children: ["+ ", pt] }, pt));
                    })] }))] }));
}
//# sourceMappingURL=SocialPublisherKeywordTagInput.js.map