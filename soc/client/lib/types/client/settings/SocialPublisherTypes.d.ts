export declare const DEFAULT_API_BASE = "http://127.0.0.1:3088";
export type TabId = "accounts" | "content" | "image_providers" | "runtime" | "backup";
export declare const TAB_ITEMS: readonly [{
    readonly label: "社媒账号";
    readonly value: TabId;
}, {
    readonly label: "内容规则";
    readonly value: TabId;
}, {
    readonly label: "运行环境";
    readonly value: TabId;
}, {
    readonly label: "配置备份";
    readonly value: TabId;
}];
export type { SocialPublishBatchRecord, SocialPublishArticleDetail, SocialPublishHistoryResponse, } from "@winkoo/social-publisher/client";
export interface WechatScheduledArticle {
    title: string;
    cover_url?: string;
    url?: string;
    article_type?: "news" | "newspic";
}
export interface WechatScheduledTask {
    id: string;
    account_id: string;
    display_time: string;
    scheduled_time: string;
    scheduled_timestamp: number;
    has_notification: boolean;
    article_type?: "news" | "newspic";
    articles: WechatScheduledArticle[];
    can_cancel: boolean;
    synced_at: string;
}
/** 微信草稿箱中的单篇图文文章 */
export interface WechatDraftItem {
    title: string;
    cover_url: string;
    digest?: string;
    author?: string;
    is_first?: boolean;
}
/** 微信草稿箱卡片（单图文、多图文大卡片或小绿书贴图） */
export interface WechatDraftCard {
    id: string;
    account_id: string;
    appmsgid: string;
    article_type: "news" | "newspic";
    update_time_str: string;
    updated_at: number;
    is_complete: boolean;
    incomplete_reason?: string;
    can_publish: boolean;
    articles: WechatDraftItem[];
    synced_at: string;
}
/** 重复草稿项详情 */
export interface DuplicateDraftItem {
    id: string;
    appmsgid: string;
    title: string;
    update_time_str: string;
    updated_at: number;
    article_count: number;
    is_complete: boolean;
    can_publish: boolean;
    cover_url?: string;
    is_recommended_keep: boolean;
    selected_for_delete: boolean;
}
/** 重复草稿分组 */
export interface DuplicateDraftGroup {
    group_key: string;
    normalized_title: string;
    items: DuplicateDraftItem[];
    redundant_count: number;
}
/** 重复扫描预检结果 */
export interface DuplicateScanResult {
    account_id: string;
    total_drafts_scanned: number;
    duplicate_groups_count: number;
    total_redundant_count: number;
    groups: DuplicateDraftGroup[];
}
export declare const THEMES: readonly [{
    readonly value: "wenying";
    readonly label: "典雅深红（酒红+金）";
}, {
    readonly value: "olive";
    readonly label: "橄榄手记";
}, {
    readonly value: "graphite";
    readonly label: "石墨极简";
}, {
    readonly value: "moyu";
    readonly label: "摸鱼绿";
}, {
    readonly value: "redwhite";
    readonly label: "红白色系";
}, {
    readonly value: "zen";
    readonly label: "留白禅意";
}];
export declare const COVER_RATIOS: readonly [{
    readonly value: "2.35:1";
    readonly label: "2.35:1 (3520×1498 · 公众号头条推荐 / 百家号)";
}, {
    readonly value: "16:9";
    readonly label: "16:9 (3024×1701 · 知乎 / 头条号推荐)";
}, {
    readonly value: "1:1";
    readonly label: "1:1 (1920×1920 · 方图 / 公众号次条)";
}, {
    readonly value: "3:4";
    readonly label: "3:4 (1080×1440 · 竖版 · 小红书 / 小绿书)";
}, {
    readonly value: "21:9";
    readonly label: "21:9 (3520×1500 · 超宽横幅)";
}];
export declare const SECONDARY_COVER_RATIOS: ({
    readonly value: "16:9";
    readonly label: "16:9 (3024×1701 · 知乎 / 头条号推荐)";
} | {
    readonly value: "1:1";
    readonly label: "1:1 (1920×1920 · 方图 / 公众号次条)";
} | {
    readonly value: "3:4";
    readonly label: "3:4 (1080×1440 · 竖版 · 小红书 / 小绿书)";
} | {
    readonly value: "21:9";
    readonly label: "21:9 (3520×1500 · 超宽横幅)";
})[];
export declare const NEWSPIC_RATIOS: readonly [{
    readonly value: "3:4";
    readonly label: "3:4 (1080×1440 · 竖版卡片 · 推荐)";
}, {
    readonly value: "1:1";
    readonly label: "1:1 (1920×1920 · 方图)";
}, {
    readonly value: "16:9";
    readonly label: "16:9 (3024×1701 · 横版)";
}];
export declare function normalizeAccountsList(raw: any): any[];
export declare function normalizeProvidersList(raw: any): any[];
export declare function getPlatformRoute(platform: string): string;
export declare function getApiBaseUrl(): string;
/**
 * 安全解析响应 Body 为 JSON，针对空响应流或非 JSON 响应进行优雅降级，
 * 绝不抛出 "Unexpected end of JSON input"。
 */
export declare function safeParseJson<T = any>(res: Response): Promise<{
    ok: boolean;
    data: T;
    error?: string;
}>;
/**
 * 完整对齐原项目 lib/client.js 的 apiFetch 通信机制，同时优先融合 0 本地端口原生 RPC 通信：
 * 1. 优先通过传入的 RPC 服务（ISocialPublisherService.handleGenericRoute）直接在本地 Host 进程内调度执行，
 *    实现真正的 0 本地服务器端口（无需运行 pnpm social:serve，无需监听 3088~3090 端口）。
 * 2. 若无 RPC 服务或环境受限，静默在后台尝试 [记忆Origin, 3088, 3089, 3090, 3080, 同源]，平滑优雅降级。
 */
export declare function publisherApiFetch(route: string, options?: RequestInit, rpcService?: {
    handleGenericRoute: (route: string, method?: string, body?: any, query?: Record<string, string>) => Promise<any>;
} | null): Promise<Response>;
export declare const DEFAULT_PUBLISHER_SECTION_CONFIG: {
    default_account: string;
    accounts: {
        id: string;
        name: string;
        platform: string;
        enabled: boolean;
        wechat: {
            brand_name: string;
        };
    }[];
    image_providers: {
        id: string;
        base_url: string;
        api_key: string;
        model: string;
        priority: number;
        enabled: boolean;
    }[];
    typography: {
        headline_theme: string;
        secondary_theme: string;
        font_size: string;
        line_height: string;
    };
    image_spec: {
        headline_cover_ratio: string;
        secondary_cover_ratio: string;
        content_images_per_article: number;
        image_count_mode: string;
        ai_images_per_article: number;
        search_images_per_article: number;
    };
    runtime: {
        project_root: string;
        python_path: string;
        chrome_path: string;
        headless: boolean;
        api_port: number;
    };
};
export declare function serializePublisherConfigPayload(config: any): any;
//# sourceMappingURL=SocialPublisherTypes.d.ts.map