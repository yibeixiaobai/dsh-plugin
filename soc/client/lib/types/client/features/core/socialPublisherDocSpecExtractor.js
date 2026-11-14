/**
 * 社媒发布工作台 - 结构化 DocSpec 正文还原与 HTML 深度清洗器
 * 负责从 doc_spec 骨架（intro, sections, blocks, sign_off）还原可读文本，
 * 并提供严格的对象类型保护与反转义，彻底消灭 [object Object] 与元数据泄露。
 */
/**
 * 【中文修复依据】：安全递归解包对象字段，彻底根治 [object Object] 类型泄露
 * 兼容处理 {text, content, title, desc, value, item, label} 等字段，
 * 数组递归拼接，非有效文本自动过滤，绝对禁止输出 [object Object]
 */
export function safeExtractText(val) {
    if (val === null || val === undefined)
        return '';
    if (typeof val === 'string')
        return val.trim();
    if (typeof val === 'number' || typeof val === 'boolean')
        return String(val);
    if (Array.isArray(val)) {
        return val
            .map(item => safeExtractText(item))
            .filter(Boolean)
            .join(' ')
            .trim();
    }
    if (typeof val === 'object') {
        const obj = val;
        const title = typeof obj.title === 'string' ? obj.title.trim() : '';
        const bodyCandidate = obj.content ?? obj.desc ?? obj.description ?? obj.text;
        const body = bodyCandidate ? safeExtractText(bodyCandidate) : '';
        if (title && body && title !== body) {
            return `${title}: ${body}`;
        }
        const candidates = [
            obj.text,
            obj.content,
            obj.title,
            obj.desc,
            obj.description,
            obj.value,
            obj.item,
            obj.label,
            obj.message,
            obj.note,
        ];
        for (const c of candidates) {
            const extracted = safeExtractText(c);
            if (extracted)
                return extracted;
        }
        const values = Object.values(obj)
            .map(v => (typeof v === 'string' ? v.trim() : ''))
            .filter(s => s.length > 0 && !s.includes('[object'));
        if (values.length > 0) {
            return values.join(' ').trim();
        }
    }
    return '';
}
/**
 * 稳健清洗与反转义正文内容
 * 修复从 JSON 输出、工具调用结果或双重序列化中提取时残留的 \"、\\n、多重反斜杠等转义缺陷
 * 【中文修复依据】：拦截纯工具执行元数据 JSON 字符串，物理剔除 [object Object] 坏字符串
 */
export function cleanAndUnescapeHtmlContent(raw) {
    if (!raw || typeof raw !== 'string')
        return '';
    let text = raw.trim();
    // 拦截纯工具执行元数据 JSON 字符串（如未闭合的 { "account_id": ..., "file": ... }）
    if (/^\s*\{\s*["'](?:account_id|file|fileName|theme|task_id|index)["']/i.test(text)) {
        const htmlMatch = text.match(/["'](?:html|content)["']\s*:\s*["'](<[\s\S]+?)["']\s*(?:,\s*["']|\})/i);
        if (htmlMatch && htmlMatch[1]) {
            text = htmlMatch[1];
        }
        else {
            return '';
        }
    }
    // 1. 若首尾带有引号，说明是被 JSON 字符串二次包裹
    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
        try {
            const parsed = JSON.parse(text);
            if (typeof parsed === 'string') {
                text = parsed;
            }
        }
        catch {
            text = text.slice(1, -1);
        }
    }
    // 2. 深度 JSON 优先解包：若本身是完整 JSON 对象字符串，优先严格提取真实正文
    if (text.startsWith('{') && text.endsWith('}')) {
        try {
            const parsedObj = JSON.parse(text);
            if (parsedObj && typeof parsedObj === 'object') {
                if (typeof parsedObj.html === 'string' && parsedObj.html.includes('<')) {
                    return cleanAndUnescapeHtmlContent(parsedObj.html);
                }
                if (typeof parsedObj.content === 'string') {
                    return cleanAndUnescapeHtmlContent(parsedObj.content);
                }
                if (typeof parsedObj.markdown === 'string') {
                    return cleanAndUnescapeHtmlContent(parsedObj.markdown);
                }
                if (typeof parsedObj.text === 'string') {
                    return cleanAndUnescapeHtmlContent(parsedObj.text);
                }
                if (Array.isArray(parsedObj.articles) && parsedObj.articles[0]?.content) {
                    return cleanAndUnescapeHtmlContent(parsedObj.articles[0].content);
                }
            }
        }
        catch {
            // 无法整体 parse 则继续下方结构化剥离
        }
    }
    // 2.1 根除大模型工具调用双字段串联导致的正文重复与 ", "html": " 泄露缺陷
    if (/(?:",\s*"html"\s*:\s*"|',\s*'html'\s*:\s*'|",\s*"content"\s*:\s*")/i.test(text)) {
        const htmlFieldMatch = text.match(/["']html["']\s*:\s*["'](<[\s\S]+?)["']\s*(?:,\s*["']|\})/i);
        if (htmlFieldMatch && htmlFieldMatch[1]) {
            text = htmlFieldMatch[1];
        }
        else {
            text = text.replace(/(?:",\s*"html"\s*:\s*[\s\S]*|',\s*'html'\s*:\s*[\s\S]*|",\s*"content"\s*:\s*[\s\S]*)$/i, '');
        }
    }
    // 3. 智能剥离工具返回值中遗留的 {"account_id": ..., "content": " 或类似元数据前缀
    if (/^\s*\{[\s\S]*?["'](?:content|html|markdown|text)["']\s*:\s*["']?/i.test(text)) {
        text = text.replace(/^\s*\{[\s\S]*?["'](?:content|html|markdown|text)["']\s*:\s*["']?/i, '');
        text = text.replace(/["']?\s*\}?\s*$/i, '');
    }
    // 4. 系统元数据黑名单强制彻底剥离
    text = text
        .replace(/["']?,\s*["'](?:task_id|content_hash|manifest_fingerprint|_social_event|cards|img_count|plain_chars|problems|html|content)["']\s*:\s*[\s\S]*$/i, '')
        .replace(/["']?(?:task_id|content_hash|manifest_fingerprint|_social_event)\s*:\s*["'][^"']*["']/gi, '')
        .replace(/,\s*"(?:task_id|content_hash|plain_chars|img_count|problems)"[\s\S]*$/i, '')
        .replace(/,\s*"task_id"\s*:\s*[\s\S]*$/i, '')
        .replace(/,\s*"_social_event"[\s\S]*$/i, '');
    // 若含有转义反斜杠，执行系统化反转义
    if (text.includes('\\"') || text.includes('\\n') || text.includes('\\/') || text.includes('\\t')) {
        text = text
            .replace(/\\"/g, '"')
            .replace(/\\'/g, "'")
            .replace(/\\\//g, '/')
            .replace(/\\r\\n/g, '\n')
            .replace(/\\n/g, '\n')
            .replace(/\\t(?![a-zA-Z0-9_.-])/g, '\t');
    }
    // 过滤正文中可能混入的生图提示词与调试命令
    text = text
        .replace(/^[ \t]*(?:【(?:配图建议与提示词|生图提示词|图片描述|配图建议)】[：:]?[^\n\r]*|(?:生图提示词|配图提示词|配图建议|Image Prompt|image_prompt|Prompt)[：:][^\n\r]*)[ \t]*$/gmi, '')
        .replace(/(?:生图提示词|配图提示词|Image Prompt|image_prompt)[：:][^\n\r<]+/gi, '')
        .replace(/```(?:json)?\s*\{[\s\S]*?"cards"[\s\S]*?\}\s*```/gi, '')
        .replace(/```(?:json)?\s*\[[\s\S]*?"role"[\s\S]*?\]\s*```/gi, '')
        .replace(/(?:["']cards["']|cards)\s*:\s*\[[\s\S]*$/gi, '')
        .replace(/\{[\s\r\n]*"(?:cards|img_count|plain_chars|problems)"[\s\S]*\}$/gi, '')
        .replace(/^[ \t]*(?:python(?:\.exe)?|python3|node(?:\.exe)?)\s+[\w./\\-]+\.(?:py|js|sh)[^\n\r]*$/gmi, '')
        .replace(/gzh_(?:generate_images|build_article|publish_draft|validate_html|check_topics)\([^)]*\)/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        // 【中文修复依据】：物理清洗正文残留的 [object Object] 坏字符串，杜绝坏节点渗透到画布（彻底根治图 1 缺陷）
        .replace(/\[object\s*Object\]/gi, '')
        .replace(/\bobject\s*Object\b/gi, '')
        .replace(/\n{3,}/g, '\n\n');
    return text;
}
/**
 * 递归从 doc_spec 结构化骨架（intro, sections, blocks, sign_off）还原出完整可读的文章正文
 * 【中文修复依据】：全面采用 safeExtractText 递归解包，支持图文与多媒体组件完整还原，绝对杜绝 [object Object] 泄露
 */
export function extractContentFromDocSpec(doc) {
    if (!doc || typeof doc !== 'object')
        return '';
    // 若对象本身已包含纯文本/Markdown/HTML，优先直接返回
    if (typeof doc.content === 'string' && doc.content.trim())
        return doc.content;
    if (typeof doc.html === 'string' && doc.html.trim())
        return doc.html;
    if (typeof doc.markdown === 'string' && doc.markdown.trim())
        return doc.markdown;
    if (typeof doc.text === 'string' && doc.text.trim())
        return doc.text;
    const parts = [];
    // 1. 金句导读 (intro)
    if (doc.intro && typeof doc.intro === 'object') {
        const introObj = doc.intro;
        const pre = safeExtractText(introObj.pre);
        const hl = safeExtractText(introObj.hl);
        const post = safeExtractText(introObj.post);
        const fullIntro = `${pre}${hl ? `**${hl}**` : ''}${post}`.trim();
        if (fullIntro) {
            parts.push(`> 💡 ${fullIntro}\n`);
        }
    }
    // 2. 章节目录/导读 (toc)
    if (Array.isArray(doc.toc) && doc.toc.length > 0) {
        const tocItems = doc.toc
            .map(t => safeExtractText(t))
            .filter(Boolean)
            .map(t => `- ${t}`)
            .join('\n');
        if (tocItems) {
            parts.push(`**本文核心导读：**\n${tocItems}\n`);
        }
    }
    // 3. 核心章节内容 (sections)
    if (Array.isArray(doc.sections)) {
        for (const sec of doc.sections) {
            if (!sec || typeof sec !== 'object')
                continue;
            const sObj = sec;
            const h2 = safeExtractText(sObj.h2);
            const sTitle = safeExtractText(sObj.text || sObj.title);
            if (h2 || sTitle) {
                parts.push(`\n## ${h2 ? `${h2} ` : ''}${sTitle}\n`);
            }
            if (Array.isArray(sObj.blocks)) {
                for (const block of sObj.blocks) {
                    if (!block || typeof block !== 'object')
                        continue;
                    const b = block;
                    // lead 导读强调段
                    if (b.lead) {
                        const leadTxt = safeExtractText(b.lead);
                        if (leadTxt) {
                            parts.push(`> **重点提示**：${leadTxt}\n`);
                        }
                    }
                    // p 普通段落（可能是字符串或数组或对象）
                    if (b.p) {
                        if (typeof b.p === 'string') {
                            const pTxt = b.p.trim();
                            if (pTxt)
                                parts.push(`${pTxt}\n`);
                        }
                        else if (Array.isArray(b.p)) {
                            const pStr = b.p
                                .map((seg) => {
                                if (typeof seg === 'string')
                                    return seg;
                                if (Array.isArray(seg) && seg.length >= 2) {
                                    const tag = String(seg[0]);
                                    const txt = safeExtractText(seg[1]);
                                    if (tag === 'b' || tag === 'kw')
                                        return `**${txt}**`;
                                    if (tag === 'hl')
                                        return `\`${txt}\``;
                                    return txt;
                                }
                                return safeExtractText(seg);
                            })
                                .join('');
                            if (pStr.trim()) {
                                parts.push(`${pStr}\n`);
                            }
                        }
                        else if (typeof b.p === 'object') {
                            const pTxt = safeExtractText(b.p);
                            if (pTxt)
                                parts.push(`${pTxt}\n`);
                        }
                    }
                    // versus 正反/误区对比卡
                    if (b.versus && typeof b.versus === 'object') {
                        const v = b.versus;
                        const vTitle = v.title ? `### ⚖️ ${safeExtractText(v.title)}\n` : '';
                        const wrongTxt = safeExtractText(v.wrong);
                        const rightTxt = safeExtractText(v.right);
                        if (wrongTxt || rightTxt) {
                            parts.push(`${vTitle}❌ **常见误区**：${wrongTxt}\n\n✅ **规范正解**：${rightTxt}\n`);
                        }
                    }
                    // checklist 自查清单
                    if (b.checklist && typeof b.checklist === 'object') {
                        const c = b.checklist;
                        const cTitle = c.title ? `### 📋 ${safeExtractText(c.title)}\n` : '';
                        const items = Array.isArray(c.items)
                            ? c.items.map(it => `- [ ] ${safeExtractText(it)}`).filter(it => it !== '- [ ] ').join('\n')
                            : '';
                        if (items) {
                            parts.push(`${cTitle}${items}\n`);
                        }
                    }
                    // warning 避坑提醒卡
                    if (b.warning) {
                        const wText = safeExtractText(typeof b.warning === 'string' ? b.warning : b.warning.text || b.warning.title || b.warning);
                        if (wText) {
                            parts.push(`> ⚠️ **避坑提醒**：${wText}\n`);
                        }
                    }
                    // qa 快问快答卡
                    if (b.qa && typeof b.qa === 'object') {
                        const qa = b.qa;
                        const qTxt = safeExtractText(qa.q);
                        const aTxt = safeExtractText(qa.a);
                        if (qTxt || aTxt) {
                            parts.push(`**Q: ${qTxt}**\n\n**A:** ${aTxt}\n`);
                        }
                    }
                    // stat 核心数据高光卡
                    if (b.stat && typeof b.stat === 'object') {
                        const st = b.stat;
                        const m = safeExtractText(st.metric);
                        const l = safeExtractText(st.label);
                        const d = safeExtractText(st.desc);
                        if (m || d) {
                            parts.push(`📊 **${m}**${l ? ` (${l})` : ''}：${d}\n`);
                        }
                    }
                    // quote 金句名言卡
                    if (b.quote) {
                        const qText = safeExtractText(typeof b.quote === 'string' ? b.quote : b.quote?.text || b.quote);
                        const author = safeExtractText(b.quote?.author);
                        if (qText) {
                            parts.push(`> “${qText}”${author ? ` —— ${author}` : ''}\n`);
                        }
                    }
                    // card 单条重点卡
                    if (b.card) {
                        const cardTxt = safeExtractText(b.card);
                        if (cardTxt) {
                            parts.push(`📌 **提示**：${cardTxt}\n`);
                        }
                    }
                    // card_ul 清单列表
                    if (b.card_ul && typeof b.card_ul === 'object') {
                        const cul = b.card_ul;
                        const culTitle = cul.title ? `**${safeExtractText(cul.title)}：**\n` : '';
                        const items = Array.isArray(cul.items)
                            ? cul.items.map(it => `- ${safeExtractText(it)}`).filter(it => it !== '- ').join('\n')
                            : '';
                        if (items) {
                            parts.push(`${culTitle}${items}\n`);
                        }
                    }
                    // img 正文插图原生还原
                    if (b.img) {
                        const imgSrc = safeExtractText(typeof b.img === 'string' ? b.img : b.img?.src);
                        const caption = safeExtractText(b.img?.caption);
                        if (imgSrc) {
                            parts.push(`\n\n![${caption || '插图'}](${imgSrc})\n\n`);
                        }
                    }
                    // hr 分割线
                    if (b.hr) {
                        parts.push('\n\n---\n\n');
                    }
                }
            }
        }
    }
    // 4. 结尾品牌引导语 (sign_off)
    if (doc.sign_off) {
        const signOff = safeExtractText(doc.sign_off);
        if (signOff) {
            parts.push(`\n---\n*${signOff}*\n`);
        }
    }
    return parts.join('\n').trim();
}
//# sourceMappingURL=socialPublisherDocSpecExtractor.js.map