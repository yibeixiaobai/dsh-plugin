import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Layers, FileText, CalendarClock, Archive } from "lucide-react";
import { cn } from "../../compat/components/lib/utils.js";
export function SocialPlanMetrics({ totalBatches, totalArticles, scheduledCount, draftSavedCount, loading = false, }) {
    const metrics = [
        {
            id: "batches",
            label: "累计流水线批次",
            subLabel: "全平台多会话执行记录",
            value: totalBatches,
            unit: "批次",
            icon: Layers,
            accent: "text-foreground-subtle",
            badgeStyle: "bg-surface text-foreground-subtle border-border/60",
        },
        {
            id: "articles",
            label: "产出图文成稿",
            subLabel: "含长文排版与矩阵贴图",
            value: totalArticles,
            unit: "篇",
            icon: FileText,
            accent: "text-primary",
            badgeStyle: "bg-primary/10 text-primary border-primary/20",
        },
        {
            id: "scheduled",
            label: "官方排期托管",
            subLabel: "微信公众号定时群发任务",
            value: scheduledCount,
            unit: "项",
            icon: CalendarClock,
            accent: "text-emerald-600 dark:text-emerald-400",
            badgeStyle: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
        },
        {
            id: "drafts",
            label: "存入官方草稿",
            subLabel: "安全暂存待二次审校",
            value: draftSavedCount,
            unit: "篇",
            icon: Archive,
            accent: "text-sky-600 dark:text-sky-400",
            badgeStyle: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
        },
    ];
    return (_jsx("div", { className: "grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4", "data-testid": "social-plan-metrics", children: metrics.map((item) => {
            const Icon = item.icon;
            return (_jsxs("div", { className: cn("group relative flex flex-col justify-between rounded-xl border border-card-border/80 bg-card/60 p-4 transition-all duration-200", "hover:border-border hover:bg-card/90 hover:shadow-2xs"), children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx("span", { className: "text-ui-xs font-medium text-foreground-subtle tracking-tight", children: item.label }), _jsx("div", { className: cn("flex size-6 items-center justify-center rounded-lg border", item.badgeStyle), children: _jsx(Icon, { className: "size-3.5" }) })] }), _jsxs("div", { className: "mt-3 flex items-baseline gap-1.5", children: [loading ? (_jsx("div", { className: "h-7 w-16 animate-pulse rounded bg-black/5 dark:bg-white/10" })) : (_jsx("span", { className: "font-mono text-ui-2xl font-bold tracking-tight text-foreground", children: item.value.toLocaleString() })), _jsx("span", { className: "text-ui-xs text-foreground-subtle font-medium", children: item.unit })] }), _jsx("p", { className: "mt-1 text-[11px] text-foreground-subtle/80 truncate", children: item.subLabel })] }, item.id));
        }) }));
}
//# sourceMappingURL=SocialPlanMetrics.js.map