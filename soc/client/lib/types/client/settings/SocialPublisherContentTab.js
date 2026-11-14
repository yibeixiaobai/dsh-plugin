import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useMemo } from "react";
import css from "./SocialPublisherSettings.module.css";
import { SettingsSegmentedTabs } from "../compat/settings/SettingsSegmentedTabs.js";
import { THEMES } from "./SocialPublisherTypes.js";
import { SocialPublisherContentBasicTab } from "./SocialPublisherContentBasicTab.js";
import { SocialPublisherContentMediaSubTabs } from "./SocialPublisherContentMediaSubTabs.js";
import { SocialPublisherContentBrandSubTab } from "./SocialPublisherContentBrandSubTab.js";
import { SocialPublisherContentScheduleSubTab } from "./SocialPublisherContentScheduleSubTab.js";
const DEFAULT_BADGE = {
    label: "微信公众号",
    badge: "公众号",
    color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
};
const PLATFORM_BADGE_STYLE = {
    gzh: DEFAULT_BADGE,
    wechat: DEFAULT_BADGE,
    zhihu: {
        label: "知乎专栏",
        badge: "知乎",
        color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    },
    xhs: {
        label: "小红书",
        badge: "小红书",
        color: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    },
    xiaohongshu: {
        label: "小红书",
        badge: "小红书",
        color: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    },
    baijiahao: {
        label: "百度百家号",
        badge: "百家号",
        color: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
    },
    toutiao: {
        label: "今日头条",
        badge: "头条号",
        color: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
    },
};
function getPlatformBadge(platform) {
    const p = (platform || "gzh").toLowerCase();
    return PLATFORM_BADGE_STYLE[p] ?? DEFAULT_BADGE;
}
export function SocialPublisherContentTab({ accountsList, selectedAccountId, setSelectedAccountId, currentAccount, updateCurrentAccount, }) {
    const [subTab, setSubTab] = useState("basic");
    const platform = currentAccount?.platform || "gzh";
    const isGzh = platform === "gzh";
    const isZhihu = platform === "zhihu";
    const isXhs = platform === "xiaohongshu";
    const isBaijiahao = platform === "baijiahao";
    const isToutiao = platform === "toutiao";
    const isCardFlow = isXhs || (isGzh && currentAccount?.article_type === "newspic");
    // 计算子 Tab 的名称与项
    const subTabItems = useMemo(() => {
        let basicLabel = "发文形态与篇数";
        if (isXhs)
            basicLabel = "笔记参数与选题";
        else if (isBaijiahao || isToutiao)
            basicLabel = "发文篇数与选题";
        let typoLabel = "正文排版规范";
        if (isXhs)
            typoLabel = "笔记排版形态";
        else if (isZhihu)
            typoLabel = "知乎专栏排版";
        else if (isBaijiahao || isToutiao)
            typoLabel = "平台排版说明";
        let imageLabel = "AI 封面与配图";
        if (isXhs)
            imageLabel = "AI 配图规格 (3:4)";
        else if (isBaijiahao)
            imageLabel = "AI 封面规格 (2.35:1)";
        else if (isToutiao || isZhihu)
            imageLabel = "AI 封面规格 (16:9)";
        // 【中文修复依据】：长图文专栏（公众号长文、知乎专栏、百家号、今日头条）均支持首尾品牌图；纯多图卡片（小红书）显示体裁说明
        const brandLabel = isCardFlow ? "品牌图说明" : "品牌头尾图";
        return [
            { label: basicLabel, value: "basic" },
            { label: typoLabel, value: "typography" },
            { label: imageLabel, value: "image" },
            { label: brandLabel, value: "brand" },
            { label: "发文与定时规则", value: "schedule" },
        ];
    }, [isCardFlow, isXhs, isZhihu, isBaijiahao, isToutiao]);
    return (_jsxs("div", { className: "space-y-6", "data-testid": "social-publisher-content-tab", children: [_jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "space-y-0.5", children: [_jsx("h3", { className: "text-ui-base font-bold text-foreground", children: "\u8D26\u53F7\u5185\u5BB9\u4E0E\u6392\u7248\u89C4\u5219\uFF08\u4E00\u53F7\u4E00\u914D\u7F6E\uFF09" }), _jsx("p", { className: "text-ui-xs text-foreground-subtle", children: "\u6BCF\u4E2A\u8D26\u53F7\u72EC\u4EAB\u4E13\u5C5E\u7684\u53D1\u6587\u5F62\u6001\u3001\u6B63\u6587\u6392\u7248\u89C4\u8303\u3001AI \u5C01\u9762\u4E0E\u914D\u56FE\u6BD4\u4F8B\u3001\u4EE5\u53CA\u54C1\u724C\u5934\u5C3E\u56FE\u3002" })] }), _jsxs("span", { className: "rounded-full border border-border bg-surface px-2.5 py-0.5 text-ui-xs text-foreground-subtle font-mono", children: [accountsList.length, " \u4E2A\u8D26\u53F7"] })] }), _jsx("div", { className: "grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3", children: accountsList.map((acc) => {
                            const isSelected = acc.id === selectedAccountId;
                            const pInfo = getPlatformBadge(acc.platform);
                            const c = acc.content || {};
                            let summaryText = "";
                            if (acc.platform === "xiaohongshu") {
                                summaryText = `小红书笔记 · ${c.articles_per_day ?? 1}篇/日 · ${c.xhs_images_per_note ?? 4}张配图 · 3:4竖版`;
                            }
                            else if (acc.platform === "zhihu") {
                                summaryText = `知乎专栏 · ${c.articles_per_day ?? 1}篇/日 · 最低${c.min_words ?? 2000}字 · 16:9封面`;
                            }
                            else if (acc.platform === "baijiahao") {
                                summaryText = `百家号图文 · ${c.articles_per_day ?? 1}篇/日 · 最低${c.min_words ?? 2000}字 · 2.35:1封面`;
                            }
                            else if (acc.platform === "toutiao") {
                                summaryText = `头条号图文 · ${c.articles_per_day ?? 1}篇/日 · 最低${c.min_words ?? 2000}字 · 16:9封面`;
                            }
                            else {
                                const artType = c.article_type || "news";
                                const typeLabel = artType === "newspic" ? "小绿书" : artType === "both" ? "双发" : "长文";
                                const themeLabel = THEMES.find((t) => t.value === c.headline_theme)?.label.replace(/（.*）/, "") ||
                                    "石墨";
                                summaryText = `公众号${typeLabel} · ${c.articles_per_day ?? 6}篇/日 · ${themeLabel} · ${c.headline_cover_ratio || "2.35:1"}`;
                            }
                            return (_jsxs("div", { role: "button", tabIndex: 0, onClick: () => setSelectedAccountId(acc.id), onKeyDown: (e) => {
                                    if (e.key === "Enter" || e.key === " ")
                                        setSelectedAccountId(acc.id);
                                }, className: `${css.accountCard} ${isSelected ? css.accountCardSelected : ""}`, children: [_jsxs("div", { className: "space-y-1", children: [_jsxs("div", { className: "flex items-center justify-between gap-1.5", children: [_jsx("span", { className: "font-semibold text-ui-sm text-foreground truncate max-w-[130px]", title: acc.name || acc.id, children: acc.name || acc.id }), _jsx("span", { className: `inline-flex items-center px-1.5 py-0.5 rounded text-ui-xs font-medium border ${pInfo.color}`, children: pInfo.badge })] }), _jsxs("div", { className: "font-mono text-ui-xs text-foreground-subtle truncate", children: ["ID: ", acc.id] })] }), _jsx("div", { className: "mt-2.5 pt-2 border-t border-border/40 text-ui-xs text-foreground-subtle truncate", children: summaryText })] }, acc.id));
                        }) })] }), _jsxs("div", { className: "rounded-xl border border-card-border bg-card/70 p-5 space-y-5 shadow-2xs backdrop-blur-md", children: [_jsxs("div", { className: "flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/70 pb-4", children: [_jsxs("div", { className: "space-y-0.5", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("span", { className: "text-ui-base font-bold text-foreground", children: ["\u5B9A\u5236\u89C4\u5219: ", currentAccount?.name || selectedAccountId] }), _jsx("span", { className: "rounded bg-surface-active px-2 py-0.5 font-mono text-ui-xs text-foreground-subtle", children: currentAccount?.platform || "gzh" })] }), _jsx("p", { className: "text-ui-xs text-foreground-subtle", children: "\u9488\u5BF9\u8BE5\u8D26\u53F7\u72EC\u7ACB\u4FDD\u5B58\u53D1\u6587\u7BC7\u6570\u3001\u6392\u7248\u8272\u5F69\u3001\u914D\u56FE\u89C4\u683C\u4E0E\u6392\u671F\u65F6\u6BB5" })] }), _jsx("div", { className: "overflow-x-auto pb-1 sm:pb-0", children: _jsx(SettingsSegmentedTabs, { items: subTabItems, value: subTab, onValueChange: (val) => setSubTab(val) }) })] }), subTab === "basic" && (_jsx(SocialPublisherContentBasicTab, { currentAccount: currentAccount, updateCurrentAccount: updateCurrentAccount, isGzh: isGzh, isXhs: isXhs })), (subTab === "typography" || subTab === "image") && (_jsx(SocialPublisherContentMediaSubTabs, { currentAccount: currentAccount, updateCurrentAccount: updateCurrentAccount, subTab: subTab, isZhihu: isZhihu, isXhs: isXhs, isBaijiahao: isBaijiahao, isToutiao: isToutiao })), subTab === "brand" && (_jsx(SocialPublisherContentBrandSubTab, { currentAccount: currentAccount, updateCurrentAccount: updateCurrentAccount, isCardFlow: isCardFlow })), subTab === "schedule" && (_jsx(SocialPublisherContentScheduleSubTab, { currentAccount: currentAccount, updateCurrentAccount: updateCurrentAccount, platform: platform }))] })] }));
}
//# sourceMappingURL=SocialPublisherContentTab.js.map