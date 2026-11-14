import { useMemo, useState } from "react";
import css from "./SocialPublisherSettings.module.css";
import { Button } from "../compat/components/ui/button.js";
import { Switch } from "../compat/components/ui/switch.js";
import {
  Plus,
  Trash2,
  Copy,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Crown,
  AlertTriangle,
} from "lucide-react";
import {
  resolveEffectiveSocialAccounts,
  normalizeAccountsList,
  type SocialAccountQuotaStatus,
} from "../compat/types.js";
import {
  DEFAULT_PLATFORM_INFO,
  PLATFORM_MAP,
  DEFAULT_BRAND_IMAGES_CONFIG,
  mergeAccountBrandImages,
} from "./SocialPublisherBrandHelpers.js";
import { SocialPublisherAccountLoginCard } from "./SocialPublisherAccountLoginCard.js";
import { SocialPublisherAccountForm } from "./SocialPublisherAccountForm.js";
import { useMembership } from "../compat/hooks/useMembership.js";
import { MembershipUpgradeDialog } from "./MembershipUpgradeDialog.js";

interface AccountTabProps {
  config: any;
  setConfig: React.Dispatch<React.SetStateAction<any>>;
  selectedAccountId: string;
  setSelectedAccountId: (id: string) => void;
  revealSecrets: Record<string, boolean>;
  setRevealSecrets: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  triggerLogin: (platform: string, accountId: string) => void;
  loginStatusMap?: Record<string, boolean | null>;
  checkingLogin?: string | null;
  checkLoginStatus?: (platform: string, accountId: string) => void;
  loginingAccountId?: string | null;
  fetchConfig?: () => void;
}



export function SocialPublisherAccountTab({
  config,
  setConfig,
  selectedAccountId,
  setSelectedAccountId,
  revealSecrets,
  setRevealSecrets,
  triggerLogin,
  loginStatusMap,
  checkingLogin,
  checkLoginStatus,
  loginingAccountId,
  fetchConfig,
}: AccountTabProps) {
  const accountsList = useMemo(() => normalizeAccountsList(config.accounts), [config.accounts]);
  const currentAccount = useMemo(
    () => accountsList.find((a: any) => a.id === selectedAccountId) || accountsList[0] || {},
    [accountsList, selectedAccountId],
  );

  const updateCurrentAccount = (patch: any) => {
    setConfig((prev: any) => ({
      ...prev,
      // [中文修复依据]：账号更新深拷贝隔离，杜绝跨账号引用污染
      accounts: normalizeAccountsList(prev.accounts).map((a: any) => {
        if (a.id !== selectedAccountId) return a;
        const cloned = JSON.parse(JSON.stringify(a));
        return {
          ...cloned,
          ...patch,
          brand_images: mergeAccountBrandImages(cloned.brand_images, patch.brand_images),
        };
      }),
    }));
  };

  const isGzh = currentAccount.platform === "gzh";
  const autoOriginal = Boolean(
    currentAccount.wechat?.auto_enable_original ?? currentAccount.auto_enable_original,
  );
  const needsBrowserSession = !(
    isGzh &&
    currentAccount.publish_mode !== "browser" &&
    !autoOriginal
  );

  const { profile } = useMembership();
  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<string>("");

  const accountLimit = profile?.privileges.socialAccountsLimit ?? 1;
  const currentTier = profile?.tier ?? "free";
  const tierLabel =
    currentTier === "platinum" ? "铂金会员" : currentTier === "pro" ? "高级会员" : "普通会员";

  const quotaResult = useMemo(
    () => resolveEffectiveSocialAccounts(accountsList, accountLimit),
    [accountsList, accountLimit],
  );
  const isQuotaFull = accountLimit !== -1 && quotaResult.activeCount >= accountLimit;

  return (
    <div className="space-y-6" data-testid="social-publisher-account-tab">
      {/* 顶部账号状态与配额栏 */}
      <div className="flex flex-col gap-3 rounded-xl border border-card-border bg-card/60 p-4 shadow-2xs backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-ui-base font-bold text-foreground">社媒矩阵发布账号</h3>
            <span className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-ui-xs text-foreground-subtle">
              {quotaResult.activeCount} 个生效 · {quotaResult.disabledCount} 个已停用 · 共{" "}
              {accountsList.length} 个
            </span>
          </div>
          <p className="text-ui-xs text-foreground-subtle">
            配置公众号、知乎、小红书、百家号与头条号的发布凭据与授权会话
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-border/80 bg-surface/80 px-2.5 py-1 text-ui-xs text-foreground-subtle">
            <Crown className="size-3.5 text-amber-500 shrink-0" />
            <span>
              配额: {quotaResult.activeCount} / {accountLimit === -1 ? "无限" : `${accountLimit}个`}{" "}
              ({tierLabel})
            </span>
            {isQuotaFull && (
              <button
                type="button"
                onClick={() => {
                  setUpgradeReason("升级会员解锁更多社媒账号生效配额");
                  setUpgradeDialogOpen(true);
                }}
                className="ml-1 font-medium text-primary hover:underline cursor-pointer"
              >
                升级
              </button>
            )}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const newId = `account_${Date.now().toString().slice(-4)}`;
              // [中文修复依据]：克隆账号深拷贝完整数据结构，杜绝与源账号共享 brand_images 对象引用
              const clonedSource = JSON.parse(JSON.stringify(currentAccount || {}));
              const newAcc = {
                ...clonedSource,
                id: newId,
                name: `${currentAccount.name || "新账号"}-克隆`,
                enabled: !isQuotaFull,
              };
              setConfig((prev: any) => ({
                ...prev,
                accounts: [...normalizeAccountsList(prev.accounts), newAcc],
              }));
              setSelectedAccountId(newId);
            }}
            className="h-8 gap-1 text-ui-xs"
          >
            <Copy className="size-3.5" />
            <span>克隆</span>
          </Button>

          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => {
              const newId = `account_${Date.now().toString().slice(-4)}`;
              const newAcc = {
                id: newId,
                name: "新社媒账号",
                platform: "gzh",
                enabled: !isQuotaFull,
                publish_mode: "api",
                publish_immediately: false,
                wechat: { appid: "", app_secret: "", author_name: "", brand_name: "" },
                content: { articles_per_day: 6, min_words: 2000, topics: [], forbidden_words: [] },
                // [中文修复依据]：新建账号赋予完全独立的 brand_images 出厂深拷贝，杜绝引用全局配置
                brand_images: JSON.parse(JSON.stringify(DEFAULT_BRAND_IMAGES_CONFIG)),
              };
              setConfig((prev: any) => ({
                ...prev,
                accounts: [...normalizeAccountsList(prev.accounts), newAcc],
              }));
              setSelectedAccountId(newId);
            }}
            className="h-8 gap-1 text-ui-xs"
          >
            <Plus className="size-3.5" />
            <span>新建账号</span>
          </Button>
        </div>
      </div>

      {/* 账号水平卡片选择栏 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {quotaResult.items.map((item) => {
          const acc = item.account;
          const isSelected = item.id === selectedAccountId;
          const status: SocialAccountQuotaStatus = item.status;
          const pInfo = PLATFORM_MAP[item.platform] ?? DEFAULT_PLATFORM_INFO;
          const isAccGzh = item.platform === "gzh";
          const accAutoOriginal = Boolean(
            acc.wechat?.auto_enable_original ?? acc.auto_enable_original,
          );
          const accNeedsBrowser = !(isAccGzh && acc.publish_mode !== "browser" && !accAutoOriginal);
          const isAuthed = loginStatusMap ? loginStatusMap[item.id] : null;

          return (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedAccountId(item.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setSelectedAccountId(item.id);
              }}
              className={`${css.accountCard} ${
                isSelected ? css.accountCardSelected : ""
              } ${status === "disabled" ? css.accountCardDisabled : ""}`}
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="truncate font-semibold text-ui-sm text-foreground"
                    title={item.name}
                  >
                    {item.name}
                  </span>
                  <div
                    className="flex items-center gap-1.5 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span
                      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-ui-xs font-medium ${
                        status === "active"
                          ? pInfo.color
                          : status === "over_quota"
                            ? "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400"
                            : "border-border bg-muted text-muted-foreground"
                      }`}
                      title={item.reason}
                    >
                      {status === "active"
                        ? pInfo.badge
                        : status === "over_quota"
                          ? "超额未生效"
                          : "已停用"}
                    </span>
                    <Switch
                      checked={acc.enabled !== false}
                      onCheckedChange={(checked) => {
                        if (checked && isQuotaFull && acc.enabled === false) {
                          setUpgradeReason(
                            `当前有效配额已达上限(${accountLimit}个)，开启后将按顺序处于超额未生效状态。`,
                          );
                        }
                        setConfig((prev: any) => ({
                          ...prev,
                          accounts: normalizeAccountsList(prev.accounts).map((a: any) =>
                            a.id === item.id ? { ...a, enabled: checked } : a,
                          ),
                        }));
                      }}
                      className="scale-75 origin-right"
                      title={acc.enabled === false ? "点击启用此账号" : "点击停用此账号"}
                    />
                  </div>
                </div>
                <div className="truncate font-mono text-ui-xs text-foreground-subtle">
                  ID: {item.id}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2 text-ui-xs">
                <span className="text-foreground-subtle">
                  {status === "disabled"
                    ? "未开启(跳过)"
                    : status === "over_quota"
                      ? "超额暂缓"
                      : acc.publish_mode === "browser"
                        ? "免 API 模式"
                        : acc.platform === "gzh"
                          ? "API 接口"
                          : "自动化"}
                </span>
                {status === "active" && accNeedsBrowser ? (
                  isAuthed ? (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="size-3" /> 已登录
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                      <AlertCircle className="size-3" /> 待扫码
                    </span>
                  )
                ) : status === "active" ? (
                  <span className="flex items-center gap-1 text-foreground-subtle">
                    <ShieldCheck className="size-3 text-muted-foreground" /> 纯API免扫码
                  </span>
                ) : status === "over_quota" ? (
                  <span
                    className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium"
                    title={item.reason}
                  >
                    <AlertTriangle className="size-3" /> 超额休眠
                  </span>
                ) : (
                  <span className="text-muted-foreground">未启用</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 当前选中账号的配置面板 */}
      <div className="space-y-4 rounded-xl border border-card-border bg-card/70 p-5 shadow-2xs backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-border/70 pb-3">
          <div className="flex items-center gap-2.5">
            <h3 className="text-ui-base font-bold text-foreground">
              账号配置: {currentAccount.name || currentAccount.id}
            </h3>
            <span className="rounded bg-surface-active px-2 py-0.5 font-mono text-ui-xs text-foreground-subtle">
              {currentAccount.id}
            </span>
          </div>
          {accountsList.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-ui-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                setConfig((prev: any) => ({
                  ...prev,
                  accounts: normalizeAccountsList(prev.accounts).filter(
                    (a: any) => a.id !== selectedAccountId,
                  ),
                }));
                setSelectedAccountId(
                  accountsList.find((a: any) => a.id !== selectedAccountId)?.id || "",
                );
              }}
            >
              <Trash2 className="size-3.5" />
              <span>删除账号</span>
            </Button>
          )}
        </div>

        <SocialPublisherAccountForm
          currentAccount={currentAccount}
          selectedAccountId={selectedAccountId}
          updateCurrentAccount={updateCurrentAccount}
          revealSecrets={revealSecrets}
          setRevealSecrets={setRevealSecrets}
        />
      </div>

      {/* 账号浏览器授权会话卡片 */}
      <SocialPublisherAccountLoginCard
        currentAccount={currentAccount}
        selectedAccountId={selectedAccountId}
        isGzh={isGzh}
        needsBrowserSession={needsBrowserSession}
        loginStatusMap={loginStatusMap}
        checkingLogin={checkingLogin}
        loginingAccountId={loginingAccountId}
        checkLoginStatus={checkLoginStatus}
        triggerLogin={triggerLogin}
        fetchConfig={fetchConfig}
      />

      <MembershipUpgradeDialog
        open={upgradeDialogOpen}
        onClose={() => setUpgradeDialogOpen(false)}
        reason={upgradeReason}
      />
    </div>
  );
}
