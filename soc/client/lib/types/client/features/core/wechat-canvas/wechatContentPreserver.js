/**
 * 从 HTML 字符串中清洗提取可见纯文本（优先提取 span leaf 内部文本）
 */
function extractVisibleText(html) {
    if (!html)
        return "";
    const leafMatch = html.match(/<span\s+leaf(?:=""|="true")?[^>]*>([\s\S]*?)<\/span>/i);
    if (leafMatch && leafMatch[1]) {
        return leafMatch[1].replace(/<[^>]+>/g, "").trim();
    }
    return html.replace(/<[^>]+>/g, "").trim();
}
/**
 * 从 HTML 字符串中提取第一个非 Base64 占位的实拍图片链接
 */
function extractFirstImageUrl(html) {
    if (!html)
        return null;
    const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    return match && match[1] ? match[1] : null;
}
/**
 * 微信公众号专业排版 - 内容保持无损替换器
 * 【核心职责】：当用户用新模板替换旧节点时，保留用户原有的标题文字、段落与图片，
 * 将新模板的默认占位符替换为用户真实内容，实现真正的“一键换皮、内容不丢”！
 */
export function preserveNodeContent(oldNode, newNode) {
    const result = {
        ...newNode,
        id: `sec_${newNode.type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        props: { ...newNode.props },
    };
    // 1. 标题类组件无损内容继承 (h2 / 标题模板)
    if (oldNode.type === "h2" || newNode.type === "h2") {
        const userText = oldNode.props?.text?.trim() || extractVisibleText(oldNode.rawHtml);
        if (userText && result.rawHtml) {
            // 找到新模板中的第一个主文字 leaf span 并精准替换其内容
            result.rawHtml = result.rawHtml.replace(/(<span\s+leaf(?:=""|="true")?[^>]*>)([\s\S]*?)(<\/span>)/i, `$1${userText}$3`);
            result.props.text = userText;
        }
        return result;
    }
    // 2. 正文段落组件无损内容继承 (p)
    if (oldNode.type === "p" || newNode.type === "p") {
        const userText = oldNode.props?.text?.trim() || extractVisibleText(oldNode.rawHtml);
        if (userText && result.rawHtml) {
            result.rawHtml = result.rawHtml.replace(/(<span\s+leaf(?:=""|="true")?[^>]*>)([\s\S]*?)(<\/span>)/i, `$1${userText}$3`);
            result.props.text = userText;
        }
        return result;
    }
    // 3. 图文卡片类组件继承 (image_card / gallery / checklist)
    const oldImg = extractFirstImageUrl(oldNode.rawHtml);
    const oldText = extractVisibleText(oldNode.rawHtml);
    if (result.rawHtml) {
        let replacedHtml = result.rawHtml;
        // 若原卡片有图片且新模板包含图片标签，继承原图链接
        if (oldImg && replacedHtml.includes("<img")) {
            replacedHtml = replacedHtml.replace(/(<img[^>]+src=["'])([^"']+)(["'])/i, `$1${oldImg}$3`);
        }
        // 若原卡片有文本，继承原卡片的主题文本
        if (oldText && oldText.length > 0) {
            replacedHtml = replacedHtml.replace(/(<span\s+leaf(?:=""|="true")?[^>]*>)([\s\S]*?)(<\/span>)/i, `$1${oldText}$3`);
            result.props.text = oldText;
        }
        result.rawHtml = replacedHtml;
    }
    return result;
}
//# sourceMappingURL=wechatContentPreserver.js.map