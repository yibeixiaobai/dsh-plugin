/**
 * 微信排版多图与图文卡片按序替换核心工具
 * 保证严格遵循微信排版单行零换行、行内样式规范，并精准保持用户选图顺序
 */

export interface ReplaceImageOptions {
  appendIfMore?: boolean;
}

/**
 * 提取 HTML 片段中所有 <img> 的图片地址数组，按在 DOM 中出现的先后顺序返回
 */
export function extractImagesFromHtml(html: string): string[] {
  if (!html || !html.trim()) return [];
  const urls: string[] = [];
  const imgTagRegex = /<img\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = imgTagRegex.exec(html)) !== null) {
    const tag = match[0];
    const srcMatch = tag.match(/\bsrc=["']([^"']+)["']/i) || tag.match(/\bdata-src=["']([^"']+)["']/i);
    if (srcMatch && srcMatch[1]) {
      urls.push(srcMatch[1]);
    }
  }
  return urls;
}

/**
 * 当用户选择的新图数量超过卡片原有图片槽位时，
 * 智能探测卡片内子容器模板（画廊项目 div、无缝拼接 img 等）并自适应追加图片
 */
function appendImagesToCardHtml(html: string, remainingUrls: string[], startIndex: number): string {
  if (!remainingUrls.length) return html;

  // 1. 探测画廊 flex-shrink:0 容器模板
  const galleryItemRegex = /<div\b[^>]*style=["'][^"']*flex-shrink:\s*0[^"']*["'][^>]*>[\s\S]*?<\/div>/gi;
  const galleryMatches = Array.from(html.matchAll(galleryItemRegex));

  if (galleryMatches.length > 0) {
    const lastMatch = galleryMatches[galleryMatches.length - 1]!;
    const lastItemHtml = lastMatch[0];
    const insertPos = lastMatch.index! + lastItemHtml.length;

    let appendedBlocks = "";
    remainingUrls.forEach((url, i) => {
      const currentIdx = startIndex + i + 1;
      let cloned = lastItemHtml;
      // 替换图片 src
      cloned = cloned.replace(/(\bsrc=["'])[^"']*([ "'])/i, `$1${url}$2`);
      cloned = cloned.replace(/(\bdata-src=["'])[^"']*([ "'])/i, `$1${url}$2`);
      // 智能递增图注序号，如 "图 1" -> "图 3"
      cloned = cloned.replace(/图\s*\d+/g, `图 ${currentIdx}`);
      appendedBlocks += cloned;
    });

    return html.slice(0, insertPos) + appendedBlocks + html.slice(insertPos);
  }

  // 2. 探测无缝长图拼接或通用 <img> 模板
  const imgRegex = /<img\b[^>]*>/gi;
  const imgMatches = Array.from(html.matchAll(imgRegex));
  if (imgMatches.length > 0) {
    const lastImgMatch = imgMatches[imgMatches.length - 1]!;
    const lastImgHtml = lastImgMatch[0];
    const insertPos = lastImgMatch.index! + lastImgHtml.length;

    let appendedImgs = "";
    remainingUrls.forEach((url) => {
      let clonedImg = lastImgHtml;
      clonedImg = clonedImg.replace(/(\bsrc=["'])[^"']*([ "'])/i, `$1${url}$2`);
      clonedImg = clonedImg.replace(/(\bdata-src=["'])[^"']*([ "'])/i, `$1${url}$2`);
      appendedImgs += clonedImg;
    });

    return html.slice(0, insertPos) + appendedImgs + html.slice(insertPos);
  }

  // 3. 回退策略：在关闭标签前追加标准微信图片
  const closingTagMatch = html.match(/<\/(?:section|article|div)>$/i);
  const fallbackImgs = remainingUrls
    .map(
      (url) =>
        `<img src="${url}" style="width:100%;display:block;margin:8px 0;border-radius:4px;object-fit:cover;" />`
    )
    .join("");

  if (closingTagMatch && closingTagMatch.index !== undefined) {
    const pos = closingTagMatch.index;
    return html.slice(0, pos) + fallbackImgs + html.slice(pos);
  }

  return html + fallbackImgs;
}

/**
 * 按照传入的图片 URL 数组严格按顺序依次替换 HTML 中的各个 <img> 标签
 * 顺序映射关系：
 * newImageUrls[0] -> 槽位 1
 * newImageUrls[1] -> 槽位 2
 * newImageUrls[2] -> 槽位 3 ...
 *
 * 当 newImageUrls.length > 原有槽位数且 options.appendIfMore 为 true 时，智能追加新槽位
 * 输出严格遵循微信单行零换行规范
 */
export function replaceImagesInHtmlByOrder(
  rawHtml: string,
  newImageUrls: string[],
  options: ReplaceImageOptions = { appendIfMore: true }
): string {
  if (!rawHtml || !newImageUrls || newImageUrls.length === 0) {
    return rawHtml;
  }

  // 1. 顺序遍历已有 <img> 标签进行替换
  let replacedCount = 0;
  const imgRegex = /<img\b([^>]*)>/gi;

  let resultHtml = rawHtml.replace(imgRegex, (fullMatch, attrs) => {
    if (replacedCount < newImageUrls.length) {
      const newUrl = newImageUrls[replacedCount++];
      let newTag = fullMatch;
      if (/(\bsrc=["'])[^"']*([ "'])/i.test(newTag)) {
        newTag = newTag.replace(/(\bsrc=["'])[^"']*([ "'])/i, `$1${newUrl}$2`);
      } else {
        newTag = `<img src="${newUrl}" ${attrs}>`;
      }
      if (/(\bdata-src=["'])[^"']*([ "'])/i.test(newTag)) {
        newTag = newTag.replace(/(\bdata-src=["'])[^"']*([ "'])/i, `$1${newUrl}$2`);
      }
      return newTag;
    }
    return fullMatch;
  });

  // 2. 若选择的图片数量多于原有槽位且允许追加
  if (options.appendIfMore !== false && replacedCount < newImageUrls.length) {
    const remainingUrls = newImageUrls.slice(replacedCount);
    resultHtml = appendImagesToCardHtml(resultHtml, remainingUrls, replacedCount);
  }

  // 3. 严格清洗微信输出：去除全部回车换行，单行输出
  return resultHtml.replace(/\r?\n/g, "").trim();
}
