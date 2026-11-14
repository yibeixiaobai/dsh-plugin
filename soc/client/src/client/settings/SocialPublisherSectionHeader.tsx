import { Share2, ShieldCheck, RefreshCw } from "lucide-react";
import css from "./SocialPublisherSettings.module.css";
import { Button } from "../compat/components/ui/button.js";

interface SocialPublisherSectionHeaderProps {
  isRpcDirect: boolean;
  activeAccountsCount: number;
  totalAccountsCount: number;
  loading: boolean;
  onRefresh: () => void;
}

export function SocialPublisherSectionHeader({
  isRpcDirect,
  activeAccountsCount,
  totalAccountsCount,
  loading,
  onRefresh,
}: SocialPublisherSectionHeaderProps) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-4 ${css.card}`}>
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
          <Share2 className="size-5" />
        </div>
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-ui-base font-bold text-foreground tracking-tight">
              社媒多平台发布矩阵
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-ui-xs font-medium text-foreground-subtle">
              <ShieldCheck className="size-3 text-emerald-500" />
              {isRpcDirect ? "RPC 原生直通" : "本地服务模式"}
            </span>
          </div>
          <p className="text-ui-xs text-foreground-subtle">
            全平台矩阵账号授权、排版排期规范、AI配图接口池与自动化发布总览控制台
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <div className="hidden items-center gap-1.5 rounded-lg border border-border/70 bg-surface/60 px-3 py-1.5 text-ui-xs text-foreground-subtle sm:flex">
          <span>已启用账号:</span>
          <strong className="text-ui-xs font-semibold text-foreground">
            {activeAccountsCount} / {totalAccountsCount}
          </strong>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={loading}
          title="重新从后台载入配置"
          className="h-8 gap-1.5 text-ui-xs"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>刷新</span>
        </Button>
      </div>
    </div>
  );
}
