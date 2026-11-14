import { Input } from "../compat/components/ui/input.js";
import { Switch } from "../compat/components/ui/switch.js";
import { Sparkles, Sliders, Info, Search, Image as ImageIcon, Languages } from "lucide-react";
import { COVER_RATIOS, SECONDARY_COVER_RATIOS } from "./SocialPublisherTypes.js";
import { SocialPublisherUnifiedModelStatusCard } from "./SocialPublisherUnifiedModelStatusCard.js";
import { cn } from "../compat/components/lib/utils.js";

interface ImageSettingsProps {
  currentAccount: any;
  updateCurrentAccount: (patch: any) => void;
  isZhihu: boolean;
  isXhs: boolean;
  isBaijiahao: boolean;
  isToutiao: boolean;
}

/** 社媒正文与封面配图设置子面板：支持自适应与自定义配比，多平台规格适配 */
export function SocialPublisherContentImageSettings({
  currentAccount,
  updateCurrentAccount,
  isZhihu,
  isXhs,
  isBaijiahao,
  isToutiao,
}: ImageSettingsProps) {
  const content = currentAccount?.content || {};

  // 配图模式：默认为 auto（AI 智能自适应）
  const imageMode = (content.image_count_mode || "auto") as "auto" | "custom";
  const aiImageCount = Math.max(0, Math.min(4, Number(content.ai_images_per_article ?? 1)));
  const searchImageCount = Math.max(0, Math.min(4, Number(content.search_images_per_article ?? 1)));
  const totalContentImages = aiImageCount + searchImageCount;

  // 小红书模式下的卡片配比
  const xhsImageMode = (content.xhs_image_count_mode || "auto") as "auto" | "custom";
  const xhsAiCount = Math.max(1, Math.min(18, Number(content.xhs_ai_images_per_note ?? 3)));
  const xhsSearchCount = Math.max(0, Math.min(18, Number(content.xhs_search_images_per_note ?? 1)));
  const xhsTotalCards = xhsAiCount + xhsSearchCount;

  const handleModeChange = (mode: "auto" | "custom") => {
    if (isXhs) {
      updateCurrentAccount({
        content: {
          ...content,
          xhs_image_count_mode: mode,
          ...(mode === "custom"
            ? {
                xhs_ai_images_per_note: xhsAiCount,
                xhs_search_images_per_note: xhsSearchCount,
                xhs_images_per_note: xhsTotalCards,
              }
            : {}),
        },
      });
    } else {
      updateCurrentAccount({
        content: {
          ...content,
          image_count_mode: mode,
          ...(mode === "custom"
            ? {
                ai_images_per_article: aiImageCount,
                search_images_per_article: searchImageCount,
                content_images_per_article: totalContentImages,
              }
            : {}),
        },
      });
    }
  };

  const handleUpdateCounts = (ai: number, search: number) => {
    const validAi = Math.max(0, Math.min(4, Math.floor(ai)));
    const validSearch = Math.max(0, Math.min(4, Math.floor(search)));
    const sum = validAi + validSearch;
    updateCurrentAccount({
      content: {
        ...content,
        image_count_mode: "custom",
        ai_images_per_article: validAi,
        search_images_per_article: validSearch,
        content_images_per_article: sum,
      },
    });
  };

  const handleUpdateXhsCounts = (ai: number, search: number) => {
    const validAi = Math.max(1, Math.min(18, Math.floor(ai)));
    const validSearch = Math.max(0, Math.min(18, Math.floor(search)));
    const sum = validAi + validSearch;
    updateCurrentAccount({
      content: {
        ...content,
        xhs_image_count_mode: "custom",
        xhs_ai_images_per_note: validAi,
        xhs_search_images_per_note: validSearch,
        xhs_images_per_note: sum,
      },
    });
  };

  const isGzh = !isXhs && !isZhihu && !isBaijiahao && !isToutiao;
  const currentMode = isXhs ? xhsImageMode : imageMode;

  return (
    <div className="space-y-4" data-testid="social-publisher-image-settings">
      <SocialPublisherUnifiedModelStatusCard />

      {/* 平台规格提示横幅 */}
      {isXhs ? (
        <div className="flex items-start gap-3 rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-3.5 text-ui-xs text-foreground leading-relaxed">
          <Info className="size-4.5 text-rose-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold text-rose-600 dark:text-rose-400">小红书轮播图规格</span>
            <p className="text-foreground-subtle">
              小红书笔记固定为 3:4 竖版尺寸 (1080×1440 px)。首张卡片作为封面，支持 AI
              稿定大字报排版卡片与真实网络实景插图混排。
            </p>
          </div>
        </div>
      ) : isGzh ? (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3.5 text-ui-xs text-foreground leading-relaxed">
          当前封面尺寸：头条{" "}
          <strong className="font-semibold">{content.headline_cover_ratio || "2.35:1"}</strong> ·
          次条 <strong className="font-semibold">{content.secondary_cover_ratio || "1:1"}</strong>
          ；下次生图按此比例生成。
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-sky-500/20 bg-sky-500/[0.04] p-3.5 text-ui-xs text-foreground leading-relaxed">
          <Info className="size-4.5 text-sky-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold text-sky-600 dark:text-sky-400">
              {isZhihu ? "知乎专栏" : isBaijiahao ? "百家号" : "头条号"} 封面与正文规格
            </span>
            <p className="text-foreground-subtle">
              封面比例统一机器自动适配（知乎/头条 16:9，百家号
              2.35:1），正文插图由下方配图规则智能生成。
            </p>
          </div>
        </div>
      )}

      {/* 微信公众号长文封面比例调节 */}
      {isGzh && (
        <div className="grid gap-4 sm:grid-cols-2 rounded-xl border border-border/80 bg-surface/50 p-4">
          <label className="space-y-1.5 text-ui-sm text-foreground">
            <span className="font-medium text-ui-xs text-foreground-subtle">头条封面比例</span>
            <select
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-ui-xs text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-primary"
              value={content.headline_cover_ratio || "2.35:1"}
              onChange={(e) =>
                updateCurrentAccount({
                  content: { ...content, headline_cover_ratio: e.target.value },
                })
              }
            >
              {COVER_RATIOS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-ui-sm text-foreground">
            <span className="font-medium text-ui-xs text-foreground-subtle">
              次条封面比例 (次条不支持 2.35:1)
            </span>
            <select
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-ui-xs text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-primary"
              value={content.secondary_cover_ratio || "1:1"}
              onChange={(e) =>
                updateCurrentAccount({
                  content: { ...content, secondary_cover_ratio: e.target.value },
                })
              }
            >
              {SECONDARY_COVER_RATIOS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {/* 配图数量模式设置（自适应 vs 自定义分别设置） */}
      <div className="rounded-xl border border-border/80 bg-surface/50 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h4 className="text-ui-sm font-semibold text-foreground flex items-center gap-1.5">
              <span>{isXhs ? "小红书卡片配图生成策略" : "正文插图生成与搜图策略"}</span>
            </h4>
            <p className="text-ui-xs text-foreground-subtle">
              支持 AI 智能自适应配图，或自定义精细指定 AI 生图与真实网络搜图数量
            </p>
          </div>
          <span className="text-ui-2xs font-mono font-semibold px-2 py-0.5 rounded border border-primary/30 text-primary bg-primary/[0.06]">
            {currentMode === "auto" ? "智能自适应" : "自定义配比"}
          </span>
        </div>

        {/* 模式切换卡片 */}
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => handleModeChange("auto")}
            className={cn(
              "flex flex-col items-start gap-1.5 rounded-xl p-3.5 text-left border transition-all cursor-pointer",
              currentMode === "auto"
                ? "bg-background border-primary shadow-xs ring-1 ring-primary/25"
                : "bg-surface/30 border-border hover:bg-surface/70 text-foreground-subtle",
            )}
          >
            <div className="flex items-center gap-1.5 font-semibold text-ui-xs text-foreground">
              <Sparkles className="size-3.5 text-primary" />
              <span>AI 智能根据内容自适应配图 (推荐)</span>
            </div>
            <p className="text-ui-xs text-foreground-subtle leading-tight">
              由 AI 根据正文实际分段、字数与论据密度自动规划 1~4 张配图，并智能交替混排 AI
              排版图与真实搜图
            </p>
          </button>

          <button
            type="button"
            onClick={() => handleModeChange("custom")}
            className={cn(
              "flex flex-col items-start gap-1.5 rounded-xl p-3.5 text-left border transition-all cursor-pointer",
              currentMode === "custom"
                ? "bg-background border-primary shadow-xs ring-1 ring-primary/25"
                : "bg-surface/30 border-border hover:bg-surface/70 text-foreground-subtle",
            )}
          >
            <div className="flex items-center gap-1.5 font-semibold text-ui-xs text-foreground">
              <Sliders className="size-3.5 text-primary" />
              <span>自定义分别指定 AI 与搜图数量</span>
            </div>
            <p className="text-ui-xs text-foreground-subtle leading-tight">
              手动精确控制每篇文章生成的 AI 设计排版图张数与网络搜索真实素材图张数
            </p>
          </button>
        </div>

        {/* 自定义模式展开项 */}
        {currentMode === "custom" && (
          <div className="rounded-lg border border-border/60 bg-background/60 p-3.5 space-y-3">
            {isXhs ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-ui-xs text-foreground">
                  <span className="font-medium text-foreground flex items-center gap-1.5">
                    <ImageIcon className="size-3.5 text-primary" />
                    <span>AI 稿定大字报排版卡片数</span>
                  </span>
                  <Input
                    type="number"
                    min={1}
                    max={18}
                    value={xhsAiCount}
                    onChange={(e) => handleUpdateXhsCounts(Number(e.target.value), xhsSearchCount)}
                    className="h-8.5 text-ui-xs"
                  />
                  <span className="text-ui-2xs text-foreground-subtle">
                    首图必为封面大字报，次图生成结构化知识卡
                  </span>
                </label>

                <label className="space-y-1.5 text-ui-xs text-foreground">
                  <span className="font-medium text-foreground flex items-center gap-1.5">
                    <Search className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>网络搜索真实插图素材数</span>
                  </span>
                  <Input
                    type="number"
                    min={0}
                    max={18}
                    value={xhsSearchCount}
                    onChange={(e) => handleUpdateXhsCounts(xhsAiCount, Number(e.target.value))}
                    className="h-8.5 text-ui-xs"
                  />
                  <span className="text-ui-2xs text-foreground-subtle">
                    根据笔记关键词自动搜索真实场景图，免扣费生图
                  </span>
                </label>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-ui-xs text-foreground">
                  <span className="font-medium text-foreground flex items-center gap-1.5">
                    <ImageIcon className="size-3.5 text-primary" />
                    <span>正文 AI 稿定排版生图数 (0~4 张)</span>
                  </span>
                  <Input
                    type="number"
                    min={0}
                    max={4}
                    value={aiImageCount}
                    onChange={(e) => handleUpdateCounts(Number(e.target.value), searchImageCount)}
                    className="h-8.5 text-ui-xs"
                  />
                  <span className="text-ui-2xs text-foreground-subtle">
                    生成稿定风格概念信息图谱与大字报卡片
                  </span>
                </label>

                <label className="space-y-1.5 text-ui-xs text-foreground">
                  <span className="font-medium text-foreground flex items-center gap-1.5">
                    <Search className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>正文网络搜索真实素材图数 (0~4 张)</span>
                  </span>
                  <Input
                    type="number"
                    min={0}
                    max={4}
                    value={searchImageCount}
                    onChange={(e) => handleUpdateCounts(aiImageCount, Number(e.target.value))}
                    className="h-8.5 text-ui-xs"
                  />
                  <span className="text-ui-2xs text-foreground-subtle">
                    浏览器极速搜索真实摄影插图，消除 100% AI 绘图特征
                  </span>
                </label>
              </div>
            )}

            <div className="flex items-center justify-between pt-1 border-t border-border/40 text-ui-2xs text-foreground-subtle">
              <span>
                每篇正文配图总计:{" "}
                <strong className="text-foreground font-semibold">
                  {isXhs ? xhsTotalCards : totalContentImages} 张
                </strong>{" "}
                (封面另计)
              </span>
              <span className="text-emerald-600 dark:text-emerald-400">
                搜图插图不消耗 API 配额，搜索异常自动回退 AI 绘制
              </span>
            </div>
          </div>
        )}

        {/* 图中文字语言排版约束设置：支持封面与配图独立设定 */}
        <div className="rounded-xl border border-border/80 bg-surface/50 p-4 space-y-3">
          <div className="space-y-0.5">
            <h4 className="text-ui-sm font-semibold text-foreground flex items-center gap-1.5">
              <Languages className="size-4 text-primary" />
              <span>图中文字语言排版约束</span>
            </h4>
            <p className="text-ui-xs text-foreground-subtle">
              分别独立控制封面与正文配图的语言约束，底层自动强制执行，防止 AI 生成英文乱码与伪字符
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 pt-1">
            {/* 封面图文字开关 */}
            <div className="flex items-center justify-between rounded-lg border border-border/80 bg-background/60 p-3">
              <div className="space-y-0.5 pr-2">
                <div className="text-ui-xs font-semibold text-foreground">封面图文字仅中文排版</div>
                <div className="text-ui-2xs text-foreground-subtle">附加中文主标题与关键词艺术排版约束，严禁英文乱码与伪字符</div>
              </div>
              <Switch
                checked={Boolean(content.cover_lang_zh_only ?? content.image_lang_zh_only ?? true)}
                onCheckedChange={(c) => updateCurrentAccount({
                  content: {
                    ...content,
                    cover_lang_zh_only: c,
                    image_lang_zh_only: c && Boolean(content.content_image_lang_zh_only ?? content.image_lang_zh_only ?? true),
                  },
                })}
              />
            </div>

            {/* 正文配图文字开关 */}
            <div className="flex items-center justify-between rounded-lg border border-border/80 bg-background/60 p-3">
              <div className="space-y-0.5 pr-2">
                <div className="text-ui-xs font-semibold text-foreground">正文配图文字仅中文排版</div>
                <div className="text-ui-2xs text-foreground-subtle">正文高清插图涉及文字要素时严格要求纯中文，严禁英文单词与伪字符</div>
              </div>
              <Switch
                checked={Boolean(content.content_image_lang_zh_only ?? content.image_lang_zh_only ?? true)}
                onCheckedChange={(c) => updateCurrentAccount({
                  content: {
                    ...content,
                    content_image_lang_zh_only: c,
                    image_lang_zh_only: Boolean(content.cover_lang_zh_only ?? content.image_lang_zh_only ?? true) && c,
                  },
                })}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
