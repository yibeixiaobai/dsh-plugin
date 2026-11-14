export const DEFAULT_API_BASE = "http://127.0.0.1:3088";

export type TabId =
  | "accounts"
  | "content"
  | "image_providers"
  | "runtime"
  | "backup";

export const TAB_ITEMS = [
  { label: "社媒账号", value: "accounts" as TabId },
  { label: "内容规则", value: "content" as TabId },
  { label: "运行环境", value: "runtime" as TabId },
  { label: "配置备份", value: "backup" as TabId },
] as const;

export type {
  SocialPublishBatchRecord,
  SocialPublishArticleDetail,
  SocialPublishHistoryResponse,
} from "@winkoo/social-publisher/client";

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

export const THEMES = [
  { value: "wenying", label: "典雅深红（酒红+金）" },
  { value: "olive", label: "橄榄手记" },
  { value: "graphite", label: "石墨极简" },
  { value: "moyu", label: "摸鱼绿" },
  { value: "redwhite", label: "红白色系" },
  { value: "zen", label: "留白禅意" },
] as const;

export const COVER_RATIOS = [
  { value: "2.35:1", label: "2.35:1 (3520×1498 · 公众号头条推荐 / 百家号)" },
  { value: "16:9", label: "16:9 (3024×1701 · 知乎 / 头条号推荐)" },
  { value: "1:1", label: "1:1 (1920×1920 · 方图 / 公众号次条)" },
  { value: "3:4", label: "3:4 (1080×1440 · 竖版 · 小红书 / 小绿书)" },
  { value: "21:9", label: "21:9 (3520×1500 · 超宽横幅)" },
] as const;

export const SECONDARY_COVER_RATIOS = COVER_RATIOS.filter((r) => r.value !== "2.35:1");

export const NEWSPIC_RATIOS = [
  { value: "3:4", label: "3:4 (1080×1440 · 竖版卡片 · 推荐)" },
  { value: "1:1", label: "1:1 (1920×1920 · 方图)" },
  { value: "16:9", label: "16:9 (3024×1701 · 横版)" },
] as const;

export function normalizeAccountsList(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "object") {
    return Object.entries(raw).map(([id, val]: [string, any]) => ({
      id,
      ...(typeof val === "object" ? val : {}),
    }));
  }
  return [];
}

export function normalizeProvidersList(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "object") {
    return Object.entries(raw).map(([id, val]: [string, any]) => ({
      id,
      ...(typeof val === "object" ? val : {}),
    }));
  }
  return [];
}

export function getPlatformRoute(platform: string): string {
  const p = (platform || "gzh").toLowerCase();
  if (p === "gzh" || p === "wechat") return "wechat-login";
  if (p === "zhihu") return "zhihu-login";
  if (p === "xhs" || p === "xiaohongshu") return "xhs-login";
  if (p === "baijiahao") return "baijiahao-login";
  if (p === "toutiao") return "toutiao-login";
  return `${p}-login`;
}

// 缓存已成功探测连通的 API Origin，优先从 sessionStorage 读取历史记忆
let detectedApiOrigin: string = "";
if (typeof sessionStorage !== "undefined") {
  try {
    detectedApiOrigin = sessionStorage.getItem("dsh_publisher_api_origin") || "";
  } catch {}
}

export function getApiBaseUrl(): string {
  if (detectedApiOrigin) return detectedApiOrigin;
  if (
    typeof window !== "undefined" &&
    (window.location.protocol === "http:" || window.location.protocol === "https:")
  ) {
    return window.location.origin;
  }
  return DEFAULT_API_BASE;
}

/**
 * 安全解析响应 Body 为 JSON，针对空响应流或非 JSON 响应进行优雅降级，
 * 绝不抛出 "Unexpected end of JSON input"。
 */
export async function safeParseJson<T = any>(
  res: Response,
): Promise<{ ok: boolean; data: T; error?: string }> {
  try {
    const text = await res.text();
    if (!text || !text.trim()) {
      return {
        ok: res.ok,
        data: {} as T,
        error: !res.ok ? `服务返回空状态码 HTTP ${res.status}` : undefined,
      };
    }
    const trimmed = text.trim();
    if (trimmed.startsWith("<!") || trimmed.startsWith("<html") || trimmed.includes("<head>")) {
      return {
        ok: false,
        data: {} as T,
        error: "服务返回了 HTML 网页内容而非 JSON 数据 (可能命中了前端 Vite SPA 路由回退)",
      };
    }
    const data = JSON.parse(text);
    return {
      ok: res.ok && !data.error,
      data,
      error:
        data.error || (!res.ok ? `HTTP ${res.status} ${res.statusText || ""}`.trim() : undefined),
    };
  } catch (err: any) {
    return {
      ok: false,
      data: {} as T,
      error: !res.ok ? `服务响应异常 (HTTP ${res.status})` : `无法解析服务响应: ${err.message}`,
    };
  }
}

/**
 * 完整对齐原项目 lib/client.js 的 apiFetch 通信机制，同时优先融合 0 本地端口原生 RPC 通信：
 * 1. 优先通过传入的 RPC 服务（ISocialPublisherService.handleGenericRoute）直接在本地 Host 进程内调度执行，
 *    实现真正的 0 本地服务器端口（无需运行 pnpm social:serve，无需监听 3088~3090 端口）。
 * 2. 若无 RPC 服务或环境受限，静默在后台尝试 [记忆Origin, 3088, 3089, 3090, 3080, 同源]，平滑优雅降级。
 */
export async function publisherApiFetch(
  route: string,
  options: RequestInit = {},
  rpcService?: {
    handleGenericRoute: (
      route: string,
      method?: string,
      body?: any,
      query?: Record<string, string>,
    ) => Promise<any>;
  } | null,
): Promise<Response> {
  const pathSuffix = route.startsWith("/") ? route : "/" + route;

  // 1. 优先采用 0 本地端口原生 RPC 直连（若已注入服务）
  if (rpcService && typeof rpcService.handleGenericRoute === "function") {
    try {
      const urlObj = new URL(pathSuffix, "http://127.0.0.1:3088");
      const queryParams: Record<string, string> = {};
      urlObj.searchParams.forEach((v, k) => {
        queryParams[k] = v;
      });

      let parsedBody: any = undefined;
      if (options.body) {
        if (typeof options.body === "string") {
          try {
            parsedBody = JSON.parse(options.body);
          } catch {
            parsedBody = options.body;
          }
        } else {
          parsedBody = options.body;
        }
      }

      const rpcResult = await rpcService.handleGenericRoute(
        urlObj.pathname,
        options.method || "GET",
        parsedBody,
        queryParams,
      );

      if (rpcResult && typeof rpcResult.status === "number") {
        return new Response(JSON.stringify(rpcResult.data), {
          status: rpcResult.status,
          headers: {
            "Content-Type": "application/json",
            ...rpcResult.headers,
          },
        });
      }
    } catch (rpcErr) {
      console.warn("[SocialPublisher] RPC 通道调用异常，尝试网络端口降级:", rpcErr);
    }
  }

  // 2. 网络端口轮询与降级 (兼容外部手动运行的 standalone-server 或 Web 场景)
  const fetchOpts: RequestInit = {
    credentials: "include",
    ...options,
    headers: {
      ...options.headers,
    },
  };
  const candidates: string[] = [];

  if (detectedApiOrigin) {
    candidates.push(detectedApiOrigin + pathSuffix);
  }
  candidates.push("http://127.0.0.1:3088" + pathSuffix);
  candidates.push("http://127.0.0.1:3089" + pathSuffix);
  candidates.push("http://127.0.0.1:3090" + pathSuffix);
  candidates.push("http://127.0.0.1:3080" + pathSuffix);
  candidates.push("http://localhost:3088" + pathSuffix);
  candidates.push("http://localhost:3080" + pathSuffix);

  if (
    typeof window !== "undefined" &&
    (window.location.protocol === "http:" || window.location.protocol === "https:")
  ) {
    if (window.location.origin) {
      candidates.push(window.location.origin + pathSuffix);
    }
    candidates.push(route);
  }

  const uniqueUrls = Array.from(new Set(candidates));
  let lastErr: any = null;
  let lastFailureRes: Response | null = null;

  for (const targetUrl of uniqueUrls) {
    try {
      const res = await fetch(targetUrl, fetchOpts);
      if (res.ok) {
        const contentType = (res.headers.get("content-type") || "").toLowerCase();

        // 核心防御：若返回内容为 text/html（如前端 Vite/Web SPA 路由回退 index.html），绝非后端 API 响应，坚决跳过继续探测
        if (contentType.includes("text/html") || contentType.includes("html")) {
          // 若先前记忆的 detectedApiOrigin 此时返回 HTML，立即从记忆中剔除
          if (detectedApiOrigin && targetUrl.startsWith(detectedApiOrigin)) {
            detectedApiOrigin = "";
            try {
              sessionStorage.removeItem("dsh_publisher_api_origin");
            } catch {}
          }
          continue;
        }

        if (
          contentType.includes("json") ||
          contentType.includes("octet-stream") ||
          contentType.includes("image")
        ) {
          try {
            const origin = new URL(targetUrl, window?.location?.href || "http://127.0.0.1:3088")
              .origin;
            detectedApiOrigin = origin;
            if (typeof sessionStorage !== "undefined") {
              sessionStorage.setItem("dsh_publisher_api_origin", origin);
            }
          } catch {}
          return res;
        }

        return res;
      }

      if (res.status === 404 || res.status === 401 || res.status === 405) {
        if (
          !targetUrl.startsWith("/") &&
          (!window?.location?.port || !targetUrl.includes(`:${window.location.port}/`))
        ) {
          lastFailureRes = res;
        }
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
    }
  }

  if (lastFailureRes) return lastFailureRes;
  if (lastErr) {
    throw new Error("社媒发布服务未就绪 (RPC 与端口 3088~3090 均未响应)");
  }
  throw new Error("社媒助手接口调用失败：无可用通信通道");
}

export const DEFAULT_PUBLISHER_SECTION_CONFIG = {
  default_account: "default",
  accounts: [{ id: "default", name: "默认公众号", platform: "gzh", enabled: true, wechat: { brand_name: "前沿科技视界" } }],
  image_providers: [{ id: "default_provider", base_url: "https://api.openai.com/v1", api_key: "", model: "dall-e-3", priority: 1, enabled: true }],
  typography: { headline_theme: "graphite", secondary_theme: "rotate", font_size: "13px", line_height: "20px" },
  image_spec: { headline_cover_ratio: "2.35:1", secondary_cover_ratio: "1:1", content_images_per_article: 2, image_count_mode: "auto", ai_images_per_article: 1, search_images_per_article: 1 },
  runtime: { project_root: "", python_path: "python", chrome_path: "", headless: true, api_port: 3088 },
};

export function serializePublisherConfigPayload(config: any) {
  // [中文修复依据]：彻底取消全局品牌图配置逻辑，显式从 payload 顶层剥离 brand_images，
  // 杜绝全局 brand_images 随保存落盘并在多账号之间产生广播覆盖
  const { brand_images: _deprecatedGlobalBrand, ...cleanConfig } = config || {};
  const accountsDict: Record<string, any> = {};
  for (const acc of normalizeAccountsList(cleanConfig?.accounts)) {
    const { id, ...rest } = acc;
    accountsDict[id || "default"] = rest;
  }
  const providersDict: Record<string, any> = {};
  for (const prov of normalizeProvidersList(cleanConfig?.image_providers)) {
    const { id, ...rest } = prov;
    providersDict[id || "default_provider"] = rest;
  }
  return { ...cleanConfig, accounts: accountsDict, image_providers: providersDict };
}
