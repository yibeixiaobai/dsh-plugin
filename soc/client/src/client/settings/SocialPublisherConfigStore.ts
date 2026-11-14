/**
 * 社媒发布模块全局单例响应式配置中心 (SocialPublisherConfigStore)
 * 【核心设计】：
 * 1. 彻底对齐 WinCode 的生命周期持久化规范，脱离 React 组件挂载周期，在模块单例闭包中维持活跃状态。
 * 2. L1 内存即时响应 (0ms) + L2 LocalStorage 同步快照 (抗刷抗切页) + 800ms 防抖静默落盘至后端磁盘。
 * 3. 对外暴露 flushPendingSave()，在任何切页、关闭弹窗、路由变化或账号切换时瞬间落盘，彻底解决切页配置丢失痛点。
 */

import { useSyncExternalStore, useCallback } from "react";
import {
  DEFAULT_PUBLISHER_SECTION_CONFIG,
  normalizeAccountsList,
  normalizeProvidersList,
  publisherApiFetch,
  safeParseJson,
  serializePublisherConfigPayload,
  getPlatformRoute,
} from "./SocialPublisherTypes.js";
import { mergeAccountBrandImages } from "./SocialPublisherBrandHelpers.js";

const LOCAL_STORAGE_KEY = "wincast.social_publisher.config.v1";
const DEBOUNCE_SAVE_MS = 800;
let accountUniqueCounter = 0;

export interface SocialPublisherStoreState {
  config: any;
  selectedAccountId: string;
  activeNav: string; // 'acc_<id>' | 'sys_runtime' | 'sys_backup'
  saveStatus: "idle" | "saving" | "saved" | "error";
  saveError: string | null;
  lastSavedAt: number | null;
  loading: boolean;
  loginStatusMap: Record<string, boolean | null>;
  checkingLogin: string | null;
  loginingAccountId: string | null;
  collapsedGroups: Record<string, boolean>;
  searchQuery: string;
}

class SocialPublisherConfigStoreManager {
  private state: SocialPublisherStoreState;
  private listeners = new Set<() => void>();
  private saveTimer: any = null;
  private rpcService: any = null;
  private initialized = false;

  constructor() {
    let initialConfig: any = DEFAULT_PUBLISHER_SECTION_CONFIG;
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const cached = window.localStorage.getItem(LOCAL_STORAGE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && typeof parsed === "object") {
            initialConfig = parsed;
          }
        }
      } catch {
        // 忽略解析失败，使用默认配置
      }
    }

    const accounts = normalizeAccountsList(initialConfig.accounts);
    const validAccounts =
      accounts.length > 0 ? accounts : normalizeAccountsList(DEFAULT_PUBLISHER_SECTION_CONFIG.accounts);
    const firstAccId = validAccounts[0]?.id || "default";

    initialConfig = {
      ...DEFAULT_PUBLISHER_SECTION_CONFIG,
      ...initialConfig,
      accounts: validAccounts,
      image_providers: normalizeProvidersList(
        initialConfig.image_providers || DEFAULT_PUBLISHER_SECTION_CONFIG.image_providers,
      ),
    };

    this.state = {
      config: initialConfig,
      selectedAccountId: initialConfig.default_account || firstAccId,
      activeNav: `acc_${initialConfig.default_account || firstAccId}`,
      saveStatus: "idle",
      saveError: null,
      lastSavedAt: null,
      loading: false,
      loginStatusMap: {},
      checkingLogin: null,
      loginingAccountId: null,
      collapsedGroups: {},
      searchQuery: "",
    };

    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", () => {
        this.flushPendingSave();
      });
      window.addEventListener("wincode:social-account-login-synced", (e: any) => {
        const { accountId, userName } = e.detail || {};
        if (accountId) {
          this.setLoginStatus(accountId, true);
          if (userName) {
            this.updateAccount(accountId, { name: userName });
          }
        }
      });
    }
  }

  public getState(): SocialPublisherStoreState {
    return this.state;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitChange() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error("[SocialPublisherConfigStore] listener error:", err);
      }
    }
  }

  private setState(patch: Partial<SocialPublisherStoreState>) {
    this.state = { ...this.state, ...patch };
    this.emitChange();
  }

  public setRpcService(rpc: any) {
    this.rpcService = rpc;
  }

  /**
   * 初始化配置：首次挂载或重新激活时拉取最新后端配置并无缝合并
   */
  public async init(rpc?: any) {
    if (rpc) {
      this.rpcService = rpc;
    }
    if (this.initialized) return;
    this.initialized = true;
    await this.fetchFromBackend();
  }

  public async fetchFromBackend() {
    this.setState({ loading: true });
    try {
      const res = await publisherApiFetch(
        "/api/gzh-publisher/config/export?include_secrets=true&download=false",
        {},
        this.rpcService,
      );
      const parsed = await safeParseJson(res);
      if (parsed.ok) {
        const loadedCfg = parsed.data.config || parsed.data;
        if (loadedCfg && typeof loadedCfg === "object") {
          const { brand_images: _deprecated, ...cleanLoaded } = loadedCfg;
          const accountsList = normalizeAccountsList(cleanLoaded.accounts);
          const providersList = normalizeProvidersList(cleanLoaded.image_providers);
          const nextConfig = {
            ...cleanLoaded,
            accounts: accountsList,
            image_providers: providersList,
          };

          // 保持当前选中的账号 ID，避免回弹
          const currentSelected = this.state.selectedAccountId;
          const validSelected =
            currentSelected && accountsList.some((a: any) => a.id === currentSelected)
              ? currentSelected
              : accountsList[0]?.id || "default";

          this.setState({
            config: nextConfig,
            selectedAccountId: validSelected,
            activeNav: this.state.activeNav.startsWith("acc_")
              ? `acc_${validSelected}`
              : this.state.activeNav,
            saveStatus: "saved",
            loading: false,
          });

          this.syncToLocalStorage(nextConfig);

          // 批量触发账号有效性探测
          for (const acc of accountsList) {
            if (acc.enabled !== false && acc.platform && acc.id) {
              this.checkLoginStatus(acc.platform, acc.id);
            }
          }
          return;
        }
      }
    } catch (err) {
      console.warn("[SocialPublisherConfigStore] 初始拉取配置未成功，采用本地快照:", err);
    } finally {
      this.setState({ loading: false });
    }
  }

  private syncToLocalStorage(cfg: any) {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cfg));
      } catch {
        // LocalStorage 配额满或受限时静默跳过
      }
    }
  }

  /**
   * 更新完整配置，并安排防抖落盘
   */
  public updateConfig(updater: (prevConfig: any) => any, immediate = false) {
    const nextConfig = updater(this.state.config);
    this.syncToLocalStorage(nextConfig);

    this.setState({
      config: nextConfig,
      saveStatus: "saving",
      saveError: null,
    });

    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    if (immediate) {
      this.executeSave();
    } else {
      this.saveTimer = setTimeout(() => {
        this.executeSave();
      }, DEBOUNCE_SAVE_MS);
    }
  }

  /**
   * 立即将未提交的变动写入后端磁盘 (flush)
   */
  public flushPendingSave() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
      this.executeSave();
    }
  }

  public async executeSave(): Promise<boolean> {
    try {
      this.setState({ saveStatus: "saving" });
      const payload = serializePublisherConfigPayload(this.state.config);
      const res = await publisherApiFetch(
        "/api/gzh-publisher/config/save",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
        this.rpcService,
      );
      const parsed = await safeParseJson(res);
      if (parsed.ok) {
        this.setState({
          saveStatus: "saved",
          saveError: null,
          lastSavedAt: Date.now(),
        });
        return true;
      } else {
        const errorText = parsed.error || parsed.data?.error || "服务无响应";
        this.setState({
          saveStatus: "error",
          saveError: `保存失败: ${errorText}`,
        });
        return false;
      }
    } catch (e: any) {
      this.setState({
        saveStatus: "error",
        saveError: `网络错误: ${e.message || "无法连接到本地服务"}`,
      });
      return false;
    }
  }

  /**
   * 针对当前指定账号执行局部深拷贝更新
   */
  public updateAccount(accountId: string, patch: any) {
    this.updateConfig((prev) => {
      const accounts = normalizeAccountsList(prev.accounts);
      return {
        ...prev,
        accounts: accounts.map((a: any) => {
          if (a.id !== accountId) return a;
          const cloned = JSON.parse(JSON.stringify(a));
          return {
            ...cloned,
            ...patch,
            brand_images: mergeAccountBrandImages(cloned.brand_images, patch.brand_images),
          };
        }),
      };
    });
  }

  public addAccount(platform = "gzh") {
    const accounts = normalizeAccountsList(this.state.config.accounts);
    const count = accounts.filter((a: any) => a.platform === platform).length + 1;
    const platformNames: Record<string, string> = {
      gzh: "微信公众号",
      xiaohongshu: "小红书",
      zhihu: "知乎专栏",
      baijiahao: "百家号",
      toutiao: "今日头条",
    };
    const baseName = platformNames[platform] || "新社媒账号";
    const uniqueSuffix = (++accountUniqueCounter).toString(36);
    const newId = `${platform}_${Date.now().toString(36)}_${uniqueSuffix}`;
    const newAccount: any = {
      id: newId,
      name: `${baseName} ${count}`,
      platform,
      enabled: true,
      publish_mode: "browser",
      auto_enable_original: true,
      wechat: { brand_name: "文映学术通", author_name: "文映学术" },
      content: {
        headline_theme: "wenying",
        font_size: "13px",
        line_height: "20px",
        image_count_mode: "auto",
      },
    };

    this.updateConfig((prev) => ({
      ...prev,
      accounts: [...normalizeAccountsList(prev.accounts), newAccount],
    }));

    this.setSelectedAccountId(newId);
  }

  public duplicateAccount(sourceId: string) {
    const accounts = normalizeAccountsList(this.state.config.accounts);
    const source = accounts.find((a: any) => a.id === sourceId);
    if (!source) return;

    const cloned = JSON.parse(JSON.stringify(source));
    const uniqueSuffix = (++accountUniqueCounter).toString(36);
    const newId = `${cloned.platform || "acc"}_${Date.now().toString(36)}_${uniqueSuffix}`;
    cloned.id = newId;
    cloned.name = `${cloned.name || "未命名账号"} (副本)`;

    this.updateConfig((prev) => ({
      ...prev,
      accounts: [...normalizeAccountsList(prev.accounts), cloned],
    }));

    this.setSelectedAccountId(newId);
  }

  public deleteAccount(accountId: string) {
    const accounts = normalizeAccountsList(this.state.config.accounts);
    if (accounts.length <= 1) {
      alert("请至少保留一个社媒账号配置！");
      return;
    }
    const remaining = accounts.filter((a: any) => a.id !== accountId);
    this.updateConfig((prev) => ({
      ...prev,
      accounts: remaining,
    }));

    if (this.state.selectedAccountId === accountId) {
      const nextId = remaining[0]?.id || "default";
      this.setSelectedAccountId(nextId);
    }
  }

  public setSelectedAccountId(id: string) {
    this.flushPendingSave();
    this.setState({
      selectedAccountId: id,
      activeNav: `acc_${id}`,
    });
  }

  public setActiveNav(nav: string) {
    this.flushPendingSave();
    this.setState({ activeNav: nav });
  }

  public setSearchQuery(q: string) {
    this.setState({ searchQuery: q });
  }

  public toggleGroupCollapse(groupKey: string) {
    this.setState({
      collapsedGroups: {
        ...this.state.collapsedGroups,
        [groupKey]: !this.state.collapsedGroups[groupKey],
      },
    });
  }

  public setLoginStatus(accountId: string, status: boolean | null) {
    this.setState({
      loginStatusMap: {
        ...this.state.loginStatusMap,
        [accountId]: status,
      },
    });
  }

  public async checkLoginStatus(platform: string, accountId: string) {
    if (!accountId) return;
    this.setState({ checkingLogin: accountId });
    try {
      const route = getPlatformRoute(platform);
      const res = await publisherApiFetch(
        `/api/gzh-publisher/${route}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account_id: accountId, action: "check" }),
        },
        this.rpcService,
      );
      const parsed = await safeParseJson(res);
      const isLoggedIn = parsed.ok ? Boolean(parsed.data?.logged_in) : false;
      this.setLoginStatus(accountId, isLoggedIn);

      if (isLoggedIn && parsed.data?.user_name) {
        this.updateAccount(accountId, { name: parsed.data.user_name });
      }
    } catch {
      this.setLoginStatus(accountId, false);
    } finally {
      this.setState({ checkingLogin: null });
    }
  }

  public async triggerLogin(platform: string, accountId: string): Promise<{ ok: boolean; message: string }> {
    this.setState({ loginingAccountId: accountId });
    try {
      const route = getPlatformRoute(platform);
      const res = await publisherApiFetch(
        `/api/gzh-publisher/${route}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account_id: accountId, action: "login" }),
        },
        this.rpcService,
      );
      const parsed = await safeParseJson(res);
      if (parsed.ok && parsed.data?.ok) {
        this.setLoginStatus(accountId, true);
        await this.fetchFromBackend();
        return { ok: true, message: `账号 ${accountId} 登录成功！凭据已持久化。` };
      } else {
        return {
          ok: false,
          message: parsed.error || parsed.data?.error || "登录流程未完成或窗口已关闭",
        };
      }
    } catch (e: any) {
      const msg = e.message || String(e);
      const tip =
        msg.includes("未运行") || msg.includes("未响应") || msg.includes("Failed to fetch")
          ? "社媒发布后台未启动（端口 3088~3090 未响应）。请确认本地服务正常运行。"
          : `唤起登录失败: ${msg}`;
      return { ok: false, message: tip };
    } finally {
      this.setState({ loginingAccountId: null });
    }
  }
}

export const socialPublisherConfigStore = new SocialPublisherConfigStoreManager();

const getStoreSnapshot = () => socialPublisherConfigStore.getState();

/**
 * React Hook：订阅并响应社媒全局配置状态 (返回不可变稳定快照，杜绝无限重新渲染循环)
 */
export function useSocialPublisherStore(): SocialPublisherStoreState {
  return useSyncExternalStore(
    (callback) => socialPublisherConfigStore.subscribe(callback),
    getStoreSnapshot,
    getStoreSnapshot,
  );
}

