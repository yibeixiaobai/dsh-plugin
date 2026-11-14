import { useState } from "react";
import { CheckCircle2, AlertCircle, RefreshCw, Monitor, ShieldCheck, Lock } from "lucide-react";
import { Button } from "../compat/components/ui/button.js";
import { SocialPublisherLoginModal } from "./SocialPublisherLoginModal.js";

interface AccountLoginCardProps {
  currentAccount: any;
  selectedAccountId: string;
  isGzh: boolean;
  needsBrowserSession: boolean;
  loginStatusMap?: Record<string, boolean | null>;
  checkingLogin?: string | null;
  loginingAccountId?: string | null;
  checkLoginStatus?: (platform: string, accountId: string) => void;
  triggerLogin?: (platform: string, accountId: string) => void;
  fetchConfig?: () => void;
}

export function SocialPublisherAccountLoginCard({
  currentAccount,
  selectedAccountId,
  isGzh,
  needsBrowserSession,
  loginStatusMap,
  checkingLogin,
  loginingAccountId: _loginingAccountId,
  checkLoginStatus,
  triggerLogin: _triggerLogin,
  fetchConfig,
}: AccountLoginCardProps) {
  const [internalModalOpen, setInternalModalOpen] = useState(false);

  if (!needsBrowserSession) {
    return (
      <div className="rounded-xl border border-dashed border-emerald-500/30 bg-emerald-500/[0.04] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-ui-xs text-foreground">
        <div className="flex items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <ShieldCheck className="size-4" />
          </div>
          <div className="space-y-0.5">
            <span className="font-semibold text-ui-sm text-foreground">
              官方 API 直连模式（无需扫码登录）
            </span>
            <p className="text-ui-xs text-foreground-subtle">
              当前微信公众号未开启“自动原创声明”，直接通过官方接口提交草稿，仅需填写 AppID 与
              AppSecret 即可。
            </p>
          </div>
        </div>
        <span className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-ui-xs font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
          纯 API 直通
        </span>
      </div>
    );
  }

  const isAuthed = loginStatusMap ? loginStatusMap[selectedAccountId] : null;
  const platform = currentAccount.platform || "gzh";
  const partitionId = `persist:social_${platform.toLowerCase()}_${selectedAccountId.trim()}`;

  return (
    <>
      <div className="rounded-xl border border-card-border bg-card/70 p-4 shadow-2xs backdrop-blur-md flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Lock className="size-4 text-primary" />
              <span className="text-ui-sm font-bold text-foreground">浏览器会话凭据与授权态</span>
            </div>

            {loginStatusMap &&
              selectedAccountId in loginStatusMap &&
              (isAuthed ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-ui-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-3" />
                  <span>已授权登录 (有效)</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-0.5 text-ui-xs font-medium text-amber-600 dark:text-amber-400">
                  <AlertCircle className="size-3" />
                  <span>未登录或已过期</span>
                </span>
              ))}

            <span className="rounded bg-surface-active px-2 py-0.5 font-mono text-ui-xs text-foreground-subtle">
              分区: {partitionId}
            </span>
          </div>

          <p className="text-ui-xs text-foreground-subtle leading-relaxed">
            {isGzh && currentAccount.publish_mode === "browser"
              ? "免 API 模式：支持在内置浏览器中完成公众号后台登录，独立 Partition 隔离会话，持久化发稿。"
              : isGzh && currentAccount.wechat?.auto_enable_original
                ? "已开启自动原创声明：草稿创建后需通过浏览器模拟进入草稿箱开启原创，请扫码授权登录公众号。"
                : "知乎、百家号、小红书、头条号等平台依赖浏览器模拟发布，支持直接在内置浏览器中扫码登录，各账号多开隔离互不影响。"}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {checkLoginStatus && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => checkLoginStatus(platform, selectedAccountId)}
              disabled={checkingLogin === selectedAccountId}
              className="h-8 gap-1.5 text-ui-xs"
            >
              <RefreshCw
                className={`size-3.5 ${checkingLogin === selectedAccountId ? "animate-spin" : ""}`}
              />
              <span>{checkingLogin === selectedAccountId ? "检测中..." : "检测状态"}</span>
            </Button>
          )}

          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => setInternalModalOpen(true)}
            className="h-8 gap-1.5 text-ui-xs font-medium"
          >
            <Monitor className="size-3.5" />
            <span>内置浏览器登录 (多开隔离)</span>
          </Button>
        </div>
      </div>

      {/* 内置浏览器专属隔离登录窗口 */}
      <SocialPublisherLoginModal
        open={internalModalOpen}
        onOpenChange={setInternalModalOpen}
        platform={platform}
        accountId={selectedAccountId}
        accountName={currentAccount.name}
        onLoginSuccess={() => {
          checkLoginStatus?.(platform, selectedAccountId);
          fetchConfig?.();
        }}
      />
    </>
  );
}
