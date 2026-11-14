import { RefreshCw, Save, CheckCircle2, Clock } from "lucide-react";
import css from "./SocialPublisherSettings.module.css";
import { Button } from "../compat/components/ui/button.js";

interface SocialPublisherStickyBarProps {
  isDirty: boolean;
  loading: boolean;
  saving: boolean;
  onRefresh: () => void;
  onSave: () => void;
}

export function SocialPublisherStickyBar({
  isDirty,
  loading,
  saving,
  onRefresh,
  onSave,
}: SocialPublisherStickyBarProps) {
  return (
    <div
      data-testid="social-publisher-sticky-bar"
      className={css.stickyBar}
    >
      <div className="flex items-center gap-2.5">
        <span className={`relative flex size-2.5 items-center justify-center`}>
          {isDirty ? (
            <>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400/75 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
            </>
          ) : (
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          )}
        </span>

        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
          <div className="flex items-center gap-1.5">
            {isDirty ? (
              <Clock className="size-3.5 text-amber-500 shrink-0" />
            ) : (
              <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
            )}
            <span className="text-ui-sm font-medium text-foreground">
              {isDirty ? "配置已修改（尚未保存）" : "配置已同步并即时生效"}
            </span>
          </div>
          <div className="hidden items-center gap-1 text-ui-xs text-foreground-subtle sm:inline-flex">
            <span>· 按</span>
            <kbd className="rounded border border-border/80 bg-surface-active px-1.5 py-0.5 font-mono text-ui-xs font-medium text-foreground">
              Ctrl+S
            </kbd>
            <span>或</span>
            <kbd className="rounded border border-border/80 bg-surface-active px-1.5 py-0.5 font-mono text-ui-xs font-medium text-foreground">
              ⌘S
            </kbd>
            <span>快捷保存</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={loading || saving}
          title="重新从后台载入配置，放弃当前未保存的修改"
          className="h-8 gap-1.5 text-ui-xs"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>{isDirty ? "放弃修改" : "重新加载"}</span>
        </Button>
        <Button
          type="button"
          variant={isDirty ? "default" : "secondary"}
          size="sm"
          onClick={onSave}
          disabled={saving}
          className={`h-8 gap-1.5 text-ui-xs font-medium transition-all ${
            isDirty ? "shadow-sm shadow-primary/20" : ""
          }`}
        >
          <Save className={`size-3.5 ${saving ? "animate-spin" : ""}`} />
          <span>{saving ? "保存中..." : "保存配置"}</span>
        </Button>
      </div>
    </div>
  );
}
