import { useState, useMemo } from "react";
import { Clock, Calendar, RotateCcw, Plus, X, Send, FileText, Info } from "lucide-react";
import { Input } from "../compat/components/ui/input.js";
import { Switch } from "../compat/components/ui/switch.js";
import { Button } from "../compat/components/ui/button.js";
import { cn } from "../compat/components/lib/utils.js";

interface ScheduleSubTabProps {
  currentAccount: any;
  updateCurrentAccount: (patch: any) => void;
  platform: string;
}

interface PlatformPreset {
  name: string;
  articleTimes: string[];
  newspicTimes?: string[];
  tip: string;
}

const GZH_PRESET: PlatformPreset = {
  name: "微信公众号",
  articleTimes: ["07:45", "12:15", "21:00"],
  newspicTimes: ["10:00", "15:00", "20:30"],
  tip: "公众号长文推荐早通勤 (07:45)、午休阅读 (12:15) 与晚间高峰 (21:00)；小绿书更适合碎片化时段。底层通过浏览器模拟操作在后台自动完成定时发表设置（完全由微信官方后台安全托管群发）。",
};

// 5 大平台黄金发文时段预设库
const PLATFORM_PRESETS: Record<string, PlatformPreset> = {
  gzh: GZH_PRESET,
  toutiao: {
    name: "今日头条",
    articleTimes: ["07:00", "12:30", "18:30"],
    tip: "头条号官方支持未来 2 小时至 14 天定时排期，推荐早间新闻 (07:00)、午间热点 (12:30) 与晚间黄金资讯档 (18:30)。",
  },
  xiaohongshu: {
    name: "小红书",
    articleTimes: ["12:15", "18:00", "20:30", "22:30"],
    newspicTimes: ["12:15", "18:00", "20:30"],
    tip: "小红书网页创作者服务平台支持未来 14 天定时发布笔记，推荐午休种草 (12:15)、下班放松 (18:00) 与晚间高互动档 (20:30)。",
  },
  baijiahao: {
    name: "百家号",
    articleTimes: ["08:00", "14:00", "19:30"],
    tip: "百家号支持未来定时发布，上午 08:00 便于百度搜索爬虫快速收录，下午与晚间适宜资讯深度阅读。",
  },
  zhihu: {
    name: "知乎专栏",
    articleTimes: ["09:30", "21:30"],
    tip: "知乎以专业深度讨论为主，推荐工作黄金档 (09:30) 与深夜深度思考档 (21:30)；专栏文章以即时发布与存草稿为主。",
  },
};

export function SocialPublisherContentScheduleSubTab({
  currentAccount,
  updateCurrentAccount,
  platform,
}: ScheduleSubTabProps) {
  const p = (platform || "gzh").toLowerCase();
  const preset: PlatformPreset = PLATFORM_PRESETS[p] ?? GZH_PRESET;

  const [newArticleTime, setNewArticleTime] = useState("");
  const [newNewspicTime, setNewNewspicTime] = useState("");

  const publishAction = currentAccount?.publish_action_default || "draft";
  const articleTimes = useMemo(
    () =>
      Array.isArray(currentAccount?.schedule_times_article)
        ? currentAccount.schedule_times_article
        : preset.articleTimes,
    [currentAccount?.schedule_times_article, preset.articleTimes],
  );

  const newspicTimes = useMemo(
    () =>
      Array.isArray(currentAccount?.schedule_times_newspic)
        ? currentAccount.schedule_times_newspic
        : preset.newspicTimes || ["12:00", "18:00", "21:30"],
    [currentAccount?.schedule_times_newspic, preset.newspicTimes],
  );

  const autoDelay = currentAccount?.schedule_auto_delay !== false;
  const conflictInterval = currentAccount?.schedule_conflict_interval_mins ?? 30;

  const handleAddArticleTime = () => {
    const trimmed = newArticleTime.trim();
    if (!/^\d{1,2}:\d{2}$/.test(trimmed)) return;
    const formatted = trimmed.padStart(5, "0");
    if (!articleTimes.includes(formatted)) {
      const next = [...articleTimes, formatted].sort();
      updateCurrentAccount({ schedule_times_article: next });
    }
    setNewArticleTime("");
  };

  const handleRemoveArticleTime = (time: string) => {
    const next = articleTimes.filter((t: string) => t !== time);
    updateCurrentAccount({ schedule_times_article: next });
  };

  const handleAddNewspicTime = () => {
    const trimmed = newNewspicTime.trim();
    if (!/^\d{1,2}:\d{2}$/.test(trimmed)) return;
    const formatted = trimmed.padStart(5, "0");
    if (!newspicTimes.includes(formatted)) {
      const next = [...newspicTimes, formatted].sort();
      updateCurrentAccount({ schedule_times_newspic: next });
    }
    setNewNewspicTime("");
  };

  const handleRemoveNewspicTime = (time: string) => {
    const next = newspicTimes.filter((t: string) => t !== time);
    updateCurrentAccount({ schedule_times_newspic: next });
  };

  const handleApplyPreset = () => {
    updateCurrentAccount({
      schedule_times_article: preset.articleTimes,
      ...(preset.newspicTimes ? { schedule_times_newspic: preset.newspicTimes } : {}),
      schedule_auto_delay: true,
      schedule_conflict_interval_mins: 30,
    });
  };

  const isGzh = p === "gzh" || p === "wechat";
  const hasNewspic =
    isGzh &&
    (currentAccount?.content?.article_type === "newspic" ||
      currentAccount?.content?.article_type === "both" ||
      currentAccount?.content?.sync_newspic);

  return (
    <div className="space-y-5" data-testid="social-publisher-schedule-settings">
      {/* 平台自动化实现说明横幅 */}
      <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/[0.04] p-4 text-ui-xs leading-relaxed text-foreground">
        <Info className="size-4.5 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1.5 flex-1">
          <div className="font-semibold text-foreground flex items-center justify-between flex-wrap gap-2">
            <span>{preset.name} · 发文时段与排期机制说明</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleApplyPreset}
              className="h-6.5 gap-1 px-2.5 text-ui-xs font-medium text-primary border-primary/30 hover:bg-primary/10 cursor-pointer shadow-2xs"
            >
              <RotateCcw className="size-3" />
              <span>恢复平台黄金预设</span>
            </Button>
          </div>
          <p className="text-foreground-subtle">{preset.tip}</p>
        </div>
      </div>

      {/* 1. 默认发文行动 (publish_action_default) */}
      <div className="rounded-xl border border-border/80 bg-surface/50 p-4 space-y-3">
        <div className="space-y-0.5">
          <h4 className="text-ui-sm font-semibold text-foreground">默认发布动作策略</h4>
          <p className="text-ui-xs text-foreground-subtle">
            在会话中一键确认发布或批量调度时的首选动作处理策略
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => updateCurrentAccount({ publish_action_default: "draft" })}
            className={cn(
              "flex flex-col items-start gap-1 rounded-xl p-3 text-left border transition-all cursor-pointer",
              publishAction === "draft"
                ? "bg-background border-primary shadow-xs ring-1 ring-primary/25"
                : "bg-surface/30 border-border hover:bg-surface/70 text-foreground-subtle",
            )}
          >
            <div className="flex items-center gap-1.5 font-semibold text-ui-xs text-foreground">
              <FileText className="size-3.5 text-primary" />
              <span>仅存入官方草稿箱</span>
            </div>
            <p className="text-ui-xs text-foreground-subtle leading-tight">
              推荐安全审校路线：存入后台草稿箱，便于人工二审微调后发布
            </p>
          </button>

          <button
            type="button"
            onClick={() => updateCurrentAccount({ publish_action_default: "schedule" })}
            className={cn(
              "flex flex-col items-start gap-1 rounded-xl p-3 text-left border transition-all cursor-pointer",
              publishAction === "schedule"
                ? "bg-background border-primary shadow-xs ring-1 ring-primary/25"
                : "bg-surface/30 border-border hover:bg-surface/70 text-foreground-subtle",
            )}
          >
            <div className="flex items-center gap-1.5 font-semibold text-ui-xs text-foreground">
              <Calendar className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>智能定时排期发布</span>
            </div>
            <p className="text-ui-xs text-foreground-subtle leading-tight">
              按下方配置的时段槽位智能排期，支持自动化防撞顺延
            </p>
          </button>

          <button
            type="button"
            onClick={() => updateCurrentAccount({ publish_action_default: "publish_now" })}
            className={cn(
              "flex flex-col items-start gap-1 rounded-xl p-3 text-left border transition-all cursor-pointer",
              publishAction === "publish_now"
                ? "bg-background border-primary shadow-xs ring-1 ring-primary/25"
                : "bg-surface/30 border-border hover:bg-surface/70 text-foreground-subtle",
            )}
          >
            <div className="flex items-center gap-1.5 font-semibold text-ui-xs text-foreground">
              <Send className="size-3.5 text-primary" />
              <span>立即公开发布</span>
            </div>
            <p className="text-ui-xs text-foreground-subtle leading-tight">
              生成完成后直接发布为公开可见动态（知乎、小红书、头条等支持）
            </p>
          </button>
        </div>
      </div>

      {/* 2. 正文/长文发文候选时段列表 (schedule_times_article) */}
      <div className="rounded-xl border border-border/80 bg-surface/50 p-4 space-y-3">
        <div className="space-y-0.5">
          <h4 className="text-ui-sm font-semibold text-foreground flex items-center gap-2">
            <Clock className="size-4 text-primary" />
            <span>长文 / 专栏排期候选时段槽位池</span>
          </h4>
          <p className="text-ui-xs text-foreground-subtle">
            系统多篇排期发文时，将依次沿用时段槽位；已占用则自动顺延
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {articleTimes.map((time: string) => (
            <div
              key={time}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1 text-ui-xs font-mono font-bold text-foreground shadow-2xs group"
            >
              <span>{time}</span>
              <button
                type="button"
                onClick={() => handleRemoveArticleTime(time)}
                className="text-foreground-subtle hover:text-destructive cursor-pointer p-0.5 rounded transition-colors"
                title={`删除 ${time} 时段`}
              >
                <X className="size-3" />
              </button>
            </div>
          ))}

          {/* 新增时段输入框 */}
          <div className="inline-flex items-center gap-1">
            <Input
              type="text"
              placeholder="如 18:30"
              value={newArticleTime}
              onChange={(e) => setNewArticleTime(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddArticleTime();
              }}
              className="h-8 w-24 text-ui-xs font-mono px-2"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddArticleTime}
              className="h-8 px-2 text-ui-xs cursor-pointer gap-0.5"
            >
              <Plus className="size-3" />
              <span>添加</span>
            </Button>
          </div>
        </div>
      </div>

      {/* 3. 小绿书 / 竖版卡片专属时段列表 (仅微信包含小绿书时展示) */}
      {hasNewspic && (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04] p-4 space-y-3">
          <div className="space-y-0.5">
            <h4 className="text-ui-sm font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <Clock className="size-4 text-emerald-600 dark:text-emerald-400" />
              <span>微信小绿书专属排期候选时段槽位池</span>
            </h4>
            <p className="text-ui-xs text-foreground-subtle">
              小绿书支持与长文错峰排期，避免同一时间互相冲淡阅读流量
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {newspicTimes.map((time: string) => (
              <div
                key={time}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-background px-3 py-1 text-ui-xs font-mono font-bold text-emerald-700 dark:text-emerald-300 shadow-2xs"
              >
                <span>{time}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveNewspicTime(time)}
                  className="text-foreground-subtle hover:text-destructive cursor-pointer p-0.5 rounded transition-colors"
                  title={`删除小绿书 ${time} 时段`}
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}

            <div className="inline-flex items-center gap-1">
              <Input
                type="text"
                placeholder="如 15:30"
                value={newNewspicTime}
                onChange={(e) => setNewNewspicTime(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddNewspicTime();
                }}
                className="h-8 w-24 text-ui-xs font-mono px-2"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddNewspicTime}
                className="h-8 px-2 text-ui-xs cursor-pointer border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/10 gap-0.5"
              >
                <Plus className="size-3" />
                <span>添加</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 4. 智能防冲突与顺延规则 */}
      <div className="grid gap-4 sm:grid-cols-2 rounded-xl border border-border/80 bg-surface/50 p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5 pr-2">
            <span className="text-ui-sm font-semibold text-foreground">
              冲突自动顺延 (Auto Delay)
            </span>
            <p className="text-ui-xs text-foreground-subtle">
              目标时段已过去或已被占用时，自动顺延到下一个可用槽位或次日
            </p>
          </div>
          <Switch
            checked={autoDelay}
            onCheckedChange={(c) => updateCurrentAccount({ schedule_auto_delay: c })}
          />
        </div>

        <label className="space-y-1.5 text-ui-sm text-foreground">
          <span className="font-medium text-ui-xs text-foreground-subtle">
            多篇最小防重发文间隔 (分钟)
          </span>
          <Input
            type="number"
            value={conflictInterval}
            onChange={(e) =>
              updateCurrentAccount({
                schedule_conflict_interval_mins: Math.max(5, Number(e.target.value) || 30),
              })
            }
            className="h-9 text-ui-xs"
          />
        </label>
      </div>
    </div>
  );
}
