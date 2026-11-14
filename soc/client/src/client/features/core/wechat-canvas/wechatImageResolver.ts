/**
 * 微信公众号排版正文图片与品牌头尾图解析引擎
 * 负责将 HTML 中的 __BRAND_TOP__、__BRAND_BOT__、IMG_A*_* 以及本地文件名占位符
 * 映射为安全可渲染的 DataURL / HTTP URL，未就绪插图自愈输出独立安全占位图
 */

import {
  extractLocalDiskPathFromUrl,
  extractFileName,
  isRenderableImageUrl,
} from "../socialPublisherWorkflowExtractor.js";

/** 构造正文插槽未就绪时的专属安全占位图 */
export function createSlotPlaceholderDataUrl(label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="608" viewBox="0 0 1080 608"><rect width="100%" height="100%" fill="#f8fafc" rx="16" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="8 6"/><text x="50%" y="46%" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="bold" fill="#64748b" text-anchor="middle">🖼️ ${label}</text><text x="50%" y="56%" font-family="system-ui, -apple-system, sans-serif" font-size="18" fill="#94a3b8" text-anchor="middle">独立配图插槽 · 待生成或装载中（绝不复用同篇已有插图）</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export interface ResolveWechatImagesOptions {
  inlineImages?: string[];
  resolvedMap?: Map<string, string>;
  brandTopUrl?: string;
  brandBotUrl?: string;
  brandTopSpec?: any;
  brandBotSpec?: any;
  artIndex?: number;
}

export interface ResolveWechatImagesResult {
  html: string;
  hasTopInHtml: boolean;
  hasBotInHtml: boolean;
}

export function resolveWechatImagesInHtml(
  rawHtml: string,
  options: ResolveWechatImagesOptions
): ResolveWechatImagesResult {
  if (!rawHtml || !rawHtml.trim()) {
    return { html: "", hasTopInHtml: false, hasBotInHtml: false };
  }

  // 彻底清洗任何残留的工具元数据 JSON（杜绝类似 {"account_id": ...} 暴露在正文里）
  let sanitizedHtml = rawHtml.trim();
  if (/^\s*\{\s*["'](?:account_id|file|fileName|theme|task_id|index)["']/i.test(sanitizedHtml) && !sanitizedHtml.includes("<")) {
    return { html: "", hasTopInHtml: false, hasBotInHtml: false };
  }
  // 若正文中混合了残缺的 JSON 前缀，自动将其截断剥除
  sanitizedHtml = sanitizedHtml.replace(/^\s*\{\s*["'](?:account_id|file|fileName|theme|task_id|index)["'][\s\S]*?(?=<)/i, "");

  const {
    inlineImages = [],
    resolvedMap,
    brandTopUrl,
    brandBotUrl,
    brandTopSpec,
    brandBotSpec,
    artIndex = 1,
  } = options;

  let finalHtml = sanitizedHtml;
  let hasTopInHtml = false;
  let hasBotInHtml = false;

  const uniqueInlineImages = Array.from(new Set(inlineImages.filter(Boolean)));
  const usedImageUrls = new Set<string>();

  // 1. 扫描并替换已有 <img src="..."> 中的占位符或本地路径
  finalHtml = finalHtml.replace(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi, (match, src) => {
    // 【中文修复依据】：严禁在正文区域渲染封面！封面已由文章顶部 2.35:1 大图或 1:1 方形封面卡片独立承载
    if (/(?:cover_\d+|cover\.|IMG_COVER|COVER_IMG)/i.test(src) || /alt=["'][^"']*封面[^"']*["']/i.test(match)) {
      return "";
    }
    // A: 头部品牌图占位符映射
    if (/__?BRAND_TOP__?/i.test(src)) {
      const isEnabled = brandTopSpec?.enabled ?? true;
      if (!isEnabled || !brandTopUrl) return "";
      hasTopInHtml = true;
      return match.replace(src, brandTopUrl);
    }

    // B: 尾部品牌图占位符映射
    if (/__?BRAND_BOT__?/i.test(src)) {
      const isEnabled = brandBotSpec?.enabled ?? true;
      if (!isEnabled || !brandBotUrl) return "";
      hasBotInHtml = true;
      return match.replace(src, brandBotUrl);
    }

    // C: 从 resolvedMap 直接按完整路径、磁盘路径或文件名查询
    const diskPath = extractLocalDiskPathFromUrl(src);
    const fileName = extractFileName(src);
    let resolved = resolvedMap?.get(src) || resolvedMap?.get(diskPath) || resolvedMap?.get(fileName);
    if (!resolved && resolvedMap) {
      for (const [k, v] of resolvedMap.entries()) {
        if (k.endsWith(fileName) || k.endsWith(src)) {
          resolved = v;
          break;
        }
      }
    }

    // D: 正文插图占位符（如 IMG_A1_1, IMG_A1_2, IMG_1, CONTENT_1 等）精准映射当前文章专属插图
    const placeholderMatch = src.match(/(?:IMG_A?\d*_(\d+)|IMG_\d*_(\d+)|IMG_(\d+)|CONTENT_(\d+))/i);
    if (placeholderMatch) {
      const subIndexStr = placeholderMatch[1] || placeholderMatch[2] || placeholderMatch[3] || placeholderMatch[4];
      const subIdx = subIndexStr ? Number.parseInt(subIndexStr, 10) : 1;
      const candidateImg = uniqueInlineImages[subIdx - 1];

      if (candidateImg && !usedImageUrls.has(candidateImg)) {
        usedImageUrls.add(candidateImg);
        const candidateResolved =
          resolvedMap?.get(candidateImg) ||
          resolvedMap?.get(candidateImg.replace(/^.*[\\/]/, "")) ||
          resolvedMap?.get(extractLocalDiskPathFromUrl(candidateImg)) ||
          candidateImg;
        return match.replace(src, candidateResolved);
      }

      // 【中文修复依据】：落盘图片反向自愈前置门禁！
      // 1. 若当前文章图片池 uniqueInlineImages 完全为空（说明尚未完成生图），严禁盲查 resolvedMap，直接输出安全占位图；
      // 2. 仅在文章已具备至少一张有效配图时，且 resolvedMap 中存在严格以绝对沙箱路径（/tasks/active/ 或 /tasks/archive/）匹配的条目时才放行自愈，杜绝跨任务同名短图穿透。
      if (uniqueInlineImages.length > 0 && resolvedMap) {
        let selfHealed: string | undefined;
        for (const [k, v] of resolvedMap.entries()) {
          const normK = k.replace(/\\/g, "/");
          const isCurrentSandbox = /\/tasks\/(?:active|archive)\//i.test(normK) || normK.includes("/images/");
          if (
            isCurrentSandbox &&
            (normK.endsWith(`/content_${artIndex}_${subIdx}.png`) ||
             normK.endsWith(`/content_${artIndex}_${subIdx}.jpg`) ||
             normK.endsWith(`/pic_${artIndex}_${subIdx}.png`))
          ) {
            selfHealed = v;
            break;
          }
        }
        if (selfHealed && !usedImageUrls.has(selfHealed)) {
          usedImageUrls.add(selfHealed);
          return match.replace(src, selfHealed);
        }
      }

      // 尚未就绪或未生图时，输出独立槽位安全占位图
      return match.replace(src, createSlotPlaceholderDataUrl(`正文插图 ${subIdx}`));
    }

    if (resolved && !usedImageUrls.has(resolved)) {
      usedImageUrls.add(resolved);
      return match.replace(src, resolved);
    }

    // E: 若已是可渲染的网络地址或 DataURL，直接采纳
    if (isRenderableImageUrl(src)) {
      return match;
    }

    // F: 通用 IMG_ 占位符兜底
    if (/__?IMG_[A-Z0-9_]+__?/i.test(src) || /^IMG_/i.test(src)) {
      const fallbackMatch = src.match(/(\d+)/);
      const slotNum = fallbackMatch ? fallbackMatch[1] : "1";
      return match.replace(src, createSlotPlaceholderDataUrl(`正文插图 ${slotNum}`));
    }

    return match;
  });

  // 2. 替换显式正文注释占位符（如 <!-- IMG_A1_1 --> 或 IMG_A1_1）
  let matchCount = 0;
  if (/(?:<!--\s*IMG_A\d+_\d+\s*-->|IMG_A\d+_\d+|<!--\s*IMAGE_\d+\s*-->)/i.test(finalHtml)) {
    finalHtml = finalHtml.replace(/(?:<!--\s*IMG_A\d+_\d+\s*-->|IMG_A\d+_\d+|<!--\s*IMAGE_\d+\s*-->)/gi, () => {
      const availableImg = uniqueInlineImages.find((img) => !usedImageUrls.has(img));
      matchCount++;
      if (availableImg) {
        usedImageUrls.add(availableImg);
        return `<section style="margin:20px 0;text-align:center;"><img src="${availableImg}" alt="正文配图" style="max-width:100%;display:block;margin:0 auto;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,0.06);cursor:zoom-in;" /></section>`;
      }
      return `<section style="margin:20px 0;text-align:center;"><img src="${createSlotPlaceholderDataUrl(`配图 ${matchCount}`)}" alt="配图 ${matchCount}" style="max-width:100%;border-radius:6px;" /></section>`;
    });
  }

  // 微信单行零换行清洗
  const cleaned = finalHtml.replace(/\r?\n/g, "").trim();

  return {
    html: cleaned,
    hasTopInHtml,
    hasBotInHtml,
  };
}
