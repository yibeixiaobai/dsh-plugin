import { Input } from "../compat/components/ui/input.js";
import { Switch } from "../compat/components/ui/switch.js";
import { Eye, EyeOff, Info, Key, Shield } from "lucide-react";

interface AccountFormProps {
  currentAccount: any;
  selectedAccountId: string;
  updateCurrentAccount: (patch: any) => void;
  revealSecrets: Record<string, boolean>;
  setRevealSecrets: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}

export function SocialPublisherAccountForm({
  currentAccount,
  selectedAccountId,
  updateCurrentAccount,
  revealSecrets,
  setRevealSecrets,
}: AccountFormProps) {
  const isGzh = currentAccount.platform === "gzh";

  return (
    <div className="space-y-5" data-testid="social-publisher-account-form">
      {/* 账号启用与基本资料卡片 */}
      <div className="rounded-xl border border-border/80 bg-surface/50 p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-ui-sm font-semibold text-foreground">基本档案与启用状态</span>
            <span
              className={`rounded px-2 py-0.5 text-ui-xs font-medium border ${
                currentAccount.enabled !== false
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                  : "bg-muted text-muted-foreground border-border"
              }`}
            >
              {currentAccount.enabled !== false ? "已启用" : "已停用"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-ui-xs text-foreground-subtle hidden sm:inline">
              停用后自动化发文与全网分发将跳过此账号
            </span>
            <Switch
              checked={currentAccount.enabled !== false}
              onCheckedChange={(checked) => updateCurrentAccount({ enabled: checked })}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-ui-sm text-foreground">
            <span className="font-medium text-ui-xs text-foreground-subtle">账号显示名称</span>
            <Input
              value={currentAccount.name || ""}
              onChange={(e) => updateCurrentAccount({ name: e.target.value })}
              placeholder="例如：科技前沿观察"
              className="h-9 text-ui-sm"
            />
          </label>

          <label className="space-y-1.5 text-ui-sm text-foreground">
            <span className="font-medium text-ui-xs text-foreground-subtle">
              发布平台 (Platform)
            </span>
            <select
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-ui-xs text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-primary"
              value={currentAccount.platform || "gzh"}
              onChange={(e) => updateCurrentAccount({ platform: e.target.value })}
            >
              <option value="gzh">微信公众号 (单行 13px HTML / 草稿箱)</option>
              <option value="zhihu">知乎专栏 (标准 Markdown / 浏览器自动化)</option>
              <option value="xiaohongshu">小红书 (3:4 竖版多图文案 / 浏览器自动化)</option>
              <option value="baijiahao">百家号 (标准 Markdown / 浏览器自动化)</option>
              <option value="toutiao">今日头条 (标准 Markdown / 浏览器自动化)</option>
            </select>
          </label>

          <label className="space-y-1.5 text-ui-sm text-foreground">
            <span className="font-medium text-ui-xs text-foreground-subtle">默认品牌名称</span>
            <Input
              value={currentAccount.wechat?.brand_name || currentAccount.brand_name || ""}
              onChange={(e) =>
                updateCurrentAccount({
                  brand_name: e.target.value,
                  wechat: { ...currentAccount.wechat, brand_name: e.target.value },
                })
              }
              placeholder="例如：前沿科技视界"
              className="h-9 text-ui-sm"
            />
          </label>

          <label className="space-y-1.5 text-ui-sm text-foreground">
            <span className="font-medium text-ui-xs text-foreground-subtle">
              文章作者名 (Author)
            </span>
            <Input
              value={currentAccount.wechat?.author_name || currentAccount.author_name || ""}
              onChange={(e) =>
                updateCurrentAccount({
                  author_name: e.target.value,
                  wechat: { ...currentAccount.wechat, author_name: e.target.value },
                })
              }
              placeholder="例如：科技专栏编辑部"
              className="h-9 text-ui-sm"
            />
          </label>
        </div>
      </div>

      {/* 平台接入模式与凭据 */}
      {isGzh ? (
        <div className="rounded-xl border border-border/80 bg-surface/50 p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <Key className="size-4 text-primary" />
              <h4 className="text-ui-sm font-semibold text-foreground">
                微信公众号模式与开发者凭据
              </h4>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-ui-xs text-foreground-subtle">接入模式:</span>
              <select
                className="h-8 rounded-lg border border-border bg-background px-2.5 text-ui-xs text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-primary"
                value={currentAccount.publish_mode || "api"}
                onChange={(e) => updateCurrentAccount({ publish_mode: e.target.value })}
              >
                <option value="api">官方 API 模式 (需开发者 AppID / Secret)</option>
                <option value="browser">免 API 模式 (浏览器扫码自动落草稿箱)</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-ui-sm text-foreground">
              <span className="font-medium text-ui-xs text-foreground-subtle">微信 AppID</span>
              <Input
                value={currentAccount.wechat?.appid || currentAccount.appid || ""}
                onChange={(e) =>
                  updateCurrentAccount({
                    appid: e.target.value,
                    wechat: { ...currentAccount.wechat, appid: e.target.value },
                  })
                }
                placeholder="wx..."
                className="h-9 font-mono text-ui-xs"
              />
            </label>

            <label className="space-y-1.5 text-ui-sm text-foreground">
              <span className="font-medium text-ui-xs text-foreground-subtle">微信 AppSecret</span>
              <div className="relative">
                <Input
                  type={revealSecrets[`secret_${selectedAccountId}`] ? "text" : "password"}
                  value={currentAccount.wechat?.app_secret || currentAccount.app_secret || ""}
                  onChange={(e) =>
                    updateCurrentAccount({
                      app_secret: e.target.value,
                      wechat: { ...currentAccount.wechat, app_secret: e.target.value },
                    })
                  }
                  placeholder="微信开发者秘钥"
                  className="h-9 font-mono text-ui-xs pr-9"
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-2.5 text-foreground-subtle hover:text-foreground transition-colors cursor-pointer"
                  onClick={() =>
                    setRevealSecrets((p) => ({
                      ...p,
                      [`secret_${selectedAccountId}`]: !p[`secret_${selectedAccountId}`],
                    }))
                  }
                  title={revealSecrets[`secret_${selectedAccountId}`] ? "隐藏密文" : "显示明文"}
                >
                  {revealSecrets[`secret_${selectedAccountId}`] ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </label>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/50 p-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <Shield className="size-3.5 text-primary" />
                <span className="text-ui-xs font-semibold text-foreground">自动开启原创声明</span>
              </div>
              <p className="text-ui-xs text-foreground-subtle">
                草稿创建后自动通过浏览器模拟打开草稿箱批量开启原创声明（需扫码登录微信公众平台）
              </p>
            </div>
            <Switch
              checked={Boolean(
                currentAccount.wechat?.auto_enable_original ?? currentAccount.auto_enable_original,
              )}
              onCheckedChange={(checked) =>
                updateCurrentAccount({
                  auto_enable_original: checked,
                  wechat: { ...currentAccount.wechat, auto_enable_original: checked },
                })
              }
            />
          </div>

          <div className="border-t border-border/60 pt-3 space-y-3">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-ui-sm text-foreground">
                <span className="font-medium text-ui-xs text-foreground-subtle">
                  公众号发文策略
                </span>
                <select
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-ui-xs text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-primary"
                  value={
                    currentAccount.publish_action_default ||
                    (currentAccount.publish_immediately ? "publish_now" : "draft")
                  }
                  onChange={(e) => {
                    const action = e.target.value;
                    updateCurrentAccount({
                      publish_action_default: action,
                      publish_immediately: action === "publish_now",
                    });
                  }}
                >
                  <option value="draft">仅存为草稿箱 (默认安全推荐，不消耗群发配额)</option>
                  <option value="publish_now">
                    立即正式发布 (通过 API freepublish 或浏览器发表)
                  </option>
                  <option value="schedule">定时排期发布 (先存草稿，到达排期时段自动发表)</option>
                </select>
                <p className="text-ui-xs text-foreground-subtle">
                  正式发布（freepublish）不占用公众号每天的群发次数配额，文章可在主页与内容列表中展示。
                </p>
              </label>

              {currentAccount.publish_action_default === "schedule" && (
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.05] p-3.5 text-ui-xs text-foreground sm:col-span-2 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-300">
                    <Info className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>定时排期规则已统合集中管理</span>
                  </div>
                  <p className="text-foreground-subtle leading-relaxed">
                    普通长文与小绿书的候选发文时段槽位池、冲突自动顺延（Auto
                    Delay）及防撞车安全间隔，已统一且仅在对应账号的
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">
                      「专属内容与视觉规则 ➜ 发文与定时规则」
                    </span>
                    中维护，彻底解决多处重复配置导致的混乱。
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border/80 bg-surface/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-ui-sm font-semibold text-foreground">
                生成后直接发布 (Publish Immediately)
              </div>
              <p className="text-ui-xs text-foreground-subtle">
                开启后在浏览器中自动提交正式发布；关闭时仅保存到平台草稿箱
              </p>
            </div>
            <Switch
              checked={Boolean(currentAccount.publish_immediately)}
              onCheckedChange={(checked) => updateCurrentAccount({ publish_immediately: checked })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
