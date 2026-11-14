/**
 * 社媒发布模块品牌头尾图与平台展示规范辅助库
 * [中文修复依据]：将账号专属品牌图深拷贝合并与平台 Badge 映射逻辑抽离为独立领域辅助模块，
 * 满足单文件不超过 400 行架构约束，彻底杜绝多账号引用污染与一改全改。
 */

export const DEFAULT_PLATFORM_INFO = {
  label: "微信公众号",
  badge: "公众号",
  color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
};

export const PLATFORM_MAP: Record<string, typeof DEFAULT_PLATFORM_INFO> = {
  gzh: DEFAULT_PLATFORM_INFO,
  zhihu: {
    label: "知乎专栏",
    badge: "知乎",
    color: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
  },
  xiaohongshu: {
    label: "小红书",
    badge: "小红书",
    color: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  },
  baijiahao: {
    label: "百家号",
    badge: "百家号",
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  },
  toutiao: {
    label: "今日头条",
    badge: "头条号",
    color: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  },
};

export const DEFAULT_BRAND_IMAGES_CONFIG = {
  header: {
    enabled: true,
    file: "brand_top.jpg",
    width: 100,
    height: 0,
    fit: "contain",
    position: "center",
    radius: 0,
    margin_top: 0,
    margin_bottom: 0,
    frame: false,
  },
  footer: {
    enabled: true,
    file: "brand_bot.jpg",
    width: 0,
    height: 0,
    fit: "contain",
    position: "center",
    radius: 0,
    margin_top: 20,
    margin_bottom: 0,
    frame: false,
  },
} as const;

/**
 * 账号品牌头尾图深度安全合并辅助方法：
 * [中文修复依据]：精准深拷贝当前账号的 brand_images，避免对象引用共享与无用展开回落
 */
export function mergeAccountBrandImages(existing: any, patchBrand: any) {
  if (!patchBrand) return existing;
  return {
    ...existing,
    ...patchBrand,
    header: {
      ...existing?.header,
      ...patchBrand?.header,
    },
    footer: {
      ...existing?.footer,
      ...patchBrand?.footer,
    },
  };
}
