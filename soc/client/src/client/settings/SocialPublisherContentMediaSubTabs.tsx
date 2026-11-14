import { Input } from "../compat/components/ui/input.js";
import { Info, Palette } from "lucide-react";
import { THEMES } from "./SocialPublisherTypes.js";
import { SocialPublisherContentImageSettings } from "./SocialPublisherContentImageSettings.js";

interface MediaSubTabsProps {
  currentAccount: any;
  updateCurrentAccount: (patch: any) => void;
  subTab: "typography" | "image";
  isZhihu: boolean;
  isXhs: boolean;
  isBaijiahao: boolean;
  isToutiao: boolean;
}

const DEFAULT_PALETTE = { primary: "#722ed1", accent: "#d4b106", desc: "酒红典雅配金色强调" };

const THEME_PALETTES: Record<string, { primary: string; accent: string; desc: string }> = {
  wenying: DEFAULT_PALETTE,
  olive: { primary: "#5b8c00", accent: "#faad14", desc: "橄榄草木绿配暖黄" },
  graphite: { primary: "#262626", accent: "#1890ff", desc: "高级极简石墨深灰" },
  moyu: { primary: "#13c2c2", accent: "#52c41a", desc: "清爽摸鱼薄荷湖绿" },
  redwhite: { primary: "#f5222d", accent: "#fa8c16", desc: "经典报章红白版面" },
  zen: { primary: "#8c8c8c", accent: "#595959", desc: "空灵素雅留白禅意" },
};

export function SocialPublisherContentMediaSubTabs({
  currentAccount,
  updateCurrentAccount,
  subTab,
  isZhihu,
  isXhs,
  isBaijiahao,
  isToutiao,
}: MediaSubTabsProps) {
  const content = currentAccount?.content || {};

  if (subTab === "typography") {
    if (isXhs) {
      return (
        <div className="flex items-start gap-3 rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-4 text-ui-xs text-foreground">
          <Info className="size-4.5 text-rose-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold text-rose-600 dark:text-rose-400">小红书专属排版说明</div>
            <p className="text-foreground-subtle leading-relaxed">
              小红书账号：流水线自动输出纯文本多图笔记（支持 Emoji 表情与 #话题# 标签，正文上限 1000
              字），无微信公众号的主题色板、引言卡、三列目录及 13px 单行排版等专有样式。
            </p>
          </div>
        </div>
      );
    }

    if (isZhihu) {
      return (
        <div className="flex items-start gap-3 rounded-xl border border-sky-500/20 bg-sky-500/[0.04] p-4 text-ui-xs text-foreground">
          <Info className="size-4.5 text-sky-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold text-sky-600 dark:text-sky-400">知乎专栏专属排版说明</div>
            <p className="text-foreground-subtle leading-relaxed">
              知乎专栏账号：流水线自动输出标准 Markdown
              纯文本及加粗关键词，由知乎原生渲染器呈现，无微信主题色板或引言卡专有排版样式。
            </p>
          </div>
        </div>
      );
    }

    if (isBaijiahao || isToutiao) {
      const platformName = isBaijiahao ? "百家号" : "头条号";
      return (
        <div className="flex items-start gap-3 rounded-xl border border-sky-500/20 bg-sky-500/[0.04] p-4 text-ui-xs text-foreground">
          <Info className="size-4.5 text-sky-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold text-sky-600 dark:text-sky-400">
              {platformName}专属排版说明
            </div>
            <p className="text-foreground-subtle leading-relaxed">
              流水线自动输出标准 Markdown
              图文（章节标题/加粗关键词/引用/配图），由对应平台官方编辑器按默认样式渲染。
            </p>
          </div>
        </div>
      );
    }

    // 微信公众号专属视觉主题与字号行高配置
    const activeHeadlineTheme = content.headline_theme || "wenying";
    const palette = THEME_PALETTES[activeHeadlineTheme] ?? DEFAULT_PALETTE;

    return (
      <div className="space-y-5" data-testid="social-publisher-typography-settings">
        {/* 主题色板选择区 */}
        <div className="rounded-xl border border-border/80 bg-surface/50 p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <Palette className="size-4 text-primary" />
              <span className="text-ui-sm font-semibold text-foreground">视觉主题调色方案</span>
            </div>
            <div className="flex items-center gap-2 text-ui-xs text-foreground-subtle">
              <span>当前调色:</span>
              <div className="flex items-center gap-1">
                <span
                  className="size-3 rounded-full border border-border/50"
                  style={{ backgroundColor: palette.primary }}
                />
                <span
                  className="size-3 rounded-full border border-border/50"
                  style={{ backgroundColor: palette.accent }}
                />
                <span className="font-medium text-foreground">{palette.desc}</span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-ui-sm text-foreground">
              <span className="font-medium text-ui-xs text-foreground-subtle">
                头条视觉主题 (独享品牌风格)
              </span>
              <select
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-ui-xs text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-primary"
                value={activeHeadlineTheme}
                onChange={(e) =>
                  updateCurrentAccount({ content: { ...content, headline_theme: e.target.value } })
                }
              >
                {THEMES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5 text-ui-sm text-foreground">
              <span className="font-medium text-ui-xs text-foreground-subtle">次条视觉主题</span>
              <select
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-ui-xs text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-primary"
                value={content.secondary_theme || "rotate"}
                onChange={(e) =>
                  updateCurrentAccount({ content: { ...content, secondary_theme: e.target.value } })
                }
              >
                <option value="rotate">自动轮换 (轮流使用各主题色)</option>
                {THEMES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* 13px 单行排版铁律度量表单 */}
        <div className="rounded-xl border border-border/80 bg-surface/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-ui-sm font-semibold text-foreground">
              公众号 13px 排版铁律规范
            </span>
            <span className="rounded bg-primary/10 text-primary px-2 py-0.5 text-ui-xs font-medium">
              零换行单行 HTML
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-4 pt-1">
            <label className="space-y-1.5 text-ui-xs text-foreground">
              <span className="font-medium text-foreground-subtle">正文字号 (铁律)</span>
              <Input
                value={content.font_size || "13px"}
                onChange={(e) =>
                  updateCurrentAccount({ content: { ...content, font_size: e.target.value } })
                }
                className="h-8.5 font-mono text-ui-xs"
              />
            </label>
            <label className="space-y-1.5 text-ui-xs text-foreground">
              <span className="font-medium text-foreground-subtle">正文行高 (铁律)</span>
              <Input
                value={content.line_height || "20px"}
                onChange={(e) =>
                  updateCurrentAccount({ content: { ...content, line_height: e.target.value } })
                }
                className="h-8.5 font-mono text-ui-xs"
              />
            </label>
            <label className="space-y-1.5 text-ui-xs text-foreground">
              <span className="font-medium text-foreground-subtle">段落间距</span>
              <Input
                value={content.paragraph_margin || "25px"}
                onChange={(e) =>
                  updateCurrentAccount({
                    content: { ...content, paragraph_margin: e.target.value },
                  })
                }
                className="h-8.5 font-mono text-ui-xs"
              />
            </label>
            <label className="space-y-1.5 text-ui-xs text-foreground">
              <span className="font-medium text-foreground-subtle">首行缩进</span>
              <Input
                value={content.text_indent || "2em"}
                onChange={(e) =>
                  updateCurrentAccount({ content: { ...content, text_indent: e.target.value } })
                }
                className="h-8.5 font-mono text-ui-xs"
              />
            </label>
          </div>
        </div>
      </div>
    );
  }

  // [中文修复依据]：将配图规则设置完整委托给独立子组件 SocialPublisherContentImageSettings，
  // 全面支持“AI智能自适应配图”与“自定义分别设定AI与搜图数量”，并避免单文件超行违规
  return (
    <SocialPublisherContentImageSettings
      currentAccount={currentAccount}
      updateCurrentAccount={updateCurrentAccount}
      isZhihu={isZhihu}
      isXhs={isXhs}
      isBaijiahao={isBaijiahao}
      isToutiao={isToutiao}
    />
  );
}
