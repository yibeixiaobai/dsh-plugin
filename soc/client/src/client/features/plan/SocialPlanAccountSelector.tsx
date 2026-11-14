import { useMemo } from "react";
import { CheckCircle2, Monitor } from "lucide-react";
import { cn } from "../../compat/components/lib/utils.js";

interface SocialAccountItem {
  id: string;
  name?: string;
  platform?: string;
  enabled?: boolean;
}

interface SocialPlanAccountSelectorProps {
  accounts: SocialAccountItem[];
  selectedAccountId: string;
  onSelectAccount: (accountId: string) => void;
  onOpenLoginModal?: (accountId: string) => void;
  scheduledCountsByAccount?: Record<string, number>;
  draftCountsByAccount?: Record<string, number>;
}

export function SocialPlanAccountSelector({
  accounts,
  selectedAccountId,
  onSelectAccount,
  onOpenLoginModal,
  scheduledCountsByAccount = {},
  draftCountsByAccount = {},
}: SocialPlanAccountSelectorProps) {
  const gzhAccounts = useMemo(() => {
    return accounts.filter((a) => (a.platform || "gzh") === "gzh");
  }, [accounts]);

  if (gzhAccounts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2.5" data-testid="social-plan-account-selector">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-ui-xs font-semibold tracking-tight text-foreground">
            微信公众号发布矩阵
          </span>
          <span className="rounded-full bg-surface-active px-2 py-0.5 text-[10px] font-mono text-foreground-subtle border border-border/50">
            {gzhAccounts.length} 个账号
          </span>
        </div>
        <span className="text-[11px] text-foreground-subtle">
          点击切换当前工作账号，下方排期与草稿自动联动
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
        {gzhAccounts.map((account) => {
          const isSelected = account.id === selectedAccountId;
          const scheduledCount = scheduledCountsByAccount[account.id] ?? 0;
          const draftCount = draftCountsByAccount[account.id] ?? 0;
          const displayName = account.name || account.id || "未命名公众号";

          return (
            <div
              key={account.id}
              onClick={() => onSelectAccount(account.id)}
              className={cn(
                "group relative flex flex-col justify-between rounded-xl border p-3 cursor-pointer select-none transition-all duration-150",
                isSelected
                  ? "border-emerald-500/50 bg-emerald-500/[0.04] shadow-xs ring-1 ring-emerald-500/30"
                  : "border-card-border/80 bg-card/60 hover:border-border hover:bg-card/90",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-lg border text-ui-xs font-bold font-mono transition-colors",
                      isSelected
                        ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                        : "bg-surface-active/80 border-border/60 text-foreground-subtle",
                    )}
                  >
                    微
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "text-ui-xs font-semibold truncate",
                          isSelected ? "text-foreground" : "text-foreground/80",
                        )}
                        title={displayName}
                      >
                        {displayName}
                      </span>
                      {isSelected ? (
                        <CheckCircle2 className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      ) : null}
                    </div>
                    <div className="text-[10px] font-mono text-foreground-subtle truncate">
                      ID: {account.id}
                    </div>
                  </div>
                </div>

                {onOpenLoginModal ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenLoginModal(account.id);
                    }}
                    className="shrink-0 p-1 rounded-md text-foreground-subtle hover:text-foreground hover:bg-surface-hover/80 transition-colors"
                    title="扫码授权/重连微信"
                  >
                    <Monitor className="size-3.5" />
                  </button>
                ) : null}
              </div>

              {/* 账号资产概览标签 */}
              <div className="mt-2.5 flex items-center gap-2 border-t border-border/40 pt-2 text-[11px] text-foreground-subtle">
                <span className="flex items-center gap-1">
                  <span>排期</span>
                  <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                    {scheduledCount}
                  </span>
                </span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <span>草稿</span>
                  <span className="font-mono font-semibold text-sky-600 dark:text-sky-400">
                    {draftCount}
                  </span>
                </span>
                <span className="ml-auto text-[10px] text-foreground-subtle/70">
                  {isSelected ? "当前选定" : "点击选择"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
