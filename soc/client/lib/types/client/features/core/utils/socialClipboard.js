/**
 * 获取规范的社媒平台中文显示名称
 */
export function getPlatformDisplayName(platform, platformName) {
    if (platformName && !['toutiao', 'gzh', 'xhs', 'zhihu', 'baijiahao'].includes(platformName.toLowerCase())) {
        return platformName;
    }
    const p = (platform || '').toLowerCase();
    if (p === 'gzh' || p === 'wechat')
        return '微信公众号';
    if (p === 'toutiao')
        return '今日头条';
    if (p === 'zhihu')
        return '知乎';
    if (p === 'baijiahao')
        return '百家号';
    if (p === 'xiaohongshu' || p === 'xhs')
        return '小红书';
    return platformName || platform || '社媒';
}
/**
 * 清洗 HTML 为纯净多行文本（保留段落换行与缩进）
 */
export function cleanHtmlToPlainText(html) {
    if (!html)
        return '';
    return html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<\/p>|<\/div>|<\/section>|<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
/**
 * 清洗通用专栏文本，移除无效空图片语法与占位符
 */
export function cleanGenericArticleTextForClipboard(text) {
    if (!text)
        return '';
    return text
        // 移除空图片占位符（如 ![头部品牌图]()、![尾部品牌图]() 或 ![]()）
        .replace(/!\[.*?\]\(\s*\)/g, '')
        // 移除未替换的品牌占位符
        .replace(/!\[.*?\]\(.*?__?BRAND_(?:TOP|BOT)__?.*?\)/gi, '')
        // 移除泄露的卡片配置 JSON 代码块
        .replace(/```(?:json)?\s*\{[\s\S]*?"cards"[\s\S]*?\}\s*```/gi, '')
        .trim();
}
/**
 * 根据文章所属平台及类型获取专属复制配置（按钮文案与成功提示）
 */
export function getArticleCopyConfig(article) {
    if (!article) {
        return {
            buttonLabel: '复制文章内容',
            toastTip: '已复制文章内容至剪贴板',
        };
    }
    if (article.platform === 'xiaohongshu') {
        return {
            buttonLabel: '复制小红书文案',
            toastTip: '已复制小红书笔记文案（含标题与话题标签），可直接粘贴发布！',
        };
    }
    if (article.platform === 'gzh' && article.articleType === 'newspic') {
        return {
            buttonLabel: '复制小绿书文案',
            toastTip: '已复制微信小绿书图文文案！',
        };
    }
    if (article.platform === 'gzh') {
        return {
            buttonLabel: '复制公众号富文本',
            toastTip: '已复制微信 13px 富文本！可直接在公众号后台编辑器 Ctrl+V 粘贴',
        };
    }
    if (article.platform === 'zhihu') {
        return {
            buttonLabel: '复制知乎专栏格式',
            toastTip: '已复制知乎专栏文案与 Markdown 排版！',
        };
    }
    if (article.platform === 'toutiao') {
        return {
            buttonLabel: '复制今日头条文案',
            toastTip: '已复制今日头条文章与排版内容，可直接在头条号后台粘贴发布！',
        };
    }
    if (article.platform === 'baijiahao') {
        return {
            buttonLabel: '复制百家号文案',
            toastTip: '已复制百家号专栏文章至剪贴板！',
        };
    }
    const pName = getPlatformDisplayName(article.platform, article.platformName);
    return {
        buttonLabel: `复制${pName}文案`,
        toastTip: `已复制${pName}专栏稿件至剪贴板！`,
    };
}
/**
 * 智能自适应全平台剪贴板复制执行函数
 */
export async function copyArticleToClipboard(article) {
    if (!article)
        return false;
    // 1. 小红书平台：纯净标题 + 纯净正文（保留短段落与 #话题标签）
    if (article.platform === 'xiaohongshu') {
        const plain = cleanHtmlToPlainText(article.content);
        const textToCopy = article.title ? `${article.title}\n\n${plain}` : plain;
        return copyPlainTextToClipboard(textToCopy);
    }
    // 2. 微信小绿书：纯净标题 + 纯净正文
    if (article.platform === 'gzh' && article.articleType === 'newspic') {
        const plain = cleanHtmlToPlainText(article.content);
        const textToCopy = article.title ? `${article.title}\n\n${plain}` : plain;
        return copyPlainTextToClipboard(textToCopy);
    }
    // 3. 微信公众号长文：13px 高保真富文本复制
    if (article.platform === 'gzh') {
        const plainTextFallback = article.title
            ? `${article.title}\n\n${cleanHtmlToPlainText(article.content)}`
            : cleanHtmlToPlainText(article.content);
        return copyRichHtmlToClipboard(article.content, plainTextFallback);
    }
    // 4. 今日头条/知乎/百家号专栏：清洗后的纯净 Markdown 或富文本
    const cleanedContent = cleanGenericArticleTextForClipboard(article.content);
    const plainText = article.title
        ? `${article.title}\n\n${cleanedContent}`
        : cleanedContent;
    // 若内容为 HTML，尝试富文本复制；若为 Markdown，优先纯文本复制
    if (/<[a-z][\s\S]*>/i.test(cleanedContent)) {
        return copyRichHtmlToClipboard(cleanedContent, plainText);
    }
    return copyPlainTextToClipboard(plainText);
}
/**
 * 将带样式的 HTML 复制为原生富文本到系统剪贴板，支持直接在微信公众平台后台 Ctrl+V 粘贴
 */
export async function copyRichHtmlToClipboard(htmlContent, plainTextFallback) {
    const plainText = plainTextFallback || cleanHtmlToPlainText(htmlContent);
    // 补齐微信排版所需的基础外包容器样式
    const fullHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
  <div style="max-width: 677px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei UI', 'Microsoft YaHei', Arial, sans-serif; font-size: 16px; line-height: 1.8; color: #333333; letter-spacing: 0.5px;">
    ${htmlContent}
  </div>
</body>
</html>`.trim();
    try {
        if (typeof ClipboardItem !== 'undefined' && navigator.clipboard && navigator.clipboard.write) {
            const htmlBlob = new Blob([fullHtml], { type: 'text/html' });
            const textBlob = new Blob([plainText], { type: 'text/plain' });
            await navigator.clipboard.write([
                new ClipboardItem({
                    'text/html': htmlBlob,
                    'text/plain': textBlob,
                }),
            ]);
            return true;
        }
    }
    catch (e) {
        console.warn('[socialClipboard] 写入富文本剪贴板失败，回退至纯文本模式:', e);
    }
    return copyPlainTextToClipboard(plainText);
}
/**
 * 复制纯文本至剪贴板
 */
export async function copyPlainTextToClipboard(text) {
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        return successful;
    }
    catch {
        return false;
    }
}
/**
 * 批量下载或保存图片到本地
 */
export function triggerDownloadImage(url, filename) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
export const copySocialArticleContent = copyArticleToClipboard;
//# sourceMappingURL=socialClipboard.js.map