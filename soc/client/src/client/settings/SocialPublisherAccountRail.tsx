import { useState } from "react";
import {
  ChevronDown,
  Plus,
  Settings2,
  Database,
  Search,
  X,
} from "lucide-react";
import css from "./SocialPublisherSettings.module.css";
import {
  socialPublisherConfigStore,
  useSocialPublisherStore,
} from "./SocialPublisherConfigStore.js";
import { normalizeAccountsList } from "./SocialPublisherTypes.js";

const PLATFORM_GROUPS = [
  { key: "gzh", name: "微信公众号", shortName: "微信", badge: "WX" },
  { key: "xiaohongshu", name: "小红书", shortName: "红书", badge: "XHS" },
  { key: "zhihu", name: "知乎专栏", shortName: "知乎", badge: "ZH" },
  { key: "baijiahao", name: "百家号", shortName: "百家", badge: "BJH" },
  { key: "toutiao", name: "今日头条", shortName: "头条", badge: "TT" },
] as const;

function PlatformIcon({ platform }: { platform?: string }) {
  const p = (platform || "gzh").toLowerCase();
  if (p === "gzh") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M8 12h.01M12 12h.01M16 8h.01M20 8h.01M9 16c-4.418 0-8-2.686-8-6s3.582-6 8-6 8 2.686 8 6c0 1.257-.52 2.417-1.408 3.354L17 21l-3.667-2.037A9.458 9.458 0 0 1 9 16z" />
      </svg>
    );
  }
  if (p === "xiaohongshu" || p === "xhs") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
        <path d="M6 6h10M6 10h10" />
      </svg>
    );
  }
  if (p === "zhihu") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 4h16v16H4z" />
        <path d="M9 8h6l-6 8h6" />
      </svg>
    );
  }
  if (p === "baijiahao" || p === "bjh") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="7" y1="8" x2="17" y2="8" />
      <line x1="7" y1="12" x2="13" y2="12" />
      <line x1="7" y1="16" x2="11" y2="16" />
    </svg>
  );
}

export function SocialPublisherAccountRail() {
  const {
    config,
    selectedAccountId,
    activeNav,
    loginStatusMap,
    collapsedGroups,
    searchQuery,
  } = useSocialPublisherStore();

  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [platformFilter, setPlatformFilter] = useState<string>("all");

  const rawAccounts = normalizeAccountsList(config?.accounts);
  const q = searchQuery.trim().toLowerCase();
  const searchFiltered = q
    ? rawAccounts.filter(
        (a: any) =>
          (a.name || "").toLowerCase().includes(q) ||
          (a.id || "").toLowerCase().includes(q) ||
          (a.platform || "").toLowerCase().includes(q),
      )
    : rawAccounts;

  const accounts =
    platformFilter === "all"
      ? searchFiltered
      : searchFiltered.filter((a: any) => {
          const p = (a.platform || "gzh").toLowerCase();
          if (platformFilter === "xiaohongshu") {
            return p === "xiaohongshu" || p === "xhs";
          }
          return p === platformFilter;
        });

  const handleSelectAccount = (id: string) => {
    socialPublisherConfigStore.setSelectedAccountId(id);
  };

  const handleAddPlatformAccount = (platformKey: string) => {
    socialPublisherConfigStore.addAccount(platformKey);
    setAddMenuOpen(false);
  };

  return (
    <aside className={css.masterRail} data-testid="social-publisher-account-rail">
      {/* 搜索框与平台快速切换微胶囊 */}
      <div className={css.railHeader}>
        <div className="relative w-full">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <input
            type="text"
            className="h-8 w-full rounded-md border border-border/80 bg-background pl-8 pr-7 text-ui-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            placeholder="搜索账号..."
            value={searchQuery}
            onChange={(e) => socialPublisherConfigStore.setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
              onClick={() => socialPublisherConfigStore.setSearchQuery("")}
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* 顶部平台快速过滤微胶囊 (取代臃肿手风琴) */}
        <div className={css.platformFilterStrip}>
          <button
            type="button"
            className={`${css.filterChip} ${platformFilter === "all" ? css.filterChipActive : ""}`}
            onClick={() => setPlatformFilter("all")}
          >
            全部 ({rawAccounts.length})
          </button>
          {PLATFORM_GROUPS.map((pg) => {
            const count = rawAccounts.filter((a: any) => {
              const p = (a.platform || "gzh").toLowerCase();
              if (pg.key === "xiaohongshu") return p === "xiaohongshu" || p === "xhs";
              return p === pg.key;
            }).length;
            if (count === 0) return null;
            return (
              <button
                key={pg.key}
                type="button"
                className={`${css.filterChip} ${platformFilter === pg.key ? css.filterChipActive : ""}`}
                onClick={() => setPlatformFilter(pg.key)}
              >
                {pg.shortName} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* 账号高密流线列表 (独立平滑滚动) */}
      <div className={css.railAccountList}>
        {PLATFORM_GROUPS.map((group) => {
          const groupAccounts = accounts.filter((a: any) => {
            const p = (a.platform || "gzh").toLowerCase();
            return (
              p === group.key ||
              (group.key === "xiaohongshu" && p === "xhs")
            );
          });

          if (groupAccounts.length === 0) {
            return null;
          }

          const isCollapsed = Boolean(collapsedGroups[group.key]);

          return (
            <div key={group.key} className={css.groupSection}>
              {platformFilter === "all" && (
                <div
                  className={css.groupHeader}
                  onClick={() => socialPublisherConfigStore.toggleGroupCollapse(group.key)}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <ChevronDown
                      className={`size-3 text-muted-foreground transition-transform duration-200 ${
                        isCollapsed ? "-rotate-90" : ""
                      }`}
                    />
                    <span className="truncate">{group.name}</span>
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {groupAccounts.length}
                  </span>
                </div>
              )}

              {(!isCollapsed || platformFilter !== "all") && (
                <div className="flex flex-col gap-0.5 mt-0.5">
                  {groupAccounts.map((acc: any) => {
                    const isSelected =
                      activeNav === `acc_${acc.id}` && selectedAccountId === acc.id;
                    const isLoggedIn = loginStatusMap[acc.id];
                    const isEnabled = acc.enabled !== false;

                    return (
                      <div
                        key={acc.id}
                        className={`${css.accountItem} ${isSelected ? css.accountItemActive : ""}`}
                        onClick={() => handleSelectAccount(acc.id)}
                        title={`${acc.name || "未命名账号"} (${acc.id})`}
                      >
                        <div className="shrink-0 flex items-center justify-center text-muted-foreground">
                          <PlatformIcon platform={acc.platform} />
                        </div>

                        <span className="flex-1 truncate text-ui-xs font-medium">
                          {acc.name || "未命名账号"}
                        </span>

                        {!isEnabled && (
                          <span className="text-[10px] text-muted-foreground bg-muted/60 px-1 py-0.5 rounded shrink-0">
                            停用
                          </span>
                        )}

                        <span
                          className={`${css.statusBeacon} ${
                            isLoggedIn === true
                              ? css.statusBeaconOnline
                              : isLoggedIn === false
                                ? css.statusBeaconIdle
                                : css.statusBeaconTesting
                          }`}
                          title={
                            isLoggedIn === true
                              ? "会话已授权"
                              : isLoggedIn === false
                                ? "未登录"
                                : "状态待测"
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {accounts.length === 0 && (
          <div className="py-6 px-3 text-center text-ui-xs text-muted-foreground">
            未找到匹配的账号
          </div>
        )}
      </div>

      {/* 底部系统导航与添加账号 */}
      <div className={css.railBottom}>
        <div className="relative">
          <button
            type="button"
            className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-border/80 bg-background hover:bg-accent text-foreground text-ui-xs font-medium transition-colors"
            onClick={() => setAddMenuOpen(!addMenuOpen)}
          >
            <Plus className="size-3.5" />
            <span>添加社媒发布账号</span>
          </button>

          {addMenuOpen && (
            <div className="absolute bottom-10 left-0 right-0 z-20 rounded-lg border border-border bg-popover p-1.5 shadow-lg flex flex-col gap-1">
              <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                选择添加的平台类型：
              </div>
              {PLATFORM_GROUPS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className="flex items-center justify-between px-2.5 py-1.5 text-ui-xs text-foreground hover:bg-accent rounded-md transition-colors text-left"
                  onClick={() => handleAddPlatformAccount(p.key)}
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="text-[10px] text-muted-foreground">{p.badge}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          className={`${css.systemNavBtn} ${activeNav === "sys_runtime" ? css.systemNavBtnActive : ""}`}
          onClick={() => socialPublisherConfigStore.setActiveNav("sys_runtime")}
        >
          <Settings2 className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">全局运行环境与生图接口</span>
        </button>

        <button
          type="button"
          className={`${css.systemNavBtn} ${activeNav === "sys_backup" ? css.systemNavBtnActive : ""}`}
          onClick={() => socialPublisherConfigStore.setActiveNav("sys_backup")}
        >
          <Database className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">配置备份、迁移与即时落地</span>
        </button>
      </div>
    </aside>
  );
}
