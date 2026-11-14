/**
 * 社媒发布模块全局单例响应式配置中心 (SocialPublisherConfigStore)
 * 【核心设计】：
 * 1. 彻底对齐 WinCode 的生命周期持久化规范，脱离 React 组件挂载周期，在模块单例闭包中维持活跃状态。
 * 2. L1 内存即时响应 (0ms) + L2 LocalStorage 同步快照 (抗刷抗切页) + 800ms 防抖静默落盘至后端磁盘。
 * 3. 对外暴露 flushPendingSave()，在任何切页、关闭弹窗、路由变化或账号切换时瞬间落盘，彻底解决切页配置丢失痛点。
 */
export interface SocialPublisherStoreState {
    config: any;
    selectedAccountId: string;
    activeNav: string;
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
declare class SocialPublisherConfigStoreManager {
    private state;
    private listeners;
    private saveTimer;
    private rpcService;
    private initialized;
    constructor();
    getState(): SocialPublisherStoreState;
    subscribe(listener: () => void): () => void;
    private emitChange;
    private setState;
    setRpcService(rpc: any): void;
    /**
     * 初始化配置：首次挂载或重新激活时拉取最新后端配置并无缝合并
     */
    init(rpc?: any): Promise<void>;
    fetchFromBackend(): Promise<void>;
    private syncToLocalStorage;
    /**
     * 更新完整配置，并安排防抖落盘
     */
    updateConfig(updater: (prevConfig: any) => any, immediate?: boolean): void;
    /**
     * 立即将未提交的变动写入后端磁盘 (flush)
     */
    flushPendingSave(): void;
    executeSave(): Promise<boolean>;
    /**
     * 针对当前指定账号执行局部深拷贝更新
     */
    updateAccount(accountId: string, patch: any): void;
    addAccount(platform?: string): void;
    duplicateAccount(sourceId: string): void;
    deleteAccount(accountId: string): void;
    setSelectedAccountId(id: string): void;
    setActiveNav(nav: string): void;
    setSearchQuery(q: string): void;
    toggleGroupCollapse(groupKey: string): void;
    setLoginStatus(accountId: string, status: boolean | null): void;
    checkLoginStatus(platform: string, accountId: string): Promise<void>;
    triggerLogin(platform: string, accountId: string): Promise<{
        ok: boolean;
        message: string;
    }>;
}
export declare const socialPublisherConfigStore: SocialPublisherConfigStoreManager;
/**
 * React Hook：订阅并响应社媒全局配置状态 (返回不可变稳定快照，杜绝无限重新渲染循环)
 */
export declare function useSocialPublisherStore(): SocialPublisherStoreState;
export {};
//# sourceMappingURL=SocialPublisherConfigStore.d.ts.map