import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { ChevronDown, Plus, Settings2, Database, Search, X, } from "lucide-react";
import css from "./SocialPublisherSettings.module.css";
import { socialPublisherConfigStore, useSocialPublisherStore, } from "./SocialPublisherConfigStore.js";
import { normalizeAccountsList } from "./SocialPublisherTypes.js";
const PLATFORM_GROUPS = [
    { key: "gzh", name: "微信公众号", shortName: "微信", badge: "WX" },
    { key: "xiaohongshu", name: "小红书", shortName: "红书", badge: "XHS" },
    { key: "zhihu", name: "知乎专栏", shortName: "知乎", badge: "ZH" },
    { key: "baijiahao", name: "百家号", shortName: "百家", badge: "BJH" },
    { key: "toutiao", name: "今日头条", shortName: "头条", badge: "TT" },
];
function PlatformIcon({ platform }) {
    const p = (platform || "gzh").toLowerCase();
    if (p === "gzh") {
        return (_jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { d: "M8 12h.01M12 12h.01M16 8h.01M20 8h.01M9 16c-4.418 0-8-2.686-8-6s3.582-6 8-6 8 2.686 8 6c0 1.257-.52 2.417-1.408 3.354L17 21l-3.667-2.037A9.458 9.458 0 0 1 9 16z" }) }));
    }
    if (p === "xiaohongshu" || p === "xhs") {
        return (_jsxs("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("path", { d: "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" }), _jsx("path", { d: "M6 6h10M6 10h10" })] }));
    }
    if (p === "zhihu") {
        return (_jsxs("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("path", { d: "M4 4h16v16H4z" }), _jsx("path", { d: "M9 8h6l-6 8h6" })] }));
    }
    if (p === "baijiahao" || p === "bjh") {
        return (_jsxs("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("circle", { cx: "12", cy: "12", r: "10" }), _jsx("path", { d: "M12 6v6l4 2" })] }));
    }
    return (_jsxs("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("rect", { x: "3", y: "4", width: "18", height: "16", rx: "2" }), _jsx("line", { x1: "7", y1: "8", x2: "17", y2: "8" }), _jsx("line", { x1: "7", y1: "12", x2: "13", y2: "12" }), _jsx("line", { x1: "7", y1: "16", x2: "11", y2: "16" })] }));
}
export function SocialPublisherAccountRail() {
    const { config, selectedAccountId, activeNav, loginStatusMap, collapsedGroups, searchQuery, } = useSocialPublisherStore();
    const [addMenuOpen, setAddMenuOpen] = useState(false);
    const [platformFilter, setPlatformFilter] = useState("all");
    const rawAccounts = normalizeAccountsList(config?.accounts);
    const q = searchQuery.trim().toLowerCase();
    const searchFiltered = q
        ? rawAccounts.filter((a) => (a.name || "").toLowerCase().includes(q) ||
            (a.id || "").toLowerCase().includes(q) ||
            (a.platform || "").toLowerCase().includes(q))
        : rawAccounts;
    const accounts = platformFilter === "all"
        ? searchFiltered
        : searchFiltered.filter((a) => {
            const p = (a.platform || "gzh").toLowerCase();
            if (platformFilter === "xiaohongshu") {
                return p === "xiaohongshu" || p === "xhs";
            }
            return p === platformFilter;
        });
    const handleSelectAccount = (id) => {
        socialPublisherConfigStore.setSelectedAccountId(id);
    };
    const handleAddPlatformAccount = (platformKey) => {
        socialPublisherConfigStore.addAccount(platformKey);
        setAddMenuOpen(false);
    };
    return (_jsxs("aside", { className: css.masterRail, "data-testid": "social-publisher-account-rail", children: [_jsxs("div", { className: css.railHeader, children: [_jsxs("div", { className: "relative w-full", children: [_jsx(Search, { className: "absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" }), _jsx("input", { type: "text", className: "h-8 w-full rounded-md border border-border/80 bg-background pl-8 pr-7 text-ui-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none", placeholder: "\u641C\u7D22\u8D26\u53F7...", value: searchQuery, onChange: (e) => socialPublisherConfigStore.setSearchQuery(e.target.value) }), searchQuery && (_jsx("button", { type: "button", className: "absolute right-2 top-2 text-muted-foreground hover:text-foreground", onClick: () => socialPublisherConfigStore.setSearchQuery(""), children: _jsx(X, { className: "size-3.5" }) }))] }), _jsxs("div", { className: css.platformFilterStrip, children: [_jsxs("button", { type: "button", className: `${css.filterChip} ${platformFilter === "all" ? css.filterChipActive : ""}`, onClick: () => setPlatformFilter("all"), children: ["\u5168\u90E8 (", rawAccounts.length, ")"] }), PLATFORM_GROUPS.map((pg) => {
                                const count = rawAccounts.filter((a) => {
                                    const p = (a.platform || "gzh").toLowerCase();
                                    if (pg.key === "xiaohongshu")
                                        return p === "xiaohongshu" || p === "xhs";
                                    return p === pg.key;
                                }).length;
                                if (count === 0)
                                    return null;
                                return (_jsxs("button", { type: "button", className: `${css.filterChip} ${platformFilter === pg.key ? css.filterChipActive : ""}`, onClick: () => setPlatformFilter(pg.key), children: [pg.shortName, " (", count, ")"] }, pg.key));
                            })] })] }), _jsxs("div", { className: css.railAccountList, children: [PLATFORM_GROUPS.map((group) => {
                        const groupAccounts = accounts.filter((a) => {
                            const p = (a.platform || "gzh").toLowerCase();
                            return (p === group.key ||
                                (group.key === "xiaohongshu" && p === "xhs"));
                        });
                        if (groupAccounts.length === 0) {
                            return null;
                        }
                        const isCollapsed = Boolean(collapsedGroups[group.key]);
                        return (_jsxs("div", { className: css.groupSection, children: [platformFilter === "all" && (_jsxs("div", { className: css.groupHeader, onClick: () => socialPublisherConfigStore.toggleGroupCollapse(group.key), children: [_jsxs("div", { className: "flex items-center gap-1.5 min-w-0", children: [_jsx(ChevronDown, { className: `size-3 text-muted-foreground transition-transform duration-200 ${isCollapsed ? "-rotate-90" : ""}` }), _jsx("span", { className: "truncate", children: group.name })] }), _jsx("span", { className: "font-mono text-[10px] text-muted-foreground", children: groupAccounts.length })] })), (!isCollapsed || platformFilter !== "all") && (_jsx("div", { className: "flex flex-col gap-0.5 mt-0.5", children: groupAccounts.map((acc) => {
                                        const isSelected = activeNav === `acc_${acc.id}` && selectedAccountId === acc.id;
                                        const isLoggedIn = loginStatusMap[acc.id];
                                        const isEnabled = acc.enabled !== false;
                                        return (_jsxs("div", { className: `${css.accountItem} ${isSelected ? css.accountItemActive : ""}`, onClick: () => handleSelectAccount(acc.id), title: `${acc.name || "未命名账号"} (${acc.id})`, children: [_jsx("div", { className: "shrink-0 flex items-center justify-center text-muted-foreground", children: _jsx(PlatformIcon, { platform: acc.platform }) }), _jsx("span", { className: "flex-1 truncate text-ui-xs font-medium", children: acc.name || "未命名账号" }), !isEnabled && (_jsx("span", { className: "text-[10px] text-muted-foreground bg-muted/60 px-1 py-0.5 rounded shrink-0", children: "\u505C\u7528" })), _jsx("span", { className: `${css.statusBeacon} ${isLoggedIn === true
                                                        ? css.statusBeaconOnline
                                                        : isLoggedIn === false
                                                            ? css.statusBeaconIdle
                                                            : css.statusBeaconTesting}`, title: isLoggedIn === true
                                                        ? "会话已授权"
                                                        : isLoggedIn === false
                                                            ? "未登录"
                                                            : "状态待测" })] }, acc.id));
                                    }) }))] }, group.key));
                    }), accounts.length === 0 && (_jsx("div", { className: "py-6 px-3 text-center text-ui-xs text-muted-foreground", children: "\u672A\u627E\u5230\u5339\u914D\u7684\u8D26\u53F7" }))] }), _jsxs("div", { className: css.railBottom, children: [_jsxs("div", { className: "relative", children: [_jsxs("button", { type: "button", className: "flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-border/80 bg-background hover:bg-accent text-foreground text-ui-xs font-medium transition-colors", onClick: () => setAddMenuOpen(!addMenuOpen), children: [_jsx(Plus, { className: "size-3.5" }), _jsx("span", { children: "\u6DFB\u52A0\u793E\u5A92\u53D1\u5E03\u8D26\u53F7" })] }), addMenuOpen && (_jsxs("div", { className: "absolute bottom-10 left-0 right-0 z-20 rounded-lg border border-border bg-popover p-1.5 shadow-lg flex flex-col gap-1", children: [_jsx("div", { className: "px-2 py-1 text-[11px] font-semibold text-muted-foreground", children: "\u9009\u62E9\u6DFB\u52A0\u7684\u5E73\u53F0\u7C7B\u578B\uFF1A" }), PLATFORM_GROUPS.map((p) => (_jsxs("button", { type: "button", className: "flex items-center justify-between px-2.5 py-1.5 text-ui-xs text-foreground hover:bg-accent rounded-md transition-colors text-left", onClick: () => handleAddPlatformAccount(p.key), children: [_jsx("span", { className: "font-medium", children: p.name }), _jsx("span", { className: "text-[10px] text-muted-foreground", children: p.badge })] }, p.key)))] }))] }), _jsxs("button", { type: "button", className: `${css.systemNavBtn} ${activeNav === "sys_runtime" ? css.systemNavBtnActive : ""}`, onClick: () => socialPublisherConfigStore.setActiveNav("sys_runtime"), children: [_jsx(Settings2, { className: "size-3.5 shrink-0 text-muted-foreground" }), _jsx("span", { className: "truncate", children: "\u5168\u5C40\u8FD0\u884C\u73AF\u5883\u4E0E\u751F\u56FE\u63A5\u53E3" })] }), _jsxs("button", { type: "button", className: `${css.systemNavBtn} ${activeNav === "sys_backup" ? css.systemNavBtnActive : ""}`, onClick: () => socialPublisherConfigStore.setActiveNav("sys_backup"), children: [_jsx(Database, { className: "size-3.5 shrink-0 text-muted-foreground" }), _jsx("span", { className: "truncate", children: "\u914D\u7F6E\u5907\u4EFD\u3001\u8FC1\u79FB\u4E0E\u5373\u65F6\u843D\u5730" })] })] })] }));
}
//# sourceMappingURL=SocialPublisherAccountRail.js.map