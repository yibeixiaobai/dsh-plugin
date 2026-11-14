/**
 * 客户端社媒发布配置 I/O、纯前端即时预检与双模式合并引擎
 *
 * 核心设计目标：
 * 1. 零网络依赖与 0ms 实时预检：直接在前端浏览器沙箱内完成配置 JSON 语法、结构与模型校验，
 *    杜绝因后台服务未启动、端口占用、Vite SPA 路由回退 (index.html) 或 RPC 断连导致无法校验与导入。
 * 2. 完整兼容 WinCode 与 DSH 历代格式：支持全量配置、分域配置、{ meta, config } 封装结构、
 *    { ok, config } 结构、裸配置、账号/接口池以数组或字典形式声明的所有合法变体。
 * 3. 智能凭据保护与双模式合并：增量合并与全量覆盖均自动保护已有本地有效真实密钥，
 *    对脱敏配置（置空密钥）进行友好的中文黄色提示。
 */
export type ExportScope = 'all' | 'accounts' | 'image_providers' | 'visual_rules' | 'runtime';
export type MergeMode = 'merge' | 'overwrite';
export interface ClientConfigSummary {
    account_count: number;
    gzh_accounts: number;
    zhihu_accounts: number;
    xhs_accounts: number;
    baijiahao_accounts: number;
    toutiao_accounts: number;
    provider_count: number;
    has_typography: boolean;
    has_image_api: boolean;
    has_runtime: boolean;
}
export interface ClientValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    summary?: ClientConfigSummary;
    data?: any;
    error?: string;
}
export interface ExportMeta {
    version: string;
    exported_at: string;
    plugin: string;
    include_secrets: boolean;
    scope: ExportScope;
    account_count?: number;
    provider_count?: number;
}
export interface ExportedPayload {
    $schema?: string;
    meta: ExportMeta;
    config: any;
}
/**
 * 纯客户端瞬时校验与结构解析函数
 */
export declare function clientValidateImportConfig(rawInput: unknown): ClientValidationResult;
/**
 * 纯客户端配置合并算法（增量合并 / 全量覆盖，且双模式均保护本地已有真实密钥）
 */
export declare function clientMergeConfigData(currentConfig: any, incomingData: any, mode?: MergeMode): any;
/**
 * 纯客户端配置导出生成器：构建符合 WinCode / DSH 标准的导出数据
 */
export declare function clientExportConfigData(liveConfig: any, options?: {
    includeSecrets?: boolean;
    scope?: ExportScope;
    version?: string;
}): ExportedPayload;
//# sourceMappingURL=SocialPublisherConfigIO.d.ts.map