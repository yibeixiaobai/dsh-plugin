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

import {
  normalizeAccountsList,
  normalizeProvidersList,
  serializePublisherConfigPayload,
} from './SocialPublisherTypes.js';

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

const ACCOUNT_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;
const PROVIDER_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

function clone<T>(val: T): T {
  if (val === undefined || val === null) return val;
  return JSON.parse(JSON.stringify(val));
}

/**
 * 纯客户端瞬时校验与结构解析函数
 */
export function clientValidateImportConfig(rawInput: unknown): ClientValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let rawObj: unknown = rawInput;

  // 1. 若为字符串输入
  if (typeof rawInput === 'string') {
    const trimmed = rawInput.trim();
    if (!trimmed) {
      return {
        valid: false,
        errors: ['导入内容不能为空，请粘贴配置 JSON 或选择配置文件'],
        warnings: [],
      };
    }

    // 针对用户误导入 HTML 网页文档（如 Vite 404 或首页回退）的明确拦截
    if (trimmed.startsWith('<!') || trimmed.startsWith('<html') || trimmed.includes('<head>') || trimmed.includes('<!DOCTYPE')) {
      return {
        valid: false,
        errors: [
          '检测到导入的内容为 HTML 网页文档，而非 JSON 格式的配置文件。',
          '可能原因：先前在旧版本中通过浏览器下载时，本地服务未就绪导致下载了 Web 服务器的首页或 404 错误页。',
          '解决办法：请在上方点击「下载配置文件」重新导出，或直接「复制 JSON」后在此处粘贴。',
        ],
        warnings: [],
      };
    }

    try {
      rawObj = JSON.parse(trimmed);
    } catch (parseErr: any) {
      return {
        valid: false,
        errors: [`JSON 语法解析失败: ${parseErr.message || '内容不是合法的 JSON 格式'}`],
        warnings: [],
      };
    }
  }

  // 2. 基础对象检查
  if (!rawObj || typeof rawObj !== 'object' || Array.isArray(rawObj)) {
    return {
      valid: false,
      errors: ['配置内容必须是一个 JSON 对象（顶层需为大括号 {}）'],
      warnings: [],
    };
  }

  // 3. 兼容结构解包：支持 { meta, config } 或 { ok, config } 或裸配置
  const incoming = rawObj as Record<string, any>;
  let candidateConfig: Record<string, any> = incoming;
  if ('config' in incoming && incoming.config && typeof incoming.config === 'object' && !Array.isArray(incoming.config)) {
    candidateConfig = incoming.config;
  }

  const resultData: Record<string, any> = {};

  // 4. 账号配置 (accounts) 校验与规格化
  if ('accounts' in candidateConfig) {
    let rawAccounts = candidateConfig.accounts;
    // 兼容数组形式声明的 accounts
    if (Array.isArray(rawAccounts)) {
      const dict: Record<string, any> = {};
      for (const item of rawAccounts) {
        if (item && typeof item === 'object') {
          const id = String(item.id || item.account_id || `acc_${Object.keys(dict).length + 1}`).trim();
          dict[id] = item;
        }
      }
      rawAccounts = dict;
    }

    if (typeof rawAccounts !== 'object' || rawAccounts === null) {
      errors.push('accounts 字段必须是一个对象字典或账号数组');
    } else {
      const validAccounts: Record<string, any> = {};
      let hasBlankSecrets = false;

      for (const [id, acc] of Object.entries(rawAccounts)) {
        if (!ACCOUNT_ID_REGEX.test(id)) {
          errors.push(`账号 ID「${id}」格式不符合规范（仅允许数字、字母、下划线与短横线，长度 1-64）`);
          continue;
        }
        if (!acc || typeof acc !== 'object' || Array.isArray(acc)) {
          errors.push(`账号「${id}」的数据不完整`);
          continue;
        }
        const accObj = acc as Record<string, any>;
        const platform = String(accObj.platform || 'gzh').toLowerCase();
        const normalizedPlatform =
          platform === 'xiaohongshu' || platform === 'xhs'
            ? 'xiaohongshu'
            : platform === 'wechat' || platform === 'gzh'
              ? 'gzh'
              : platform === 'zhihu'
                ? 'zhihu'
                : platform === 'baijiahao'
                  ? 'baijiahao'
                  : platform === 'toutiao'
                    ? 'toutiao'
                    : 'gzh';

        const appSecret = String(accObj.app_secret ?? '').trim();
        if (!appSecret) hasBlankSecrets = true;

        validAccounts[id] = {
          ...accObj,
          id,
          platform: normalizedPlatform,
          name: String(accObj.name || id).trim(),
          enabled: accObj.enabled !== false,
          publish_mode: accObj.publish_mode || 'api',
          appid: String(accObj.appid ?? '').trim(),
          app_secret: appSecret,
          author_name: String(accObj.author_name ?? '科技前沿观察').trim(),
          brand_name: String(accObj.brand_name ?? '前沿科技视界').trim(),
          publish_immediately: Boolean(accObj.publish_immediately),
        };
      }
      resultData.accounts = validAccounts;
      if (hasBlankSecrets) {
        warnings.push('部分社媒账号未包含 AppSecret 密钥（可能来自安全脱敏导出），导入时将自动保留您当前本地已有的真实有效凭据。');
      }
    }
  }

  // 5. 校验默认账号
  if ('default_account' in candidateConfig && typeof candidateConfig.default_account === 'string') {
    resultData.default_account = candidateConfig.default_account.trim();
  }

  // 6. 校验生图接口池 (image_providers)
  if ('image_providers' in candidateConfig) {
    let rawProviders = candidateConfig.image_providers;
    if (Array.isArray(rawProviders)) {
      const dict: Record<string, any> = {};
      for (const item of rawProviders) {
        if (item && typeof item === 'object') {
          const id = String(item.id || item.name || `provider_${Object.keys(dict).length + 1}`).trim();
          dict[id] = item;
        }
      }
      rawProviders = dict;
    }

    if (typeof rawProviders !== 'object' || rawProviders === null) {
      errors.push('image_providers 字段必须是一个对象字典或接口数组');
    } else {
      const validProviders: Record<string, any> = {};
      let hasBlankApiKey = false;

      for (const [id, prov] of Object.entries(rawProviders)) {
        if (!PROVIDER_ID_REGEX.test(id)) {
          errors.push(`生图接口 ID「${id}」格式不符合规范`);
          continue;
        }
        if (!prov || typeof prov !== 'object' || Array.isArray(prov)) {
          errors.push(`生图接口「${id}」的配置数据不完整`);
          continue;
        }
        const provObj = prov as Record<string, any>;
        const apiKey = String(provObj.api_key ?? '').trim();
        if (!apiKey) hasBlankApiKey = true;

        validProviders[id] = {
          ...provObj,
          id,
          name: String(provObj.name || id).trim(),
          enabled: provObj.enabled !== false,
          base_url: String(provObj.base_url || 'https://api.a6api.com').trim(),
          api_key: apiKey,
          model: String(provObj.model || 'gpt-image-2').trim(),
          priority: typeof provObj.priority === 'number' ? provObj.priority : 0,
        };
      }
      resultData.image_providers = validProviders;
      if (hasBlankApiKey) {
        warnings.push('部分生图接口未包含 API Key（可能来自安全脱敏导出），导入时将自动保留您当前本地已有的真实接口密钥。');
      }
    }
  }

  // 7. 校验排版规则 (typography)
  if ('typography' in candidateConfig && candidateConfig.typography && typeof candidateConfig.typography === 'object') {
    resultData.typography = clone(candidateConfig.typography);
  }

  // 8. 校验 AI 配图规则 (image_api / image_spec)
  if ('image_api' in candidateConfig && candidateConfig.image_api && typeof candidateConfig.image_api === 'object') {
    resultData.image_api = clone(candidateConfig.image_api);
  }
  if ('image_spec' in candidateConfig && candidateConfig.image_spec && typeof candidateConfig.image_spec === 'object') {
    resultData.image_spec = clone(candidateConfig.image_spec);
  }

  // 9. 校验运行环境设置 (runtime)
  if ('runtime' in candidateConfig && candidateConfig.runtime && typeof candidateConfig.runtime === 'object') {
    resultData.runtime = clone(candidateConfig.runtime);
  }

  // 10. 兼容兼容旧版顶层字段
  if ('wechat' in candidateConfig && candidateConfig.wechat && typeof candidateConfig.wechat === 'object') {
    resultData.wechat = clone(candidateConfig.wechat);
  }
  if ('content' in candidateConfig && candidateConfig.content && typeof candidateConfig.content === 'object') {
    resultData.content = clone(candidateConfig.content);
  }

  // 11. 检查是否存在任何有效字段
  const hasAnyField = Object.keys(resultData).length > 0;
  if (!hasAnyField && errors.length === 0) {
    errors.push('未在导入数据中发现有效的社媒发布配置项（如 accounts、image_providers、runtime、typography 等）');
  }

  // 统计概览指标
  const accountKeys = Object.keys(resultData.accounts ?? {});
  const providerKeys = Object.keys(resultData.image_providers ?? {});

  let gzhCount = 0;
  let zhihuCount = 0;
  let xhsCount = 0;
  let baijiahaoCount = 0;
  let toutiaoCount = 0;

  for (const acc of Object.values(resultData.accounts ?? {})) {
    const plat = (acc as any).platform;
    if (plat === 'zhihu') zhihuCount++;
    else if (plat === 'xiaohongshu') xhsCount++;
    else if (plat === 'baijiahao') baijiahaoCount++;
    else if (plat === 'toutiao') toutiaoCount++;
    else gzhCount++;
  }

  const summary: ClientConfigSummary = {
    account_count: accountKeys.length,
    gzh_accounts: gzhCount,
    zhihu_accounts: zhihuCount,
    xhs_accounts: xhsCount,
    baijiahao_accounts: baijiahaoCount,
    toutiao_accounts: toutiaoCount,
    provider_count: providerKeys.length,
    has_typography: Boolean(resultData.typography),
    has_image_api: Boolean(resultData.image_api || resultData.image_spec),
    has_runtime: Boolean(resultData.runtime),
  };

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary,
    data: errors.length === 0 ? resultData : undefined,
  };
}

/**
 * 纯客户端配置合并算法（增量合并 / 全量覆盖，且双模式均保护本地已有真实密钥）
 */
export function clientMergeConfigData(
  currentConfig: any,
  incomingData: any,
  mode: MergeMode = 'merge',
): any {
  const current = clone(currentConfig || {});
  const incoming = clone(incomingData || {});

  // 规格化当前配置的账号与接口池为字典
  const currentAccountsDict: Record<string, any> = {};
  for (const acc of normalizeAccountsList(current.accounts)) {
    currentAccountsDict[acc.id || 'default'] = acc;
  }
  const currentProvidersDict: Record<string, any> = {};
  for (const prov of normalizeProvidersList(current.image_providers)) {
    currentProvidersDict[prov.id || 'default_provider'] = prov;
  }

  // 1. 合并 accounts
  if (incoming.accounts && typeof incoming.accounts === 'object') {
    if (mode === 'overwrite') {
      const newAccountsDict: Record<string, any> = {};
      for (const [id, incAcc] of Object.entries(incoming.accounts as Record<string, any>)) {
        const mergedAcc = clone(incAcc);
        // 若导入账号密钥为空，保留当前本地对应账号已有密钥
        if (!mergedAcc.app_secret && currentAccountsDict[id]?.app_secret) {
          mergedAcc.app_secret = currentAccountsDict[id].app_secret;
        }
        newAccountsDict[id] = mergedAcc;
      }
      current.accounts = Object.values(newAccountsDict);
    } else {
      // 增量合并
      for (const [id, incAcc] of Object.entries(incoming.accounts as Record<string, any>)) {
        if (!currentAccountsDict[id]) {
          currentAccountsDict[id] = clone(incAcc);
        } else {
          const mergedAcc = {
            ...currentAccountsDict[id],
            ...clone(incAcc),
          };
          if (!incAcc.app_secret && currentAccountsDict[id].app_secret) {
            mergedAcc.app_secret = currentAccountsDict[id].app_secret;
          }
          currentAccountsDict[id] = mergedAcc;
        }
      }
      current.accounts = Object.values(currentAccountsDict);
    }
  }

  // 2. 合并 default_account
  if (incoming.default_account) {
    current.default_account = incoming.default_account;
  }

  // 3. 合并 image_providers
  if (incoming.image_providers && typeof incoming.image_providers === 'object') {
    if (mode === 'overwrite') {
      const newProvidersDict: Record<string, any> = {};
      for (const [id, incProv] of Object.entries(incoming.image_providers as Record<string, any>)) {
        const mergedProv = clone(incProv);
        if (!mergedProv.api_key && currentProvidersDict[id]?.api_key) {
          mergedProv.api_key = currentProvidersDict[id].api_key;
        }
        newProvidersDict[id] = mergedProv;
      }
      current.image_providers = Object.values(newProvidersDict);
    } else {
      for (const [id, incProv] of Object.entries(incoming.image_providers as Record<string, any>)) {
        if (!currentProvidersDict[id]) {
          currentProvidersDict[id] = clone(incProv);
        } else {
          const mergedProv = {
            ...currentProvidersDict[id],
            ...clone(incProv),
          };
          if (!incProv.api_key && currentProvidersDict[id].api_key) {
            mergedProv.api_key = currentProvidersDict[id].api_key;
          }
          currentProvidersDict[id] = mergedProv;
        }
      }
      current.image_providers = Object.values(currentProvidersDict);
    }
  }

  // 4. 合并 typography
  if (incoming.typography) {
    current.typography = {
      ...(current.typography || {}),
      ...clone(incoming.typography),
    };
  }

  // 5. 合并 image_api / image_spec
  if (incoming.image_api) {
    const mergedImageApi = {
      ...(current.image_api || {}),
      ...clone(incoming.image_api),
    };
    if (!incoming.image_api.api_key && current.image_api?.api_key) {
      mergedImageApi.api_key = current.image_api.api_key;
    }
    current.image_api = mergedImageApi;
  }
  if (incoming.image_spec) {
    current.image_spec = {
      ...(current.image_spec || {}),
      ...clone(incoming.image_spec),
    };
  }

  // 6. 合并 runtime
  if (incoming.runtime) {
    current.runtime = {
      ...(current.runtime || {}),
      ...clone(incoming.runtime),
    };
  }

  return current;
}

/**
 * 纯客户端配置导出生成器：构建符合 WinCode / DSH 标准的导出数据
 */
export function clientExportConfigData(
  liveConfig: any,
  options: {
    includeSecrets?: boolean;
    scope?: ExportScope;
    version?: string;
  } = {},
): ExportedPayload {
  const { includeSecrets = false, scope = 'all', version = '0.2.0' } = options;
  const cfg = clone(liveConfig || {});

  const partial: Record<string, any> = {};

  // 1. 处理账号
  if (scope === 'all' || scope === 'accounts') {
    const exportedAccounts: Record<string, any> = {};
    for (const acc of normalizeAccountsList(cfg.accounts)) {
      const clonedAcc = clone(acc);
      if (!includeSecrets) {
        clonedAcc.app_secret = '';
      }
      exportedAccounts[acc.id || 'default'] = clonedAcc;
    }
    partial.accounts = exportedAccounts;
    partial.default_account = cfg.default_account || 'default';
  }

  // 2. 处理生图接口池
  if (scope === 'all' || scope === 'image_providers') {
    const exportedProviders: Record<string, any> = {};
    for (const prov of normalizeProvidersList(cfg.image_providers)) {
      const clonedP = clone(prov);
      if (!includeSecrets) {
        clonedP.api_key = '';
      }
      exportedProviders[prov.id || 'default_provider'] = clonedP;
    }
    partial.image_providers = exportedProviders;
  }

  // 3. 处理排版与配图视觉规则
  if (scope === 'all' || scope === 'visual_rules') {
    partial.typography = clone(cfg.typography);
    partial.image_api = clone(cfg.image_api);
    partial.image_spec = clone(cfg.image_spec);
    if (!includeSecrets && partial.image_api) {
      partial.image_api.api_key = '';
    }
  }

  // 4. 处理运行时设置
  if (scope === 'all' || scope === 'runtime') {
    partial.runtime = clone(cfg.runtime);
  }

  const meta: ExportMeta = {
    version,
    exported_at: new Date().toISOString(),
    plugin: 'dsh-social-publisher',
    include_secrets: includeSecrets,
    scope,
    account_count: partial.accounts ? Object.keys(partial.accounts).length : undefined,
    provider_count: partial.image_providers ? Object.keys(partial.image_providers).length : undefined,
  };

  return {
    $schema: 'https://deepseek.com/schemas/dsh-social-publisher-config.json',
    meta,
    config: partial,
  };
}
