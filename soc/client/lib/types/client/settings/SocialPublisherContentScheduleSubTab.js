import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useMemo } from "react";
import { Clock, Calendar, RotateCcw, Plus, X, Send, FileText, Info } from "lucide-react";
import { Input } from "../compat/components/ui/input.js";
import { Switch } from "../compat/components/ui/switch.js";
import { Button } from "../compat/components/ui/button.js";
import { cn } from "../compat/components/lib/utils.js";
const GZH_PRESET = {
    name: "微信公众号",
    articleTimes: ["07:45", "12:15", "21:00"],
    newspicTimes: ["10:00", "15:00", "20:30"],
    tip: "公众号长文推荐早通勤 (07:45)、午休阅读 (12:15) 与晚间高峰 (21:00)；小绿书更适合碎片化时段。底层通过浏览器模拟操作在后台自动完成定时发表设置（完全由微信官方后台安全托管群发）。",
};
// 5 大平台黄金发文时段预设库
const PLATFORM_PRESETS = {
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
export function SocialPublisherContentScheduleSubTab({ currentAccount, updateCurrentAccount, platform, }) {
    const p = (platform || "gzh").toLowerCase();
    const preset = PLATFORM_PRESETS[p] ?? GZH_PRESET;
    const [newArticleTime, setNewArticleTime] = useState("");
    const [newNewspicTime, setNewNewspicTime] = useState("");
    const publishAction = currentAccount?.publish_action_default || "draft";
    const articleTimes = useMemo(() => Array.isArray(currentAccount?.schedule_times_article)
        ? currentAccount.schedule_times_article
        : preset.articleTimes, [currentAccount?.schedule_times_article, preset.articleTimes]);
    const newspicTimes = useMemo(() => Array.isArray(currentAccount?.schedule_times_newspic)
        ? currentAccount.schedule_times_newspic
        : preset.newspicTimes || ["12:00", "18:00", "21:30"], [currentAccount?.schedule_times_newspic, preset.newspicTimes]);
    const autoDelay = currentAccount?.schedule_auto_delay !== false;
    const conflictInterval = currentAccount?.schedule_conflict_interval_mins ?? 30;
    const handleAddArticleTime = () => {
        const trimmed = newArticleTime.trim();
        if (!/^\d{1,2}:\d{2}$/.test(trimmed))
            return;
        const formatted = trimmed.padStart(5, "0");
        if (!articleTimes.includes(formatted)) {
            const next = [...articleTimes, formatted].sort();
            updateCurrentAccount({ schedule_times_article: next });
        }
        setNewArticleTime("");
    };
    const handleRemoveArticleTime = (time) => {
        const next = articleTimes.filter((t) => t !== time);
        updateCurrentAccount({ schedule_times_article: next });
    };
    const handleAddNewspicTime = () => {
        const trimmed = newNewspicTime.trim();
        if (!/^\d{1,2}:\d{2}$/.test(trimmed))
            return;
        const formatted = trimmed.padStart(5, "0");
        if (!newspicTimes.includes(formatted)) {
            const next = [...newspicTimes, formatted].sort();
            updateCurrentAccount({ schedule_times_newspic: next });
        }
        setNewNewspicTime("");
    };
    const handleRemoveNewspicTime = (time) => {
        const next = newspicTimes.filter((t) => t !== time);
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
    const hasNewspic = isGzh &&
        (currentAccount?.content?.article_type === "newspic" ||
            currentAccount?.content?.article_type === "both" ||
            currentAccount?.content?.sync_newspic);
    return (_jsxs("div", { className: "space-y-5", "data-testid": "social-publisher-schedule-settings", children: [_jsxs("div", { className: "flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/[0.04] p-4 text-ui-xs leading-relaxed text-foreground", children: [_jsx(Info, { className: "size-4.5 text-primary shrink-0 mt-0.5" }), _jsxs("div", { className: "space-y-1.5 flex-1", children: [_jsxs("div", { className: "font-semibold text-foreground flex items-center justify-between flex-wrap gap-2", children: [_jsxs("span", { children: [preset.name, " \u00B7 \u53D1\u6587\u65F6\u6BB5\u4E0E\u6392\u671F\u673A\u5236\u8BF4\u660E"] }), _jsxs(Button, { type: "button", variant: "outline", size: "sm", onClick: handleApplyPreset, className: "h-6.5 gap-1 px-2.5 text-ui-xs font-medium text-primary border-primary/30 hover:bg-primary/10 cursor-pointer shadow-2xs", children: [_jsx(RotateCcw, { className: "size-3" }), _jsx("span", { children: "\u6062\u590D\u5E73\u53F0\u9EC4\u91D1\u9884\u8BBE" })] })] }), _jsx("p", { className: "text-foreground-subtle", children: preset.tip })] })] }), _jsxs("div", { className: "rounded-xl border border-border/80 bg-surface/50 p-4 space-y-3", children: [_jsxs("div", { className: "space-y-0.5", children: [_jsx("h4", { className: "text-ui-sm font-semibold text-foreground", children: "\u9ED8\u8BA4\u53D1\u5E03\u52A8\u4F5C\u7B56\u7565" }), _jsx("p", { className: "text-ui-xs text-foreground-subtle", children: "\u5728\u4F1A\u8BDD\u4E2D\u4E00\u952E\u786E\u8BA4\u53D1\u5E03\u6216\u6279\u91CF\u8C03\u5EA6\u65F6\u7684\u9996\u9009\u52A8\u4F5C\u5904\u7406\u7B56\u7565" })] }), _jsxs("div", { className: "grid gap-3 sm:grid-cols-3", children: [_jsxs("button", { type: "button", onClick: () => updateCurrentAccount({ publish_action_default: "draft" }), className: cn("flex flex-col items-start gap-1 rounded-xl p-3 text-left border transition-all cursor-pointer", publishAction === "draft"
                                    ? "bg-background border-primary shadow-xs ring-1 ring-primary/25"
                                    : "bg-surface/30 border-border hover:bg-surface/70 text-foreground-subtle"), children: [_jsxs("div", { className: "flex items-center gap-1.5 font-semibold text-ui-xs text-foreground", children: [_jsx(FileText, { className: "size-3.5 text-primary" }), _jsx("span", { children: "\u4EC5\u5B58\u5165\u5B98\u65B9\u8349\u7A3F\u7BB1" })] }), _jsx("p", { className: "text-ui-xs text-foreground-subtle leading-tight", children: "\u63A8\u8350\u5B89\u5168\u5BA1\u6821\u8DEF\u7EBF\uFF1A\u5B58\u5165\u540E\u53F0\u8349\u7A3F\u7BB1\uFF0C\u4FBF\u4E8E\u4EBA\u5DE5\u4E8C\u5BA1\u5FAE\u8C03\u540E\u53D1\u5E03" })] }), _jsxs("button", { type: "button", onClick: () => updateCurrentAccount({ publish_action_default: "schedule" }), className: cn("flex flex-col items-start gap-1 rounded-xl p-3 text-left border transition-all cursor-pointer", publishAction === "schedule"
                                    ? "bg-background border-primary shadow-xs ring-1 ring-primary/25"
                                    : "bg-surface/30 border-border hover:bg-surface/70 text-foreground-subtle"), children: [_jsxs("div", { className: "flex items-center gap-1.5 font-semibold text-ui-xs text-foreground", children: [_jsx(Calendar, { className: "size-3.5 text-emerald-600 dark:text-emerald-400" }), _jsx("span", { children: "\u667A\u80FD\u5B9A\u65F6\u6392\u671F\u53D1\u5E03" })] }), _jsx("p", { className: "text-ui-xs text-foreground-subtle leading-tight", children: "\u6309\u4E0B\u65B9\u914D\u7F6E\u7684\u65F6\u6BB5\u69FD\u4F4D\u667A\u80FD\u6392\u671F\uFF0C\u652F\u6301\u81EA\u52A8\u5316\u9632\u649E\u987A\u5EF6" })] }), _jsxs("button", { type: "button", onClick: () => updateCurrentAccount({ publish_action_default: "publish_now" }), className: cn("flex flex-col items-start gap-1 rounded-xl p-3 text-left border transition-all cursor-pointer", publishAction === "publish_now"
                                    ? "bg-background border-primary shadow-xs ring-1 ring-primary/25"
                                    : "bg-surface/30 border-border hover:bg-surface/70 text-foreground-subtle"), children: [_jsxs("div", { className: "flex items-center gap-1.5 font-semibold text-ui-xs text-foreground", children: [_jsx(Send, { className: "size-3.5 text-primary" }), _jsx("span", { children: "\u7ACB\u5373\u516C\u5F00\u53D1\u5E03" })] }), _jsx("p", { className: "text-ui-xs text-foreground-subtle leading-tight", children: "\u751F\u6210\u5B8C\u6210\u540E\u76F4\u63A5\u53D1\u5E03\u4E3A\u516C\u5F00\u53EF\u89C1\u52A8\u6001\uFF08\u77E5\u4E4E\u3001\u5C0F\u7EA2\u4E66\u3001\u5934\u6761\u7B49\u652F\u6301\uFF09" })] })] })] }), _jsxs("div", { className: "rounded-xl border border-border/80 bg-surface/50 p-4 space-y-3", children: [_jsxs("div", { className: "space-y-0.5", children: [_jsxs("h4", { className: "text-ui-sm font-semibold text-foreground flex items-center gap-2", children: [_jsx(Clock, { className: "size-4 text-primary" }), _jsx("span", { children: "\u957F\u6587 / \u4E13\u680F\u6392\u671F\u5019\u9009\u65F6\u6BB5\u69FD\u4F4D\u6C60" })] }), _jsx("p", { className: "text-ui-xs text-foreground-subtle", children: "\u7CFB\u7EDF\u591A\u7BC7\u6392\u671F\u53D1\u6587\u65F6\uFF0C\u5C06\u4F9D\u6B21\u6CBF\u7528\u65F6\u6BB5\u69FD\u4F4D\uFF1B\u5DF2\u5360\u7528\u5219\u81EA\u52A8\u987A\u5EF6" })] }), _jsxs("div", { className: "flex flex-wrap items-center gap-2 pt-1", children: [articleTimes.map((time) => (_jsxs("div", { className: "inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1 text-ui-xs font-mono font-bold text-foreground shadow-2xs group", children: [_jsx("span", { children: time }), _jsx("button", { type: "button", onClick: () => handleRemoveArticleTime(time), className: "text-foreground-subtle hover:text-destructive cursor-pointer p-0.5 rounded transition-colors", title: `删除 ${time} 时段`, children: _jsx(X, { className: "size-3" }) })] }, time))), _jsxs("div", { className: "inline-flex items-center gap-1", children: [_jsx(Input, { type: "text", placeholder: "\u5982 18:30", value: newArticleTime, onChange: (e) => setNewArticleTime(e.target.value), onKeyDown: (e) => {
                                            if (e.key === "Enter")
                                                handleAddArticleTime();
                                        }, className: "h-8 w-24 text-ui-xs font-mono px-2" }), _jsxs(Button, { type: "button", variant: "outline", size: "sm", onClick: handleAddArticleTime, className: "h-8 px-2 text-ui-xs cursor-pointer gap-0.5", children: [_jsx(Plus, { className: "size-3" }), _jsx("span", { children: "\u6DFB\u52A0" })] })] })] })] }), hasNewspic && (_jsxs("div", { className: "rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04] p-4 space-y-3", children: [_jsxs("div", { className: "space-y-0.5", children: [_jsxs("h4", { className: "text-ui-sm font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-2", children: [_jsx(Clock, { className: "size-4 text-emerald-600 dark:text-emerald-400" }), _jsx("span", { children: "\u5FAE\u4FE1\u5C0F\u7EFF\u4E66\u4E13\u5C5E\u6392\u671F\u5019\u9009\u65F6\u6BB5\u69FD\u4F4D\u6C60" })] }), _jsx("p", { className: "text-ui-xs text-foreground-subtle", children: "\u5C0F\u7EFF\u4E66\u652F\u6301\u4E0E\u957F\u6587\u9519\u5CF0\u6392\u671F\uFF0C\u907F\u514D\u540C\u4E00\u65F6\u95F4\u4E92\u76F8\u51B2\u6DE1\u9605\u8BFB\u6D41\u91CF" })] }), _jsxs("div", { className: "flex flex-wrap items-center gap-2 pt-1", children: [newspicTimes.map((time) => (_jsxs("div", { className: "inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-background px-3 py-1 text-ui-xs font-mono font-bold text-emerald-700 dark:text-emerald-300 shadow-2xs", children: [_jsx("span", { children: time }), _jsx("button", { type: "button", onClick: () => handleRemoveNewspicTime(time), className: "text-foreground-subtle hover:text-destructive cursor-pointer p-0.5 rounded transition-colors", title: `删除小绿书 ${time} 时段`, children: _jsx(X, { className: "size-3" }) })] }, time))), _jsxs("div", { className: "inline-flex items-center gap-1", children: [_jsx(Input, { type: "text", placeholder: "\u5982 15:30", value: newNewspicTime, onChange: (e) => setNewNewspicTime(e.target.value), onKeyDown: (e) => {
                                            if (e.key === "Enter")
                                                handleAddNewspicTime();
                                        }, className: "h-8 w-24 text-ui-xs font-mono px-2" }), _jsxs(Button, { type: "button", variant: "outline", size: "sm", onClick: handleAddNewspicTime, className: "h-8 px-2 text-ui-xs cursor-pointer border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/10 gap-0.5", children: [_jsx(Plus, { className: "size-3" }), _jsx("span", { children: "\u6DFB\u52A0" })] })] })] })] })), _jsxs("div", { className: "grid gap-4 sm:grid-cols-2 rounded-xl border border-border/80 bg-surface/50 p-4", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "space-y-0.5 pr-2", children: [_jsx("span", { className: "text-ui-sm font-semibold text-foreground", children: "\u51B2\u7A81\u81EA\u52A8\u987A\u5EF6 (Auto Delay)" }), _jsx("p", { className: "text-ui-xs text-foreground-subtle", children: "\u76EE\u6807\u65F6\u6BB5\u5DF2\u8FC7\u53BB\u6216\u5DF2\u88AB\u5360\u7528\u65F6\uFF0C\u81EA\u52A8\u987A\u5EF6\u5230\u4E0B\u4E00\u4E2A\u53EF\u7528\u69FD\u4F4D\u6216\u6B21\u65E5" })] }), _jsx(Switch, { checked: autoDelay, onCheckedChange: (c) => updateCurrentAccount({ schedule_auto_delay: c }) })] }), _jsxs("label", { className: "space-y-1.5 text-ui-sm text-foreground", children: [_jsx("span", { className: "font-medium text-ui-xs text-foreground-subtle", children: "\u591A\u7BC7\u6700\u5C0F\u9632\u91CD\u53D1\u6587\u95F4\u9694 (\u5206\u949F)" }), _jsx(Input, { type: "number", value: conflictInterval, onChange: (e) => updateCurrentAccount({
                                    schedule_conflict_interval_mins: Math.max(5, Number(e.target.value) || 30),
                                }), className: "h-9 text-ui-xs" })] })] })] }));
}
//# sourceMappingURL=SocialPublisherContentScheduleSubTab.js.map