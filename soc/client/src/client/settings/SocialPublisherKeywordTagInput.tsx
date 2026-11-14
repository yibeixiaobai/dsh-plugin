import { useState, type KeyboardEvent, type ClipboardEvent } from "react";
import { Plus, X, Trash2 } from "lucide-react";
import { Input } from "../compat/components/ui/input.js";
import { Button } from "../compat/components/ui/button.js";
import { cn } from "../compat/components/lib/utils.js";

export interface KeywordTagInputProps {
  label: string;
  subLabel?: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  presetTags?: string[];
  emptyHint?: string;
  className?: string;
}

/**
 * 关键词胶囊标签输入组件
 * 对齐定时规则（SocialPublisherContentScheduleSubTab）交互范式：
 * 胶囊标签展示、单项点击 X 移除、回车/逗号成词、多行智能粘贴解析、常用预设一键点选。
 */
export function SocialPublisherKeywordTagInput({
  label,
  subLabel,
  tags = [],
  onChange,
  placeholder = "输入关键词后按回车添加...",
  presetTags,
  emptyHint = "暂未配置关键词标签",
  className,
}: KeywordTagInputProps) {
  const [inputValue, setInputValue] = useState("");
  const safeTags = Array.isArray(tags) ? tags : [];

  const addTag = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!safeTags.includes(trimmed)) {
      onChange([...safeTags, trimmed]);
    }
    setInputValue("");
  };

  const removeTag = (tagToRemove: string) => {
    onChange(safeTags.filter((t) => t !== tagToRemove));
  };

  const clearAll = () => {
    onChange([]);
    setInputValue("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === "，") {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === "Backspace" && !inputValue && safeTags.length > 0) {
      const lastTag = safeTags[safeTags.length - 1];
      if (lastTag !== undefined) {
        removeTag(lastTag);
      }
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasteText = e.clipboardData.getData("text");
    if (!pasteText) return;
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

  return (
    <div
      className={cn(
        "rounded-xl border border-border/80 bg-surface/50 p-4 space-y-3 transition-colors",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <div className="text-ui-xs font-semibold text-foreground flex items-center gap-2">
            <span>{label}</span>
            <span className="text-ui-2xs font-normal text-foreground-subtle bg-background px-1.5 py-0.5 rounded border border-border">
              {safeTags.length} 个
            </span>
          </div>
          {subLabel && <p className="text-ui-2xs text-foreground-subtle leading-tight">{subLabel}</p>}
        </div>
        {safeTags.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearAll}
            className="h-6 gap-1 px-1.5 text-ui-2xs text-foreground-subtle hover:text-destructive cursor-pointer"
          >
            <Trash2 className="size-3" />
            <span>清空</span>
          </Button>
        )}
      </div>

      {/* 标签池与输入框 */}
      <div className="flex flex-wrap items-center gap-2 min-h-9 p-1.5 rounded-lg border border-border/60 bg-background/60">
        {safeTags.map((tag) => (
          <div
            key={tag}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-ui-xs font-medium text-foreground shadow-2xs group hover:border-primary/50 transition-colors"
          >
            <span>{tag}</span>
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="text-foreground-subtle hover:text-destructive cursor-pointer p-0.5 rounded transition-colors"
              title={`移除 ${tag}`}
            >
              <X className="size-3" />
            </button>
          </div>
        ))}

        {/* 紧凑输入与添加 */}
        <div className="inline-flex items-center gap-1 flex-1 min-w-[140px]">
          <Input
            type="text"
            placeholder={safeTags.length === 0 ? emptyHint : placeholder}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            className="h-7.5 text-ui-xs px-2.5 border-dashed focus:border-solid bg-transparent shadow-none"
          />
          {inputValue.trim() && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addTag(inputValue)}
              className="h-7.5 px-2 text-ui-xs cursor-pointer gap-0.5 shrink-0"
            >
              <Plus className="size-3" />
              <span>添加</span>
            </Button>
          )}
        </div>
      </div>

      {/* 常用预设快捷点选池 */}
      {Array.isArray(presetTags) && presetTags.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
          <span className="text-ui-2xs text-foreground-subtle">常用推荐:</span>
          {presetTags.map((pt) => {
            const isAdded = safeTags.includes(pt);
            return (
              <button
                key={pt}
                type="button"
                disabled={isAdded}
                onClick={() => addTag(pt)}
                className={cn(
                  "text-ui-2xs px-2 py-0.5 rounded border transition-colors cursor-pointer",
                  isAdded
                    ? "opacity-40 border-border text-foreground-subtle cursor-default"
                    : "border-border/70 hover:border-primary/60 text-foreground-subtle hover:text-primary bg-background/50",
                )}
              >
                + {pt}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
