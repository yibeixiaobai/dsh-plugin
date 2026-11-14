import { WECHAT_THEMES } from "./wechatCanvasTypes.js";
function generateNodeId(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}
/**
 * 健壮的顶层标签切分器（支持 DOMParser 与嵌套栈回退）
 * 确保像 <section><p>...</p></section> 这样的嵌套卡片作为单一完整 Section 处理
 */
/**
 * 【中文修复依据】：检测 HTML 块是否为无实质正文内容的幽灵空白卡片/空节点
 * 彻底过滤掉单纯包含双引号、装饰标点、首尾空白或空 span 的无文字幽灵卡片，避免污染画纸
 */
export function isGhostEmptyNodeHtml(rawHtml) {
    if (!rawHtml || !rawHtml.trim())
        return true;
    // 含有图片、SVG动画、分割线、多媒体或表单等特殊结构，予以保留
    if (/<(?:img|svg|hr|input|table|canvas)\b/i.test(rawHtml)) {
        return false;
    }
    // 剥离 HTML 标签后获得纯文本
    const textOnly = rawHtml.replace(/<[^>]+>/g, "").trim();
    // 去除纯装饰符号（包括全半角英文/中文引号、破折号与全半角空白字符）
    const substantive = textOnly.replace(/["'“”‘’「」『』—\s]/g, "").trim();
    // 【中文修复依据】：检测是否为 [object Object] 坏节点，杜绝任何对象强转残渣（彻底根除图 1 缺陷）
    if (/\[object\s*Object\]|object\s*Object/i.test(textOnly)) {
        const withoutObject = textOnly.replace(/\[?object\s*Object\]?/gi, "").trim();
        if (withoutObject.length === 0) {
            return true;
        }
    }
    // 若去除装饰标点后无任何实质性文字，判定为幽灵空白节点
    if (substantive.length === 0) {
        return true;
    }
    // 【中文修复依据】：特殊情况防御，若为大双引号引言卡片，但去除了作者署名后正文金句为空，同样判定为残缺空白卡片
    if (/Georgia,serif|line-height:\s*0\.6/i.test(rawHtml)) {
        const bodyWithoutAuthor = textOnly.replace(/——\s*[\S\s]*$/, "").replace(/["'“”‘’「」『』\s]/g, "").trim();
        if (bodyWithoutAuthor.length === 0) {
            return true;
        }
    }
    return false;
}
export function parseHtmlToWechatNodes(html) {
    if (!html || !html.trim()) {
        return [];
    }
    const trimmedRaw = html.trim();
    // 终极底线拦截：严禁将裸 JSON 元数据（如包含 account_id, file, theme 等）当作段落解析到画纸中
    if (/^\s*\{\s*["'](?:account_id|file|fileName|theme|task_id|index)["']/i.test(trimmedRaw) && !trimmedRaw.includes("<")) {
        return [];
    }
    const cleaned = html.replace(/\r?\n/g, "").replace(/\[object\s*Object\]/gi, "").trim();
    if (!cleaned)
        return [];
    // 1. 浏览器环境：优先采用原生 DOMParser 提取顶层 children
    if (typeof DOMParser !== "undefined") {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(cleaned, "text/html");
            const children = Array.from(doc.body.children).filter((el) => !isGhostEmptyNodeHtml(el.outerHTML));
            if (children.length > 0) {
                return children.map((el) => inferNodeFromHtml(el.outerHTML));
            }
        }
        catch {
            // 回退到状态机算法切分
        }
    }
    // 2. 纯 Node / 无 DOM 环境：基于顶层标签栈的精准状态机切分
    const blocks = [];
    const tagPattern = /<\/?([a-zA-Z0-9]+)\b[^>]*>/g;
    let match;
    let depth = 0;
    let blockStart = -1;
    let currentTopTag = "";
    while ((match = tagPattern.exec(cleaned)) !== null) {
        const fullTag = match[0];
        const tagName = match[1].toLowerCase();
        const isClosing = fullTag.startsWith("</");
        const isSelfClosing = fullTag.endsWith("/>") || ["img", "br", "hr", "input"].includes(tagName);
        if (depth === 0) {
            if (!isClosing) {
                blockStart = match.index;
                currentTopTag = tagName;
                if (!isSelfClosing) {
                    depth = 1;
                }
                else {
                    blocks.push(cleaned.slice(blockStart, tagPattern.lastIndex));
                    blockStart = -1;
                }
            }
        }
        else {
            if (tagName === currentTopTag) {
                if (isClosing) {
                    depth--;
                    if (depth === 0) {
                        blocks.push(cleaned.slice(blockStart, tagPattern.lastIndex));
                        blockStart = -1;
                        currentTopTag = "";
                    }
                }
                else if (!isSelfClosing) {
                    depth++;
                }
            }
        }
    }
    if (blocks.length === 0) {
        return [
            {
                id: generateNodeId("sec_p"),
                type: "p",
                label: "正文段落",
                rawHtml: `<p style="margin:0 0 14px;font-size:14px;line-height:1.8;color:#374151;text-indent:2em;"><span leaf="">${cleaned}</span></p>`,
                props: { text: cleaned },
            },
        ];
    }
    const validBlocks = blocks.filter((raw) => !isGhostEmptyNodeHtml(raw));
    return validBlocks.map((raw) => inferNodeFromHtml(raw));
}
/**
 * 依据 HTML 片段特征推断节点类型并生成结构化 Section
 * 遵循现代独立出版物与瑞士平面标准，纯中立学术与编辑标签，绝无彩色 Emoji 与八股方括号
 */
function inferNodeFromHtml(rawHtml) {
    // 1. 跑马灯 SVG
    if (/<svg\b[^>]*>[\s\S]*?animateTransform[\s\S]*?<\/svg>/i.test(rawHtml)) {
        return {
            id: generateNodeId("sec_svg_marquee"),
            type: "svg_marquee",
            label: "轮播动效",
            rawHtml,
            props: {},
        };
    }
    // 1.1 节日专属定制标
    if (/新春大吉|元宵喜乐|烟雨清明|致敬劳动者|端午安康|中秋团圆|盛世华诞|师恩难忘|九九重阳|冬至大如年/i.test(rawHtml)) {
        return {
            id: generateNodeId("sec_fest"),
            type: "festival_banner",
            label: "节日标",
            rawHtml,
            props: {},
        };
    }
    // 1.2 问答对话气泡
    if (/>Q<.*>A</s.test(rawHtml) || /Q&amp;A|问答/i.test(rawHtml)) {
        return {
            id: generateNodeId("sec_qa"),
            type: "qa_bubble",
            label: "问答气泡",
            rawHtml,
            props: {},
        };
    }
    // 1.3 备忘清单卡
    if (/☑️|清单备忘|重点检查清单|关键自查基线|自查清单|打勾清单/i.test(rawHtml)) {
        return {
            id: generateNodeId("sec_check"),
            type: "checklist_box",
            label: "备忘清单",
            rawHtml,
            props: {},
        };
    }
    // 1.4 正反思辨对比卡
    if (/常见偏差|实践规范|认知辨析与实践规范/i.test(rawHtml)) {
        return {
            id: generateNodeId("sec_versus"),
            type: "versus_card",
            label: "思辨对比",
            rawHtml,
            props: {},
        };
    }
    // 1.5 避坑警示卡
    if (/要点提示与警示|避坑特别提醒|避坑提醒/i.test(rawHtml)) {
        return {
            id: generateNodeId("sec_warning"),
            type: "warning_card",
            label: "避坑警示",
            rawHtml,
            props: {},
        };
    }
    // 2. 经典开篇首字下沉段落 (Editorial Drop Cap)
    if (/float:\s*left[^>]*font-size:\s*44px/i.test(rawHtml)) {
        return {
            id: generateNodeId("sec_drop_cap"),
            type: "drop_cap",
            label: "首字放大",
            rawHtml,
            props: {},
        };
    }
    // 3. 古典双栏发丝线思辨对比 (Two-Column Discourse)
    if (/01 \/ 惯性假设路径|02 \/ 现实约束重构/i.test(rawHtml)) {
        return {
            id: generateNodeId("sec_discourse"),
            type: "double_column",
            label: "左右对比",
            rawHtml,
            props: {},
        };
    }
    // 4. 瑞士平面大字基线指标 (Swiss Baseline Metrics)
    if (/AVAILABILITY BASELINE|COLD-START GAIN|99.95/i.test(rawHtml)) {
        return {
            id: generateNodeId("sec_swiss_metric"),
            type: "swiss_metrics",
            label: "核心数据",
            rawHtml,
            props: {},
        };
    }
    // 5. 专刊侧边单规标尺旁注 (Marginalia)
    if (/NOTEBOOK ｜ 现场观察手记/i.test(rawHtml)) {
        return {
            id: generateNodeId("sec_marginalia"),
            type: "marginalia",
            label: "竖线强调",
            rawHtml,
            props: {},
        };
    }
    // 5.1 经典大双引号金句卡 / 导语卡
    if (/(?:Georgia,serif|line-height:\s*0\.6)[\s\S]*?["“”]/i.test(rawHtml) || /margin:\s*14px 0;background:\s*#ffffff/i.test(rawHtml)) {
        const textOnly = rawHtml.replace(/<[^>]+>/g, "").trim();
        const substantive = textOnly.replace(/["'“”‘’「」『』—\s]/g, "").trim();
        if (substantive.length > 0) {
            return {
                id: generateNodeId("sec_intro_quote"),
                type: "intro_card",
                label: "金句引用",
                rawHtml,
                props: { text: textOnly },
            };
        }
    }
    // 6. 编者现场手记微引言 (Editor's Notebook)
    if (/EDITOR'S DISPATCH/i.test(rawHtml)) {
        return {
            id: generateNodeId("sec_editor_note"),
            type: "editor_note",
            label: "金句引用",
            rawHtml,
            props: {},
        };
    }
    // 7. 工匠专著阶段演进纪要 (Monograph Sequence)
    if (/STEP\. 01.*STEP\. 02/i.test(rawHtml)) {
        return {
            id: generateNodeId("sec_sequence"),
            type: "sequence_steps",
            label: "步骤流程",
            rawHtml,
            props: {},
        };
    }
    // 8. 书籍扉页式出版致谢 (Colophon)
    if (/COLOPHON ｜ 刊印手记|若有所感 · 不妨静心分享/i.test(rawHtml)) {
        return {
            id: generateNodeId("sec_colophon"),
            type: "colophon",
            label: "文末落款",
            rawHtml,
            props: {},
        };
    }
    // 9. 报刊专栏大标题 (Kicker & Headline)
    if (/PERSPECTIVE ｜/i.test(rawHtml)) {
        return {
            id: generateNodeId("sec_h2"),
            type: "h2",
            label: "主标题",
            rawHtml,
            props: { text: rawHtml.replace(/<[^>]+>/g, "").trim() },
        };
    }
    // 10. 纯手势横向滑动画廊
    if (/overflow-x:\s*auto/i.test(rawHtml) && /scroll-snap-type/i.test(rawHtml)) {
        return {
            id: generateNodeId("sec_carousel"),
            type: "carousel",
            label: "滑动画廊",
            rawHtml,
            props: {},
        };
    }
    // 11. 全景无缝拼接长图
    if (/<img\b[^>]*>/i.test(rawHtml) && !rawHtml.includes("__BRAND_")) {
        const isSingleImage = (rawHtml.match(/<img\b/gi) || []).length === 1;
        if (isSingleImage) {
            return {
                id: generateNodeId("sec_img"),
                type: "image_card",
                label: "插图展示",
                rawHtml,
                props: {},
            };
        }
    }
    // 12. 通用章节大标题
    if (/<(?:h[1-6]|p)[^>]*font-weight:\s*(?:bold|700|800|900)[^>]*>/i.test(rawHtml)) {
        const textOnly = rawHtml.replace(/<[^>]+>/g, "").trim();
        // 【中文修复依据】：去除纯装饰标点与空白后有效字符数必须 >= 2，杜绝纯标点或空内容被误判为“主标题”
        const substantive = textOnly.replace(/["'“”‘’「」『』—\s]/g, "").trim();
        if (substantive.length >= 2 && textOnly.length < 60) {
            return {
                id: generateNodeId("sec_h2"),
                type: "h2",
                label: "主标题",
                rawHtml,
                props: { text: textOnly },
            };
        }
    }
    // 默认：常规正文段落
    return {
        id: generateNodeId("sec_custom"),
        type: "p",
        label: "正文段落",
        rawHtml,
        props: {},
    };
}
/**
 * 将结构化 Section 节点列表编译为符合微信排版规范的单行零换行 HTML
 */
export function compileWechatNodesToHtml(nodes, _themeKey = "wenying") {
    if (!nodes || nodes.length === 0) {
        return "";
    }
    const parts = nodes.map((node) => {
        if (node.rawHtml) {
            return node.rawHtml.replace(/\r?\n/g, "").trim();
        }
        return "";
    });
    return parts.filter(Boolean).join("");
}
/**
 * 快捷替换节点中的颜色变量（用于一键换肤/调色盘）
 */
export function applyThemeToNodeHtml(rawHtml, targetThemeKey) {
    const theme = WECHAT_THEMES[targetThemeKey] ?? WECHAT_THEMES["wenying"];
    if (!rawHtml || !theme)
        return rawHtml;
    let updated = rawHtml;
    const knownThemeMains = ["#991B1B", "#1e1f23", "#3F3F46", "#065F46", "#374151", "#52525B", "#059669", "#4A5D52", "#DC2626"];
    for (const oldMain of knownThemeMains) {
        if (oldMain.toLowerCase() !== theme.main.toLowerCase()) {
            updated = updated.replace(new RegExp(oldMain, "gi"), theme.main);
        }
    }
    return updated;
}
export { extractImagesFromHtml, replaceImagesInHtmlByOrder } from "./wechatImageReplacer.js";
//# sourceMappingURL=wechatHtmlAstBridge.js.map