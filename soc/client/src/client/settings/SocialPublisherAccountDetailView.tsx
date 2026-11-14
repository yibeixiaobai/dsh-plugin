import { useState } from "react";
import {
  RotateCcw,
  Copy,
  Trash2,
  Key,
  Eye,
  EyeOff,
  Palette,
  Sparkles,
  Image as ImageIcon,
  Clock,
  Plus,
  X,
  ShieldCheck,
  Check,
  AlertTriangle,
} from "lucide-react";
import css from "./SocialPublisherSettings.module.css";
import {
  socialPublisherConfigStore,
  useSocialPublisherStore,
} from "./SocialPublisherConfigStore.js";
import {
  COVER_RATIOS,
  SECONDARY_COVER_RATIOS,
  normalizeAccountsList,
} from "./SocialPublisherTypes.js";
import { SocialPublisherKeywordTagInput } from "./SocialPublisherKeywordTagInput.js";
import { SocialPublisherUnifiedModelStatusCard } from "./SocialPublisherUnifiedModelStatusCard.js";
import { SocialPublisherContentBrandSubTab } from "./SocialPublisherContentBrandSubTab.js";
import { SocialPublisherLoginModal } from "./SocialPublisherLoginModal.js";

const PRESET_TOPIC_ANGLES = ["技术落地剖析", "方法论拆解", "前沿综述", "避坑实操指南", "核心架构演进"];
const PRESET_FORBIDDEN_WORDS = ["代写", "代发", "保过", "枪手", "黑客破解", "绝对第一"];
const PRESET_XHS_TAGS = ["干货分享", "效率工具", "自媒体运营", "程序员日常", "前沿AI"];

const THEME_PALETTES: Record<string, { name: string; primary: string; accent: string; desc: string }> = {
  wenying: { name: "紫金", primary: "#722ed1", accent: "#d4b106", desc: "酒红典雅配金色强调" },
  olive: { name: "草木", primary: "#5b8c00", accent: "#faad14", desc: "橄榄草木绿配暖黄" },
  graphite: { name: "石墨", primary: "#262626", accent: "#1890ff", desc: "高级极简石墨深灰" },
  moyu: { name: "薄荷", primary: "#13c2c2", accent: "#52c41a", desc: "清爽摸鱼薄荷湖绿" },
  redwhite: { name: "报章", primary: "#f5222d", accent: "#fa8c16", desc: "经典报章红白版面" },
  zen: { name: "素雅", primary: "#8c8c8c", accent: "#595959", desc: "空灵素雅留白禅意" },
};

export function SocialPublisherAccountDetailView() {
  const {
    config,
    selectedAccountId,
    loginStatusMap,
    checkingLogin,
    loginingAccountId,
  } = useSocialPublisherStore();

  const [revealSecrets, setRevealSecrets] = useState<Record<string, boolean>>({});
  const [newScheduleTime, setNewScheduleTime] = useState("");
  const [internalModalOpen, setInternalModalOpen] = useState(false);

  const accounts = normalizeAccountsList(config?.accounts);
  const currentAccount =
    accounts.find((a: any) => a.id === selectedAccountId) ||
    accounts[0] || {
      id: "default",
      name: "默认公众号",
      platform: "gzh",
      enabled: true,
      content: {},
      wechat: {},
    };

  const accountId = currentAccount.id || selectedAccountId;
  const platform = (currentAccount.platform || "gzh").toLowerCase();
  const isGzh = platform === "gzh";
  const isXhs = platform === "xiaohongshu" || platform === "xhs";
  const isZhihu = platform === "zhihu";
  const isBaijiahao = platform === "baijiahao";

  const content = currentAccount.content || {};
  const isLoggedIn = loginStatusMap[accountId];
  const isChecking = checkingLogin === accountId;
  const isLogining = loginingAccountId === accountId;

  const updateAccount = (patch: any) => {
    socialPublisherConfigStore.updateAccount(accountId, patch);
  };

  const updateContent = (patch: any) => {
    updateAccount({ content: { ...content, ...patch } });
  };

  const handleCheckLogin = () => {
    socialPublisherConfigStore.checkLoginStatus(platform, accountId);
  };

  const handleTriggerLogin = async () => {
    const res = await socialPublisherConfigStore.triggerLogin(platform, accountId);
    if (!res.ok) {
      alert(res.message);
    }
  };

  const handleDuplicate = () => {
    socialPublisherConfigStore.duplicateAccount(accountId);
  };

  const handleDelete = () => {
    if (confirm(`确认要删除账号「${currentAccount.name || accountId}」吗？`)) {
      socialPublisherConfigStore.deleteAccount(accountId);
    }
  };

  // 定时发布预设时间
  const scheduleTimes: string[] = Array.isArray(currentAccount.schedule_times_article)
    ? currentAccount.schedule_times_article
    : isGzh
      ? ["07:45", "12:15", "21:00"]
      : isXhs
        ? ["12:15", "18:00", "20:30"]
        : ["08:00", "14:00", "19:30"];

  const handleAddScheduleTime = () => {
    const trimmed = newScheduleTime.trim();
    if (!/^\d{1,2}:\d{2}$/.test(trimmed)) return;
    const formatted = trimmed.padStart(5, "0");
    if (!scheduleTimes.includes(formatted)) {
      const next = [...scheduleTimes, formatted].sort();
      updateAccount({ schedule_times_article: next });
    }
    setNewScheduleTime("");
  };

  const handleRemoveScheduleTime = (t: string) => {
    updateAccount({
      schedule_times_article: scheduleTimes.filter((item) => item !== t),
    });
  };

  const platformBadgeStyle = isGzh
    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
    : isXhs
      ? "border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400"
      : isZhihu
        ? "border-blue-500/25 bg-blue-500/10 text-blue-600 dark:text-blue-400"
        : isBaijiahao
          ? "border-indigo-500/25 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
          : "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400";

  const platformAvatarBg = isGzh
    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25"
    : isXhs
      ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/25"
      : isZhihu
        ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/25"
        : isBaijiahao
          ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/25"
          : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25";

  return (
    <div className={css.stageContainer} data-testid="social-publisher-account-detail">
      {/* 1. macOS Hero 账号头部身份概览 */}
      <div className={css.macosHero}>
        <div className={css.macosHeroIdentity}>
          <div className={`${css.macosHeroAvatar} ${platformAvatarBg}`}>
            {(currentAccount.name || "文").slice(0, 1)}
          </div>
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[16px] font-semibold text-foreground tracking-tight truncate">
                {currentAccount.name || "未命名账号"}
              </h2>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${platformBadgeStyle}`}>
                {isGzh
                  ? "微信公众号"
                  : isXhs
                    ? "小红书"
                    : isZhihu
                      ? "知乎专栏"
                      : isBaijiahao
                        ? "百家号"
                        : "今日头条"}
              </span>
              <span className="text-[11px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-muted/50">
                {accountId}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
              <span>模式: {currentAccount.publish_mode === "api" ? "官方 API 直连" : "智能浏览器自动化"}</span>
              <span>·</span>
              <span className="flex items-center gap-1 font-medium">
                <span
                  className={`size-1.5 rounded-full ${
                    isLoggedIn === true
                      ? "bg-emerald-500"
                      : isLoggedIn === false
                        ? "bg-muted-foreground/40"
                        : "bg-amber-400"
                  }`}
                />
                <span className={isLoggedIn === true ? "text-emerald-600 dark:text-emerald-400" : ""}>
                  {isLoggedIn === true ? "已授权" : isLoggedIn === false ? "未登录" : "待检测"}
                </span>
              </span>
            </div>
          </div>
        </div>

        <div className={css.macosHeroActions}>
          <button
            type="button"
            className="flex h-7 items-center justify-center gap-1.5 rounded border border-border/80 bg-background px-2.5 text-[12px] font-medium text-foreground hover:bg-accent transition-colors shadow-2xs cursor-pointer"
            onClick={handleCheckLogin}
            disabled={isChecking}
          >
            <RotateCcw className={`size-3 ${isChecking ? "animate-spin text-primary" : "text-muted-foreground"}`} />
            <span>{isChecking ? "检测中..." : "检测会话"}</span>
          </button>

          <button
            type="button"
            className="flex h-7 items-center justify-center gap-1.5 rounded border border-border/80 bg-background px-2.5 text-[12px] font-medium text-foreground hover:bg-accent transition-colors shadow-2xs cursor-pointer"
            onClick={handleDuplicate}
          >
            <Copy className="size-3 text-muted-foreground" />
            <span>复制配置</span>
          </button>

          <label className="flex items-center gap-2 px-2.5 h-7 rounded border border-border/80 bg-surface/50 cursor-pointer select-none">
            <span className="text-[12px] text-foreground font-medium">启用</span>
            <input
              type="checkbox"
              className="size-3.5 accent-primary rounded cursor-pointer"
              checked={currentAccount.enabled !== false}
              onChange={(e) => updateAccount({ enabled: e.target.checked })}
            />
          </label>
        </div>
      </div>

      {/* 2. 分区 1：账号身份与登录凭据 (macOS Inset Group) */}
      <section className={css.macosGroup}>
        <div className={css.macosGroupHeader}>
          <span>账号身份与登录凭据</span>
          <span className="text-[11px] font-normal text-muted-foreground">Credentials & Auth</span>
        </div>

        <div className={css.macosGroupCard}>
          <div className={css.macosRow}>
            <div className={css.macosRowInfo}>
              <div className={css.macosRowLabel}>账号显示名称</div>
              <div className={css.macosRowHint}>在多平台发布矩阵中用于标识的主展示名称</div>
            </div>
            <div className={css.macosRowControl}>
              <input
                type="text"
                className="h-7 w-60 rounded border border-border/80 bg-background px-2 text-[12px] text-foreground focus:border-primary focus:outline-none"
                value={currentAccount.name || ""}
                onChange={(e) => updateAccount({ name: e.target.value })}
                placeholder="例如：科技前沿观察"
              />
            </div>
          </div>

          <div className={css.macosRow}>
            <div className={css.macosRowInfo}>
              <div className={css.macosRowLabel}>文章作者署名 (Author)</div>
              <div className={css.macosRowHint}>发文头部呈现的文章作者名</div>
            </div>
            <div className={css.macosRowControl}>
              <input
                type="text"
                className="h-7 w-60 rounded border border-border/80 bg-background px-2 text-[12px] text-foreground focus:border-primary focus:outline-none"
                value={currentAccount.wechat?.author_name || currentAccount.author_name || ""}
                onChange={(e) =>
                  updateAccount({
                    author_name: e.target.value,
                    wechat: { ...currentAccount.wechat, author_name: e.target.value },
                  })
                }
                placeholder="例如：文映学术win00.cn"
              />
            </div>
          </div>

          <div className={css.macosRow}>
            <div className={css.macosRowInfo}>
              <div className={css.macosRowLabel}>品牌官方名称 (Brand Name)</div>
              <div className={css.macosRowHint}>文章结尾版权或引导关注展示的主体标识</div>
            </div>
            <div className={css.macosRowControl}>
              <input
                type="text"
                className="h-7 w-60 rounded border border-border/80 bg-background px-2 text-[12px] text-foreground focus:border-primary focus:outline-none"
                value={currentAccount.wechat?.brand_name || currentAccount.brand_name || ""}
                onChange={(e) =>
                  updateAccount({
                    brand_name: e.target.value,
                    wechat: { ...currentAccount.wechat, brand_name: e.target.value },
                  })
                }
                placeholder="例如：前沿科技视界"
              />
            </div>
          </div>

          <div className={css.macosRow}>
            <div className={css.macosRowInfo}>
              <div className={css.macosRowLabel}>发文自动化模式</div>
              <div className={css.macosRowHint}>推荐使用智能浏览器直连模式，免认证服务号即可自动排版与发布</div>
            </div>
            <div className={css.macosRowControl}>
              <select
                className="h-7 rounded border border-border/80 bg-background px-2 text-[12px] text-foreground font-medium focus:border-primary focus:outline-none"
                value={currentAccount.publish_mode || "browser"}
                onChange={(e) => updateAccount({ publish_mode: e.target.value })}
              >
                <option value="browser">智能浏览器自动化 (免认证服务号，推荐)</option>
                {isGzh && <option value="api">微信官方 API 接口直连 (需服务号 AppSecret)</option>}
              </select>
            </div>
          </div>

          {/* 微信官方 API 模式开发者凭证 */}
          {isGzh && currentAccount.publish_mode === "api" && (
            <>
              <div className={css.macosRow}>
                <div className={css.macosRowInfo}>
                  <div className={css.macosRowLabel}>开发者 ID (AppID)</div>
                  <div className={css.macosRowHint}>微信公众平台分配的以 wx 开头的唯一标识</div>
                </div>
                <div className={css.macosRowControl}>
                  <input
                    type="text"
                    className="h-7 w-60 rounded border border-border/80 bg-background px-2 font-mono text-[12px] text-foreground focus:border-primary focus:outline-none"
                    value={currentAccount.wechat?.appid || ""}
                    onChange={(e) =>
                      updateAccount({
                        wechat: { ...currentAccount.wechat, appid: e.target.value },
                      })
                    }
                    placeholder="wx 开头的 18 位字符串"
                  />
                </div>
              </div>

              <div className={css.macosRow}>
                <div className={css.macosRowInfo}>
                  <div className={css.macosRowLabel}>开发者密码 (AppSecret)</div>
                  <div className={css.macosRowHint}>微信公众号后台生成的高级安全密钥</div>
                </div>
                <div className={css.macosRowControl}>
                  <div className="relative w-60">
                    <input
                      type={revealSecrets[accountId] ? "text" : "password"}
                      className="h-7 w-full rounded border border-border/80 bg-background pl-2 pr-7 font-mono text-[12px] text-foreground focus:border-primary focus:outline-none"
                      value={currentAccount.wechat?.appsecret || ""}
                      onChange={(e) =>
                        updateAccount({
                          wechat: { ...currentAccount.wechat, appsecret: e.target.value },
                        })
                      }
                      placeholder="32 位十六进制密钥"
                    />
                    <button
                      type="button"
                      className="absolute right-1.5 top-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
                      onClick={() =>
                        setRevealSecrets((p) => ({ ...p, [accountId]: !p[accountId] }))
                      }
                    >
                      {revealSecrets[accountId] ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* 会话登录态行 */}
          <div className={css.macosRow}>
            <div className={css.macosRowInfo}>
              <div className="flex items-center gap-2">
                <span
                  className={`size-2 rounded-full shrink-0 ${
                    isLoggedIn === true
                      ? "bg-emerald-500"
                      : isLoggedIn === false
                        ? "bg-muted-foreground/40"
                        : "bg-amber-400"
                  }`}
                />
                <span className="text-[13px] font-medium text-foreground">
                  {isLoggedIn === true
                    ? "浏览器会话已就绪 · 本地授权有效"
                    : isLoggedIn === false
                      ? "当前未检测到有效登录态，请扫码授权"
                      : "正在检测本地会话凭证..."}
                </span>
              </div>
              <div className={css.macosRowHint}>
                基于隔离的用户数据目录持久化 Cookie，任务执行时自动复用
              </div>
            </div>

            <div className={css.macosRowControl}>
              <button
                type="button"
                className="flex h-7 items-center justify-center gap-1.5 rounded bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
                onClick={() => setInternalModalOpen(true)}
              >
                <ShieldCheck className="size-3.5" />
                <span>调起内置浏览器扫码授权</span>
              </button>
              <button
                type="button"
                className="flex h-7 items-center justify-center gap-1 rounded border border-border/80 bg-background px-2 text-[11px] font-medium text-foreground hover:bg-accent transition-colors shadow-2xs cursor-pointer"
                onClick={handleTriggerLogin}
                title="通过系统后台进程唤起独立 Chrome"
                disabled={isLogining}
              >
                <span>{isLogining ? "唤起中..." : "后台独立唤起"}</span>
              </button>
            </div>
          </div>
        </div>

        <div className={css.macosGroupFooter}>
          若使用微信公众号智能浏览器自动化模式，发文时将通过无头浏览器自动填报正文与封面，免认证服务号限制。
        </div>
      </section>

      {/* 3. 分区 2：内容排版与规则偏好 (macOS Inset Group) */}
      <section className={css.macosGroup}>
        <div className={css.macosGroupHeader}>
          <span>内容排版与规则偏好</span>
          <span className="text-[11px] font-normal text-muted-foreground">Typography & Styling</span>
        </div>

        <div className={css.macosGroupCard}>
          {isGzh && (
            <div className={css.macosRow}>
              <div className={css.macosRowInfo}>
                <div className={css.macosRowLabel}>发文形态 (Article Type)</div>
                <div className={css.macosRowHint}>支持长文排版或小绿书竖版图文卡片</div>
              </div>
              <div className={css.macosRowControl}>
                <select
                  className="h-7 rounded border border-border/80 bg-background px-2 text-[12px] text-foreground font-medium focus:border-primary focus:outline-none"
                  value={content.article_type || "news"}
                  onChange={(e) => updateContent({ article_type: e.target.value })}
                >
                  <option value="news">公众号长文（经典多图文排版）</option>
                  <option value="newspic">小绿书图片消息（3:4 竖版多图卡片）</option>
                  <option value="both">长文 + 小绿书一文双发</option>
                </select>
              </div>
            </div>
          )}

          {/* 微信长文视觉主题：Apple 原生外观色板圆环 */}
          {isGzh && (
            <div className={css.macosRow}>
              <div className={css.macosRowInfo}>
                <div className={css.macosRowLabel}>视觉主题调色方案</div>
                <div className={css.macosRowHint}>
                  当前选中：{THEME_PALETTES[content.headline_theme || "wenying"]?.name || "经典"} ·{" "}
                  {THEME_PALETTES[content.headline_theme || "wenying"]?.desc}
                </div>
              </div>
              <div className={css.macosRowControl}>
                <div className={css.appleColorStrip}>
                  {Object.entries(THEME_PALETTES).map(([themeKey, item]) => {
                    const isSelected = (content.headline_theme || "wenying") === themeKey;
                    return (
                      <div
                        key={themeKey}
                        className={`${css.appleColorChip} ${isSelected ? css.appleColorChipActive : ""}`}
                        style={{
                          background: `linear-gradient(135deg, ${item.primary} 50%, ${item.accent} 50%)`,
                        }}
                        onClick={() => updateContent({ headline_theme: themeKey })}
                        title={`${item.name}：${item.desc}`}
                      >
                        {isSelected && <Check className="size-3 text-white drop-shadow-sm" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <div className={css.macosRow}>
            <div className={css.macosRowInfo}>
              <div className={css.macosRowLabel}>正文最低字数要求</div>
              <div className={css.macosRowHint}>生成长文或图文正文时的最小字符限制</div>
            </div>
            <div className={css.macosRowControl}>
              <input
                type="number"
                className="h-7 w-24 rounded border border-border/80 bg-background px-2 text-[12px] text-foreground focus:border-primary focus:outline-none"
                value={content.min_words ?? (isXhs ? 300 : 1200)}
                onChange={(e) => updateContent({ min_words: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className={css.macosRow}>
            <div className={css.macosRowInfo}>
              <div className={css.macosRowLabel}>正文字号与行高规范</div>
              <div className={css.macosRowHint}>微调阅读版面排版视觉比例</div>
            </div>
            <div className={css.macosRowControl}>
              <span className="text-[11px] text-muted-foreground">字号:</span>
              <input
                type="text"
                className="h-7 w-18 rounded border border-border/80 bg-background px-2 font-mono text-[12px] text-foreground focus:border-primary focus:outline-none"
                value={content.font_size || "13px"}
                onChange={(e) => updateContent({ font_size: e.target.value })}
                placeholder="13px"
              />
              <span className="text-[11px] text-muted-foreground ml-1">行高:</span>
              <input
                type="text"
                className="h-7 w-18 rounded border border-border/80 bg-background px-2 font-mono text-[12px] text-foreground focus:border-primary focus:outline-none"
                value={content.line_height || "20px"}
                onChange={(e) => updateContent({ line_height: e.target.value })}
                placeholder="20px"
              />
            </div>
          </div>

          <div className="p-4 space-y-4">
            <SocialPublisherKeywordTagInput
              label={isXhs ? "小红书热门话题标签 (#话题#)" : "重点关注选题与热点方向"}
              subLabel="任务生成时将从选题池中自动匹配最具深度的主题角度"
              tags={content.keywords || []}
              onChange={(tags) => updateContent({ keywords: tags })}
              placeholder="输入选题按回车添加..."
              presetTags={isXhs ? PRESET_XHS_TAGS : PRESET_TOPIC_ANGLES}
            />

            <SocialPublisherKeywordTagInput
              label="违禁词与敏感屏蔽词库"
              subLabel="内容生成与最终审核时将对命中词汇执行严格拦截与替换"
              tags={content.forbidden_words || []}
              onChange={(tags) => updateContent({ forbidden_words: tags })}
              placeholder="输入屏蔽词按回车添加..."
              presetTags={PRESET_FORBIDDEN_WORDS}
            />
          </div>
        </div>
      </section>

      {/* 4. 分区 3：配图生成与视觉比例 (macOS Inset Group) */}
      <section className={css.macosGroup}>
        <div className={css.macosGroupHeader}>
          <span>配图生成与视觉比例</span>
          <span className="text-[11px] font-normal text-muted-foreground">Media & Ratio</span>
        </div>

        <div className={css.macosGroupCard}>
          <div className={css.macosRow}>
            <div className={css.macosRowInfo}>
              <div className={css.macosRowLabel}>头条封面比例 (Primary Cover Ratio)</div>
              <div className={css.macosRowHint}>微信多图文头条或各平台首页推荐封面宽高比</div>
            </div>
            <div className={css.macosRowControl}>
              <select
                className="h-7 rounded border border-border/80 bg-background px-2 text-[12px] text-foreground font-medium focus:border-primary focus:outline-none"
                value={content.headline_cover_ratio || "2.35:1"}
                onChange={(e) => updateContent({ headline_cover_ratio: e.target.value })}
              >
                {COVER_RATIOS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={css.macosRow}>
            <div className={css.macosRowInfo}>
              <div className={css.macosRowLabel}>次条封面比例 (Secondary Cover Ratio)</div>
              <div className={css.macosRowHint}>文章次条缩略图尺寸</div>
            </div>
            <div className={css.macosRowControl}>
              <select
                className="h-7 rounded border border-border/80 bg-background px-2 text-[12px] text-foreground font-medium focus:border-primary focus:outline-none"
                value={content.secondary_cover_ratio || "1:1"}
                onChange={(e) => updateContent({ secondary_cover_ratio: e.target.value })}
              >
                {SECONDARY_COVER_RATIOS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={css.macosRow}>
            <div className={css.macosRowInfo}>
              <div className={css.macosRowLabel}>配图生成篇数 (AI / 搜索配图)</div>
              <div className={css.macosRowHint}>每篇文章自动插图篇数与全网搜索图数量</div>
            </div>
            <div className={css.macosRowControl}>
              <span className="text-[11px] text-muted-foreground">AI插图:</span>
              <input
                type="number"
                className="h-7 w-16 rounded border border-border/80 bg-background px-2 text-[12px] text-foreground focus:border-primary focus:outline-none"
                value={content.ai_images_per_article ?? 1}
                onChange={(e) => updateContent({ ai_images_per_article: Number(e.target.value) })}
              />
              <span className="text-[11px] text-muted-foreground ml-2">搜索插图:</span>
              <input
                type="number"
                className="h-7 w-16 rounded border border-border/80 bg-background px-2 text-[12px] text-foreground focus:border-primary focus:outline-none"
                value={content.search_images_per_article ?? 1}
                onChange={(e) => updateContent({ search_images_per_article: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="p-3.5 border-t border-border/60">
            <SocialPublisherUnifiedModelStatusCard />
          </div>
        </div>
      </section>

      {/* 5. 分区 4：品牌资产与头尾插图 (macOS Inset Group) */}
      <section className={css.macosGroup}>
        <div className={css.macosGroupHeader}>
          <span>品牌资产与头尾插图</span>
          <span className="text-[11px] font-normal text-muted-foreground">Branding & Assets</span>
        </div>

        <div className={css.macosGroupCard}>
          <div className="p-4">
            <SocialPublisherContentBrandSubTab
              currentAccount={currentAccount}
              updateCurrentAccount={updateAccount}
              isCardFlow={isXhs}
              isXhs={isXhs}
            />
          </div>
        </div>
      </section>

      {/* 6. 分区 5：发布频次与定时策略 (macOS Inset Group) */}
      <section className={css.macosGroup}>
        <div className={css.macosGroupHeader}>
          <span>发布频次与定时策略</span>
          <span className="text-[11px] font-normal text-muted-foreground">Scheduling & Limits</span>
        </div>

        <div className={css.macosGroupCard}>
          <div className={css.macosRow}>
            <div className={css.macosRowInfo}>
              <div className={css.macosRowLabel}>每日发文上限与防冲突间隔</div>
              <div className={css.macosRowHint}>单日发文最大篇数及任务防重叠时间窗口</div>
            </div>
            <div className={css.macosRowControl}>
              <span className="text-[11px] text-muted-foreground">单日上限:</span>
              <input
                type="number"
                className="h-7 w-16 rounded border border-border/80 bg-background px-2 text-[12px] text-foreground focus:border-primary focus:outline-none"
                value={content.articles_per_day ?? (isXhs ? 2 : 6)}
                onChange={(e) => updateContent({ articles_per_day: Number(e.target.value) })}
              />
              <span className="text-[11px] text-muted-foreground ml-2">间隔 (分钟):</span>
              <input
                type="number"
                className="h-7 w-16 rounded border border-border/80 bg-background px-2 text-[12px] text-foreground focus:border-primary focus:outline-none"
                value={currentAccount.schedule_conflict_interval_mins ?? 30}
                onChange={(e) =>
                  updateAccount({ schedule_conflict_interval_mins: Number(e.target.value) })
                }
              />
            </div>
          </div>

          <div className="p-4 border-t border-border/60 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] font-medium text-foreground">
                定时群发黄金时间点 ({scheduleTimes.length} 个已设定)
              </span>
              <span className="text-[11px] text-muted-foreground">建议按早/午/晚高峰排布</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {scheduleTimes.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-border/80 bg-surface/70 text-[12px] font-mono text-foreground shadow-2xs"
                >
                  <span>{t}</span>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground cursor-pointer"
                    onClick={() => handleRemoveScheduleTime(t)}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}

              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder="09:00"
                  className="h-7 w-18 rounded border border-border/80 bg-background px-2 text-[12px] font-mono text-foreground focus:border-primary focus:outline-none"
                  value={newScheduleTime}
                  onChange={(e) => setNewScheduleTime(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddScheduleTime();
                    }
                  }}
                />
                <button
                  type="button"
                  className="flex h-7 items-center gap-1 px-2.5 rounded border border-border/80 bg-surface hover:bg-accent text-foreground text-[12px] font-medium cursor-pointer shadow-2xs"
                  onClick={handleAddScheduleTime}
                >
                  <Plus className="size-3" />
                  <span>添加</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. macOS 危险操作独立卡片 */}
      <section className={css.macosGroup}>
        <div className={css.macosGroupHeader}>
          <span className="text-destructive font-semibold">危险操作</span>
        </div>
        <div className={css.macosGroupCard} style={{ borderColor: "rgba(239, 68, 68, 0.25)" }}>
          <div className={css.macosRow}>
            <div className={css.macosRowInfo}>
              <div className="text-[13px] font-semibold text-destructive flex items-center gap-1.5">
                <AlertTriangle className="size-3.5" />
                <span>删除当前账号档案</span>
              </div>
              <div className={css.macosRowHint}>
                从本设备永久移除「{currentAccount.name || accountId}」的所有配置与排版规则，操作不可撤销
              </div>
            </div>
            <div className={css.macosRowControl}>
              <button
                type="button"
                className="flex h-7 items-center gap-1.5 rounded border border-destructive/40 bg-destructive/10 px-3 text-[12px] font-semibold text-destructive hover:bg-destructive/20 transition-colors shrink-0 shadow-2xs cursor-pointer"
                onClick={handleDelete}
              >
                <Trash2 className="size-3.5" />
                <span>删除账号</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 内置浏览器专属多开隔离登录弹窗 */}
      <SocialPublisherLoginModal
        open={internalModalOpen}
        onOpenChange={setInternalModalOpen}
        platform={platform}
        accountId={accountId}
        accountName={currentAccount.name}
        onLoginSuccess={() => {
          socialPublisherConfigStore.checkLoginStatus(platform, accountId);
          socialPublisherConfigStore.fetchFromBackend();
        }}
      />
    </div>
  );
}
