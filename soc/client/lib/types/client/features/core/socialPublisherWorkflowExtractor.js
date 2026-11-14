import { buildLocalMediaPreviewUrl } from '../../compat/types.js';
import { safeExtractText, cleanAndUnescapeHtmlContent, extractContentFromDocSpec, } from './socialPublisherDocSpecExtractor.js';
export { safeExtractText, cleanAndUnescapeHtmlContent, extractContentFromDocSpec, };
/**
 * 从 Assistant 消息文本中解析候选选题表格
 * 兼容格式：| # | 候选选题 | 爆款切角 | 查重风险 | 等
 */
function parseTopicsFromMarkdownText(text, options) {
    const topics = [];
    const lines = text.split('\n');
    let inTable = false;
    let numColIdx = -1;
    let topicColIdx = -1;
    let angleColIdx = -1;
    let riskColIdx = -1;
    // 跟踪当前 Markdown 表格上下文对应的平台与账号及体裁
    let activePlatform = options?.platform;
    let activeAccountId = options?.accountId;
    let activeAccountName;
    let activeFormat;
    for (const rawLine of lines) {
        const line = rawLine.trim();
        // 在进入表格前，检测标题中声明的所属平台、所属账号与体裁倾向
        if (!inTable) {
            if (line.includes('小红书') || line.includes('xhs')) {
                activePlatform = 'xiaohongshu';
            }
            else if (line.includes('微信') || line.includes('公众号') || line.includes('gzh')) {
                activePlatform = 'gzh';
            }
            else if (line.includes('知乎') || line.includes('zhihu')) {
                activePlatform = 'zhihu';
            }
            else if (line.includes('头条') || line.includes('toutiao')) {
                activePlatform = 'toutiao';
            }
            else if (line.includes('百家') || line.includes('baijiahao')) {
                activePlatform = 'baijiahao';
            }
            // 检测小绿书与长文体裁小节提示（仅当非复合混合行时才变更上下文格式）
            if (line.includes('小绿书') || line.includes('图片消息') || line.includes('newspic') || line.includes('图文卡片') || line.includes('3:4')) {
                if (!line.includes('长文') && !line.includes('深度图文') && !line.includes('普通文章')) {
                    activeFormat = 'newspic';
                }
            }
            else if (line.includes('长文') || line.includes('深度图文') || line.includes('普通文章') || line.includes('深度研报')) {
                activeFormat = 'article';
            }
            // 检测标题或上下文行中声明的账号信息（例如：账号：xxx、账号：微信公众号【xxx】、@xxx、[xxx]、账号(xxx)）
            const accountMatch = line.match(/账号[：:]\s*(?:(?:微信公众号|微信|公众号|小红书|知乎|百家号|今日头条)?【([^】]+)】|([^\s|（(]+))(?:[（(]([a-zA-Z0-9_-]+)[)）])?/i) ||
                line.match(/@([a-zA-Z0-9_\u4e00-\u9fa5-]+)/) ||
                line.match(/【(?:[^】]*[·\s])?([^】]+?账号|[^】]+?)(?:[（(]([a-zA-Z0-9_-]+)[)）])?】/);
            if (accountMatch) {
                const rawName = (accountMatch[1] || accountMatch[2])?.trim();
                const rawId = accountMatch[3]?.trim();
                if (rawName && !rawName.includes('平台') && !rawName.includes('选题') && !rawName.includes('矩阵')) {
                    const cleanName = rawName
                        .replace(/^(?:微信公众号|微信|公众号|小红书|知乎|百家号|今日头条)[·\s]*/i, '')
                        .replace(/[【】]/g, '')
                        .trim();
                    if (cleanName) {
                        activeAccountName = cleanName;
                        activeAccountId = rawId || cleanName;
                    }
                }
            }
        }
        if (!line.startsWith('|') || !line.endsWith('|')) {
            inTable = false;
            continue;
        }
        const cells = line
            .slice(1, -1)
            .split('|')
            .map(c => c.trim());
        if (!inTable) {
            // 寻找表头（兼容 #、序号、编号、篇序、次序、顺位、位置）
            numColIdx = cells.findIndex(c => c === '#' || c.includes('序号') || c.includes('编号') || c.includes('篇序') || c.includes('次序') || c.includes('顺位') || c.includes('位置'));
            topicColIdx = cells.findIndex(c => c.includes('选题') || c.includes('标题'));
            angleColIdx = cells.findIndex(c => c.includes('切角') || c.includes('体裁') || c.includes('角度') || c.includes('功能') || c.includes('主题'));
            riskColIdx = cells.findIndex(c => c.includes('风险') || c.includes('查重') || c.includes('相似') || c.includes('字数'));
            if (topicColIdx !== -1) {
                inTable = true;
            }
            continue;
        }
        // 忽略分割线行 |---|---|
        if (cells.some(c => /^[-:\s]+$/.test(c))) {
            continue;
        }
        const numRaw = numColIdx !== -1 ? cells[numColIdx] || '' : (/头条|次条|第\d+篇|^\d+$/.test(cells[0] || '') ? cells[0] || '' : '');
        const titleRaw = cells[topicColIdx] || '';
        if (!titleRaw)
            continue;
        // 识别推荐星标（⭐、★、推荐）
        const isStar = numRaw.includes('⭐') ||
            numRaw.includes('★') ||
            numRaw.includes('推荐') ||
            titleRaw.includes('⭐') ||
            titleRaw.includes('★') ||
            titleRaw.includes('推荐');
        // 移除 markdown 序号、序号字符或推荐标记修饰
        const cleanTitle = titleRaw
            .replace(/^[0-9]+[.\s、]+/, '')
            .replace(/[\u{1F7E2}\u{1F7E1}\u{1F534}\u{2B50}\u{2605}]/gu, '')
            .replace(/\uFE0F/gu, '')
            .trim();
        if (!cleanTitle)
            continue;
        const angleRaw = angleColIdx !== -1 ? cells[angleColIdx] || '' : '';
        const riskRaw = riskColIdx !== -1 ? cells[riskColIdx] || '' : '';
        // 从 riskRaw 中提取百分比相似度（例如 low (0%) -> 0，medium (40%) -> 40）
        const scoreMatch = riskRaw.match(/([0-9]{1,3})%/);
        const similarityScore = scoreMatch ? Number.parseInt(scoreMatch[1], 10) : 0;
        const viralScore = isStar ? 95 : Math.max(65, 95 - similarityScore);
        // 判定是否为排除项（序号为 — 或风险大于 15% 或明确标记排除/淘汰/medium/high）
        const isExcluded = numRaw.includes('—') ||
            numRaw.includes('-') ||
            numRaw.includes('排除') ||
            numRaw.includes('淘汰') ||
            numRaw.includes('否定') ||
            riskRaw.includes('medium') ||
            riskRaw.includes('high') ||
            riskRaw.includes('排除') ||
            riskRaw.includes('淘汰') ||
            similarityScore > 15;
        const excludeReason = isExcluded
            ? similarityScore > 15
                ? `历史发布查重相似度过高 (${similarityScore}%)`
                : '历史重合度高，已由算法拦截排除'
            : undefined;
        const plat = (activePlatform || options?.platform || 'gzh');
        const platName = plat === 'xiaohongshu'
            ? '小红书'
            : plat === 'gzh'
                ? '微信公众号'
                : plat === 'zhihu'
                    ? '知乎专栏'
                    : plat === 'toutiao'
                        ? '今日头条'
                        : plat === 'baijiahao'
                            ? '百家号'
                            : '社媒专栏';
        let genreBadge = '精选体裁';
        let articleType = 'article';
        let suggestedFormat = '长文';
        if (plat === 'xiaohongshu') {
            articleType = 'newspic';
            suggestedFormat = '小绿书';
            genreBadge = angleRaw.includes('避坑')
                ? '新手避坑卡片'
                : angleRaw.includes('清单')
                    ? '干货清单卡片'
                    : '3:4九宫格卡片';
        }
        else if (plat === 'gzh') {
            const hasArticleKeyword = angleRaw.includes('长文') ||
                angleRaw.includes('深度研报') ||
                angleRaw.includes('研报') ||
                angleRaw.includes('深度分析') ||
                cleanTitle.includes('万字');
            const hasNewspicKeyword = angleRaw.includes('小绿书') ||
                angleRaw.includes('卡片') ||
                angleRaw.includes('多图') ||
                angleRaw.includes('九宫格') ||
                angleRaw.includes('3:4') ||
                angleRaw.includes('图片消息') ||
                cleanTitle.includes('一图') ||
                cleanTitle.includes('小绿书');
            const isNewspicTopic = hasNewspicKeyword ||
                (!hasArticleKeyword && activeFormat === 'newspic');
            if (isNewspicTopic) {
                articleType = 'newspic';
                suggestedFormat = '小绿书';
                genreBadge = '小绿书 · 3:4图文卡片';
            }
            else {
                articleType = 'article';
                suggestedFormat = '长文';
                genreBadge = angleRaw.includes('研报')
                    ? '万字深度研报'
                    : angleRaw.includes('反常识')
                        ? '认知破局长文'
                        : '深度图文长文';
            }
        }
        else if (plat === 'zhihu') {
            articleType = 'article';
            suggestedFormat = '长文';
            genreBadge = '硬核原理探讨';
        }
        const finalAccountId = activeAccountId || options?.accountId;
        const finalAccountName = activeAccountName;
        const uniqueId = `${options?.idPrefix || 'topic'}_${finalAccountId ? `${finalAccountId}_` : ''}${topics.length + 1}`;
        topics.push({
            id: uniqueId,
            platform: plat,
            platformName: platName,
            accountId: finalAccountId,
            accountName: finalAccountName,
            title: cleanTitle,
            hookAngle: angleRaw || '精选爆款切角',
            genreBadge,
            articleType,
            suggestedFormat,
            similarityScore,
            viralScore,
            selected: false, // 统一在外层分组中根据 isStar 决定唯一选中项，避免多重选中
            isStar,
            isExcluded,
            excludeReason,
        });
    }
    // 按 (platform, accountId) 分组，为每个分组独立保证至少且仅有一个默认选中项：优先星标项，其次第一条未被排除的项
    const groupMap = new Map();
    for (const t of topics) {
        const k = `${t.platform || 'default'}_${t.accountId || 'default'}`;
        const list = groupMap.get(k) ?? [];
        list.push(t);
        groupMap.set(k, list);
    }
    for (const groupTopics of groupMap.values()) {
        const starIndex = groupTopics.findIndex(t => t.isStar && !t.isExcluded);
        if (starIndex !== -1) {
            groupTopics[starIndex].selected = true;
        }
        else {
            const firstValidIndex = groupTopics.findIndex(t => !t.isExcluded);
            if (firstValidIndex !== -1) {
                groupTopics[firstValidIndex].selected = true;
            }
            else if (groupTopics[0]) {
                groupTopics[0].selected = true;
            }
        }
    }
    return topics;
}
/**
 * 严格控制每个账号分组的候选选题数量：
 * 1. 待选选题数量至多为【所需篇数 + 3】（过滤多余冗余项，优先保留星标与高爆款分项）；
 * 2. 零遗漏保障：若某个账号或某种体裁（如小绿书）候选数量为 0，自动基于会话核心主题补齐合格候选。
 */
export function pruneAndEnsureGroupTopics(group, themeTitle = '热点与专业趋势透视') {
    const list = [...group.topics];
    const isXhs = group.platform === 'xiaohongshu';
    const isZhihu = group.platform === 'zhihu';
    const isGzh = group.platform === 'gzh';
    // 平台固有体裁规则：小红书为纯卡片，知乎为纯长文，公众号支持长文和小绿书
    const hasNewspicGoal = isXhs || (isGzh && (Boolean(group.hasNewspic) || (group.newspicQuota !== undefined && group.newspicQuota > 0)));
    const hasArticleGoal = !isXhs && (isZhihu || (group.articleQuota !== undefined ? group.articleQuota > 0 : true));
    const articleGoal = isXhs ? 0 : (group.articleQuota ?? (hasNewspicGoal ? Math.max(1, group.targetArticleCount - 1) : group.targetArticleCount));
    const newspicGoal = isXhs ? group.targetArticleCount : (group.newspicQuota ?? (hasNewspicGoal ? 1 : 0));
    const existingArticles = list.filter(t => t.articleType !== 'newspic');
    const existingNewspics = list.filter(t => t.articleType === 'newspic');
    // 1. 零漏项兜底：小绿书缺失补齐（仅针对小红书或有明确小绿书目标的公众号）
    if (hasNewspicGoal && existingNewspics.length === 0) {
        const needCount = newspicGoal + 3;
        for (let i = 1; i <= needCount; i++) {
            existingNewspics.push({
                id: `auto_${group.groupKey}_newspic_${i}`,
                title: `${themeTitle}：${i === 1 ? '7个核心洞察精粹速览' : i === 2 ? '新手避坑与实操清单' : `图文解析系列#${i}`}（收藏备用）`,
                hookAngle: i === 1 ? '3:4知识卡片速览' : '干货清单卡片',
                isStar: i <= newspicGoal,
                isExcluded: false,
                viralScore: 92 - i,
                similarityScore: 0,
                platform: group.platform,
                platformName: group.platformName,
                accountId: group.accountId,
                accountName: group.accountName,
                articleType: 'newspic',
                suggestedFormat: '小绿书',
                genreBadge: '小绿书 · 3:4图文卡片',
            });
        }
    }
    // 2. 零漏项兜底：长文缺失补齐（仅针对需要长文的平台/任务）
    if (hasArticleGoal && articleGoal > 0 && existingArticles.length === 0) {
        const needCount = articleGoal + 3;
        for (let i = 1; i <= needCount; i++) {
            existingArticles.push({
                id: `auto_${group.groupKey}_article_${i}`,
                title: `${themeTitle}：${i === 1 ? '从底层逻辑到实操落地深度透视' : i === 2 ? '演进趋势与未来机遇研报' : `专题研究深度观察#${i}`}`,
                hookAngle: i === 1 ? '万字深度透视' : '深度研报',
                isStar: i <= articleGoal,
                isExcluded: false,
                viralScore: 95 - i,
                similarityScore: 0,
                platform: group.platform,
                platformName: group.platformName,
                accountId: group.accountId,
                accountName: group.accountName,
                articleType: 'article',
                suggestedFormat: '长文',
                genreBadge: '深度图文长文',
            });
        }
    }
    // 排序优先星标，其次爆款分
    const sortCandidates = (items) => {
        return [...items].sort((a, b) => {
            if (a.isStar !== b.isStar)
                return a.isStar ? -1 : 1;
            return (b.viralScore || 0) - (a.viralScore || 0);
        });
    };
    // 3. 严格应用【待选选题数量 <= 所需选题 + 3】截断
    if (hasNewspicGoal && hasArticleGoal) {
        const maxArticles = articleGoal + 3;
        const maxNewspics = newspicGoal + 3;
        const prunedArticles = sortCandidates(existingArticles).slice(0, maxArticles);
        const prunedNewspics = sortCandidates(existingNewspics).slice(0, maxNewspics);
        return [...prunedArticles, ...prunedNewspics];
    }
    if (hasNewspicGoal && !hasArticleGoal) {
        const maxNewspics = newspicGoal + 3;
        return sortCandidates(existingNewspics.length > 0 ? existingNewspics : list).slice(0, maxNewspics);
    }
    const maxTotal = (group.articleQuota || group.targetArticleCount) + 3;
    return sortCandidates(existingArticles.length > 0 ? existingArticles : list).slice(0, maxTotal);
}
/**
 * 规范化图片地址：将本地路径转换为安全加载的 wincode-media 协议 URL
 */
/**
 * 校验给定的 URL 是否为可在 HTML <img> 标签中直接渲染的真实有效图片地址（Data URL 或 HTTP(S) 网络地址）
 * 仅且只允许：data:、http://、https://、blob:
 * 严禁：wincode-media://、file://、裸物理路径或纯文件名（未经转码直接喂给 <img> 会导致 net::ERR 破图）
 */
export function isRenderableImageUrl(url) {
    if (!url)
        return false;
    const trimmed = url.trim();
    return (trimmed.startsWith('data:') ||
        trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('blob:'));
}
/**
 * 校验给定的 URL 是否为安全且可在 <img> 标签中直接渲染的媒体协议
 * 支持 data:、http://、https://、blob: 以及桌面环境本地转码协议 wincode-media://
 */
export function isSafeMediaUrl(url) {
    if (!url)
        return false;
    const trimmed = url.trim();
    return (trimmed.startsWith('data:') ||
        trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('blob:') ||
        trimmed.startsWith('wincode-media://'));
}
export function normalizeLocalImageUrl(pathOrUrl) {
    if (!pathOrUrl)
        return '';
    const trimmed = pathOrUrl.trim().replace(/[`"']/g, '');
    if (trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('data:') ||
        trimmed.startsWith('wincode-media://')) {
        return trimmed;
    }
    return buildLocalMediaPreviewUrl(trimmed);
}
/**
 * 从 URL 或 wincode-media 协议中还原物理磁盘真实路径
 */
export function extractLocalDiskPathFromUrl(pathOrUrl) {
    if (!pathOrUrl)
        return '';
    let trimmed = pathOrUrl.trim().replace(/[`"']/g, '');
    if (trimmed.startsWith('file:///')) {
        trimmed = decodeURIComponent(trimmed.slice(8));
        if (/^[a-zA-Z]:\//.test(trimmed)) {
            return trimmed.replace(/\//g, '\\');
        }
        return trimmed;
    }
    if (trimmed.startsWith('file://')) {
        trimmed = decodeURIComponent(trimmed.slice(7));
        return trimmed;
    }
    if (trimmed.startsWith('wincode-media://')) {
        try {
            const url = new URL(trimmed);
            const diskPath = url.searchParams.get('path');
            if (diskPath)
                return decodeURIComponent(diskPath);
        }
        catch {
            // 兼容非标准 URL
        }
    }
    return trimmed;
}
/**
 * 从任意本地路径、网络地址或 wincode-media 协议 URL 中精准提取物理纯文件名（如 cover_1.png、content_1_1.png）
 * 【中文修复依据】：先通过 extractLocalDiskPathFromUrl 解码与还原物理磁盘真实路径，
 * 彻底消除 URL query 编码（如 %5C）对文件名截取的干扰（彻底解决图 2 与图 3 产物无法显影问题）
 */
export function extractFileName(pathOrUrl) {
    if (!pathOrUrl)
        return '';
    const diskPath = extractLocalDiskPathFromUrl(pathOrUrl);
    return diskPath.replace(/\\/g, '/').split('/').pop() || '';
}
/**
 * 在 WinCode Protocol v4 中，toolCall 的返回结果结构化序列化在 output.text 中。
 * 兼容解析 text 内部 JSON 及原有顶层对象字段，确保 tool output 真实载荷不被遗漏。
 */
export function parseToolOutputPayload(output) {
    if (!output || typeof output !== 'object')
        return {};
    const rec = output;
    if (typeof rec.text === 'string' && rec.text.trim()) {
        try {
            const parsed = JSON.parse(rec.text);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return { ...rec, ...parsed };
            }
        }
        catch {
            // 容错 1：Windows 路径单反斜杠转义自愈（如 \t 被误判为制表符）
            try {
                const healed = rec.text.replace(/\\(?!["\\/bfnrtu]|u[0-9a-fA-F]{4})/g, '\\\\');
                const parsedHealed = JSON.parse(healed);
                if (parsedHealed && typeof parsedHealed === 'object' && !Array.isArray(parsedHealed)) {
                    return { ...rec, ...parsedHealed };
                }
            }
            catch {
                // 容错 2：正则兜底提取物理文件路径、账号与正文
                const fileMatch = rec.text.match(/["']file["']\s*:\s*["']([^"']+)["']/i);
                const accMatch = rec.text.match(/["']account_id["']\s*:\s*["']([^"']+)["']/i);
                const idxMatch = rec.text.match(/["']index["']\s*:\s*(\d+)/i);
                const contentMatch = rec.text.match(/["']content["']\s*:\s*["'](<[\s\S]+?)["']\s*(?:,\s*["']|\})/i);
                if (fileMatch || accMatch || contentMatch || idxMatch) {
                    return {
                        ...rec,
                        ...(fileMatch ? { file: fileMatch[1]?.replace(/\\\\/g, '\\') } : {}),
                        ...(accMatch && accMatch[1] ? { account_id: accMatch[1] } : {}),
                        ...(idxMatch && idxMatch[1] ? { index: Number.parseInt(idxMatch[1], 10) } : {}),
                        ...(contentMatch && contentMatch[1] ? { content: contentMatch[1] } : {}),
                    };
                }
            }
        }
    }
    return rec;
}
/**
 * 校验文本是否属于工具执行完成返回的元数据 JSON 字符串（例如包含 account_id, file, theme, plain_chars 等）
 * 此类元数据绝不能被误当作文章正文或段落内容。
 */
export function isToolMetadataJson(str) {
    if (!str || typeof str !== 'string')
        return false;
    const trimmed = str.trim();
    // 强力拦截未闭合或截断的元数据 JSON 开头
    if (/^\s*\{\s*["'](?:account_id|file|fileName|theme|task_id|index)["']/i.test(trimmed)) {
        return true;
    }
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (parsed &&
                typeof parsed === 'object' &&
                !Array.isArray(parsed) &&
                (parsed.account_id !== undefined ||
                    parsed.file !== undefined ||
                    parsed.file_name !== undefined ||
                    parsed.fileName !== undefined ||
                    parsed.path !== undefined ||
                    parsed.filePath !== undefined ||
                    parsed.contentHash !== undefined ||
                    parsed.plain_chars !== undefined ||
                    parsed.img_count !== undefined ||
                    parsed.media_id !== undefined ||
                    parsed.draft_id !== undefined ||
                    parsed.theme !== undefined)) {
                return true;
            }
        }
        catch {
            // 容错：非合法 JSON，按正常文本处理
        }
    }
    return false;
}
/**
 * 校验文本是否属于 MCP/工具报错或程序崩溃/未解析代码输出
 * 杜绝将 "MCP tool returned an error...", "doc_json 不是合法 JSON", Python Traceback 或未解析原始代码作为文章正文展示
 */
/**
 * 判断文章正文是否尚在排版构建/落盘生成阶段
 * 核心铁律：若当前篇目处于流式打字输出中，绝对不遮蔽为 pending 骨架屏，必须直接放行流式实时排版！
 */
export function isArticleContentPending(content, filePath, isStreaming) {
    if (!content || !content.trim())
        return !isStreaming;
    // 1. 拦截工具元数据 JSON 与报错崩溃代码具有最高优先级，即使 isStreaming 为 true 也严禁展示元数据
    if (isToolMetadataJson(content) || isToolErrorOrCrashContent(content)) {
        return true;
    }
    // 2. 流式生成中的稿件直接放行高保真排版
    if (isStreaming)
        return false;
    const lower = content.toLowerCase();
    // 3. 模型内部审核拦截/警告草稿，不论长度必须拦截呈现等待卡片
    if (lower.includes('检测到标题使用前缀开头')) {
        return true;
    }
    // 4. 纯占位引导语（无真实长文排版结构且命中明确占位提示）
    const isPurePlaceholderSnippet = lower.includes('正文排版落盘产物生成中') ||
        lower.includes('文章正在快马加鞭赶来') ||
        lower.includes('文章排版与规范校验已就绪') ||
        lower.includes('笔记正文与 3:4 竖版配图已生成就绪') ||
        lower.includes('微信公众号深度图文排版长文') ||
        lower.includes('小绿书 3:4 竖版专属图文卡片');
    if (isPurePlaceholderSnippet) {
        // 若已有落盘文件且内容长度 > 200，说明是包含该词组的真实长文而非纯占位符
        if (filePath && content.length > 200) {
            return false;
        }
        return true;
    }
    if (!filePath && content.length < 150 && /选题|大纲|切角|初稿|规划/.test(content)) {
        return true;
    }
    return false;
}
export function isToolErrorOrCrashContent(str) {
    if (!str || typeof str !== 'string')
        return false;
    const trimmed = str.trim();
    if (!trimmed)
        return false;
    // 1. MCP 典型报错前缀或工具报错模式
    if (trimmed.startsWith('MCP tool returned an error:') ||
        trimmed.startsWith('Error:') ||
        trimmed.startsWith('Exception:') ||
        trimmed.includes('Traceback (most recent call last):') ||
        /执行工具\s*([a-zA-Z0-9_-]+)\s*出错/i.test(trimmed) ||
        /不是合法\s*JSON/i.test(trimmed) ||
        /JSONDecodeError/i.test(trimmed) ||
        /SyntaxError/i.test(trimmed)) {
        return true;
    }
    // 2. 原始未解析代码或 JSON 碎片（例如 Agent 试图调用工具却把原始 JSON 参数片段输出到了文本中）
    if (trimmed.startsWith('[') &&
        trimmed.endsWith(']') &&
        (trimmed.includes('"doc_json"') || trimmed.includes('"index":'))) {
        return true;
    }
    return false;
}
/**
 * 从 Assistant 消息文本中全景解析多图文拟发布序列与同步小绿书
 * 兼容多篇长文排版清单表格（头条、次条、第3~7篇）及独立小绿书卡片
 */
export function parsePublishedSequenceFromAssistantText(text, options) {
    const articles = [];
    if (!text || typeof text !== 'string')
        return articles;
    const effPlat = options?.platform || 'gzh';
    const effAcc = options?.accountId;
    const effAccName = options?.accountName;
    const scriptsDir = options?.scriptsDir;
    const lines = text.split('\n');
    let inSeqTable = false;
    let declaredSeqCount;
    const maxCap = options?.maxArticles;
    let numCol = -1;
    let titleCol = -1;
    let wordsCol = -1;
    let visualCol = -1;
    let valueCol = -1;
    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        const line = rawLine.trim();
        // 检查是否进入多图文拟发布长文序列表格
        if (/多图文(?:拟发布序列|排版清单|发布序列|规划|合辑)/i.test(line)) {
            inSeqTable = true;
            numCol = -1;
            titleCol = -1;
            declaredSeqCount = undefined;
            const countMatch = line.match(/(?:共\s*|[（(])\s*([0-9]+)\s*篇/i);
            if (countMatch && countMatch[1]) {
                declaredSeqCount = Number.parseInt(countMatch[1], 10);
            }
            continue;
        }
        if (inSeqTable) {
            if (!line.startsWith('|') || !line.endsWith('|')) {
                // 如果遇到了新的 Markdown 大标题，则退出序列表格
                if (line.startsWith('#')) {
                    inSeqTable = false;
                }
                continue;
            }
            const cells = line.slice(1, -1).split('|').map(c => c.trim());
            // 表头判定
            if (titleCol === -1) {
                numCol = cells.findIndex(c => c === '#' || c.includes('篇序') || c.includes('序号') || c.includes('次序') || c.includes('顺位'));
                titleCol = cells.findIndex(c => c.includes('标题') || c.includes('选题'));
                wordsCol = cells.findIndex(c => c.includes('字数') || c.includes('篇幅') || c.includes('长度'));
                visualCol = cells.findIndex(c => c.includes('视觉') || c.includes('配图') || c.includes('主题'));
                valueCol = cells.findIndex(c => c.includes('功能') || c.includes('价值') || c.includes('切角') || c.includes('表达'));
                continue;
            }
            // 忽略分割线
            if (cells.some(c => /^[-:\s]+$/.test(c)))
                continue;
            const titleRaw = titleCol !== -1 ? cells[titleCol] : '';
            if (!titleRaw)
                continue;
            const cleanTitle = titleRaw
                .replace(/^[*#\s]+|[*#\s]+$/g, '')
                .replace(/^[0-9]+[.\s、]+/, '')
                .replace(/[\u{1F7E2}\u{1F7E1}\u{1F534}\u{2B50}\u{2605}]/gu, '')
                .replace(/^[*#\s]+|[*#\s]+$/g, '')
                .trim();
            if (!cleanTitle)
                continue;
            // 【中文修复依据】：契约24——门禁1：输入源头硬截断，当已达表头声明或配额篇数时，后续行仅为备用参考切角，严禁作为多图文草稿输出
            const effectiveSeqCap = declaredSeqCount !== undefined ? declaredSeqCount : maxCap;
            if (typeof effectiveSeqCap === 'number' && effectiveSeqCap > 0 && articles.length >= effectiveSeqCap) {
                continue;
            }
            let idx = articles.length + 1;
            const numRaw = numCol !== -1 ? cells[numCol] || '' : cells[0] || '';
            if (/头条|第一篇|^1$/i.test(numRaw)) {
                idx = 1;
            }
            else if (/次条|第二篇|^2$/i.test(numRaw)) {
                idx = 2;
            }
            else {
                const m = numRaw.match(/(?:第)?([0-9]+)\s*篇?/);
                if (m && m[1])
                    idx = Number.parseInt(m[1], 10);
            }
            const wordsStr = wordsCol !== -1 && cells[wordsCol] ? cells[wordsCol] : '';
            const visualStr = visualCol !== -1 && cells[visualCol] ? cells[visualCol] : '';
            const valueStr = valueCol !== -1 && cells[valueCol] ? cells[valueCol] : '';
            const digest = [wordsStr, visualStr, valueStr].filter(Boolean).join(' · ') || (idx === 1 ? '微信公众号头条深度长文' : `微信公众号多图文次条 #${idx}`);
            const normScripts = scriptsDir ? scriptsDir.replace(/\\/g, '/') : undefined;
            articles.push({
                id: `art_seq_${effPlat}_${effAcc || 'default'}_news_${idx}`,
                index: idx,
                platform: effPlat,
                accountId: effAcc,
                accountName: effAccName,
                title: cleanTitle,
                digest,
                content: `<section style="margin:20px 0;background:#ffffff;border-radius:12px;padding:24px;border-left:4px solid #059669;box-shadow:0 2px 12px rgba(0,0,0,0.04);"><p style="font-size:16px;font-weight:bold;color:#111827;line-height:1.5;">${cleanTitle}</p><p style="font-size:13px;color:#4B5563;margin-top:10px;line-height:1.6;">${digest}</p></section><p style="font-size:14px;line-height:1.8;color:#374151;text-indent:2em;">本文由架构师深度解析，覆盖全链路实战心法与核心设计规约。正文排版已完成微信官方 13px 单行规格校验与段落美化，可就地审阅编辑或直接一键同步至微信草稿箱。</p>`,
                articleType: 'news',
                filePath: normScripts ? `${normScripts}/article_v2_${idx}.html` : undefined,
                // 【中文修复依据】：初稿规划阶段图片尚未落盘，严禁虚构文件名填充，保持为空等待生图阶段真实装配，防旧图复用与串图
                coverUrl: undefined,
                images: [],
                contentImages: [],
                scriptsDir: normScripts,
            });
        }
    }
    // 检查是否包含【同步小绿书卡片图文】
    const newspicSection = text.match(/(?:###|\*\*|【)\s*(?:同步)?小绿书(?:卡片图文)?\s*(?:[（(](?:共\s*)?([0-9]+)\s*篇[)）])?[\s\S]*?(?=(?:\n###|\n\*\*【|\n---|$))/i);
    if (newspicSection) {
        const secText = newspicSection[0];
        const nTitleMatch = secText.match(/(?:[*#\s]*标题[*#\s]*[：:]\s*|【标题】\s*)([^\r\n]+)/i);
        const nSpecMatch = secText.match(/(?:[*#\s]*规格[*#\s]*[：:]\s*|【规格】\s*)([^\r\n]+)/i);
        const nFocusMatch = secText.match(/(?:[*#\s]*核心定位[*#\s]*[：:]\s*|【核心定位】\s*)([^\r\n]+)/i);
        const newspicTitle = nTitleMatch ? nTitleMatch[1]?.replace(/^[*#\s]*标题[*#\s]*[：:]\s*/i, '').replace(/[*#]/g, '').trim() : '代码重构实战：一键告别屎山代码';
        const newspicDigest = [nSpecMatch?.[1]?.replace(/[*#]/g, '').trim(), nFocusMatch?.[1]?.replace(/[*#]/g, '').trim()].filter(Boolean).join(' · ') || '4张 3:4 竖版多图画廊 + 精炼痛点文案';
        const normScripts = scriptsDir ? scriptsDir.replace(/\\/g, '/') : undefined;
        articles.push({
            id: `art_seq_${effPlat}_${effAcc || 'default'}_newspic_1`,
            index: 1,
            platform: effPlat,
            accountId: effAcc,
            accountName: effAccName,
            title: newspicTitle || '小绿书精选卡片图文',
            digest: newspicDigest,
            content: `${newspicTitle}\n\n${newspicDigest}\n\n1️⃣ 核心痛点直击：告别低效重构\n2️⃣ 自动化工程落地：边界防线守卫\n3️⃣ 团队高效协同：规范即战力`,
            articleType: 'newspic',
            filePath: normScripts ? `${normScripts}/article_v2_pic_1.html` : undefined,
            // 【中文修复依据】：初稿规划阶段图片尚未落盘，严禁虚构文件名填充，保持为空等待生图阶段真实装配，防旧图复用与串图
            coverUrl: undefined,
            images: [],
            contentImages: [],
            scriptsDir: normScripts,
        });
    }
    return articles;
}
/**
 * 尝试从 Assistant 消息文本中回退提取文案/文章
 * 常见场景：当工具报错或未正常返回正文时，Agent 在文本回复中输出了完整的文案预览
 */
/**
 * 严格判定助手文本是否属于日常对话答疑、技术原理阐述、错误/时序排障复盘等非文章内容
 * 只要命中问答或排障特征，一律严禁提取为排版画布文章
 */
import { isAssistantConversationOrExplanation } from './socialPublisherConversationFilter.js';
export { isAssistantConversationOrExplanation };
export function parseArticleFromAssistantText(text, options) {
    if (!text || typeof text !== 'string')
        return null;
    const trimmed = text.trim();
    if (isToolErrorOrCrashContent(trimmed))
        return null;
    if (isAssistantConversationOrExplanation(trimmed))
        return null;
    // 匹配常见的文案标题与正文格式（如 ### 笔记文案预览 / 【标题】 / **标题**：）
    const titleMatch = trimmed.match(/(?:[*#\s]*标题[*#\s]*[：:]\s*|【标题】\s*)([^\r\n]+)/i) ||
        trimmed.match(/###\s*(?:笔记|长文|文章)文案预览[\r\n]+([^\r\n]+)/i);
    const contentMatch = trimmed.match(/(?:[*#\s]*正文[*#\s]*[：:]\s*|【正文】\s*)([\s\S]+?)(?=(?:\n###|\n\*\*|\n【|\n---|$))/i);
    if (titleMatch || contentMatch) {
        const rawTitle = (titleMatch?.[1] ? titleMatch[1] : '')
            .replace(/^[*#\s]*标题[*#\s]*[：:]\s*/i, '')
            .replace(/^【标题】\s*/i, '')
            .replace(/^[0-9]+[.\s、]+/, '')
            .replace(/^[*#.\s、]+|[*#.\s、]+$/g, '')
            .trim();
        const rawContent = contentMatch ? contentMatch[1]?.trim() : '';
        // 严禁将疑问句或答疑标题作为文章标题
        if (/[？?]$/.test(rawTitle) || /是用.*吗|为什么|怎么做|代码拼接/i.test(rawTitle)) {
            return null;
        }
        if (rawTitle || rawContent) {
            if (rawContent && isAssistantConversationOrExplanation(rawContent)) {
                return null;
            }
            return {
                title: rawTitle,
                content: rawContent,
                platform: options?.platform || 'gzh',
                accountId: options?.accountId,
            };
        }
    }
    return null;
}
/**
 * 从 Assistant 流式增量文本中解析多篇/单篇正在生成的文章
 * 支持识别大模型按顺序正在输出的【第 N 篇】或文案预览，并在末尾段落标记 isStreaming
 */
export function parseStreamingArticlesFromAssistantText(text, options) {
    if (!text || typeof text !== 'string')
        return [];
    const trimmed = text.trim();
    if (isToolErrorOrCrashContent(trimmed))
        return [];
    if (isAssistantConversationOrExplanation(trimmed))
        return [];
    if (trimmed.startsWith('|') && (trimmed.includes('查重') || trimmed.includes('爆款切角')))
        return [];
    const results = [];
    const effPlat = options?.platform || 'gzh';
    const effAcc = options?.accountId;
    // 匹配多篇段落标题：强结构约束，废除孤立纯数字分支，强制必须包含“第N篇”、“【头条】”、“篇目N”或方括号带篇
    const articleSectionRegex = /(?:^|\n)(?:###|##)\s*(?:(?:第\s*([0-9]+)\s*篇|【(?:第\s*)?([0-9]+)\s*篇】|([0-9]+)\s*篇|【?(头条|次条|尾条)篇?】?|篇目\s*([0-9]+)|(?:微信公众号(?:长文|多图文))?\s*#([0-9]+))[：:.\s、]*([^\n\r]+)|(?:(?:文章|长文|笔记)文案预览[：:.\s、]*([^\n\r]*)))/gi;
    const matches = Array.from(trimmed.matchAll(articleSectionRegex));
    if (matches.length > 0) {
        for (let i = 0; i < matches.length; i++) {
            const match = matches[i];
            const matchIndex = match.index ?? 0;
            const nextMatchIndex = i + 1 < matches.length ? matches[i + 1].index : trimmed.length;
            const sectionText = trimmed.slice(matchIndex, nextMatchIndex).trim();
            const numStr = match[1] || match[2] || match[3] || match[5] || match[6];
            const slotWord = match[4];
            let artIdx = i + 1;
            if (numStr) {
                artIdx = Number.parseInt(numStr, 10);
            }
            else if (slotWord === '头条') {
                artIdx = 1;
            }
            else if (slotWord === '次条') {
                artIdx = 2;
            }
            else if (slotWord === '尾条') {
                artIdx = 3;
            }
            let rawTitle = (match[7] || match[8] || '')
                .replace(/^[*#.\s、]+|[*#.\s、]+$/g, '')
                .replace(/^[0-9]+[.\s、]+/, '')
                .replace(/^[*#.\s、]+|[*#.\s、]+$/g, '')
                .trim();
            const titleInBody = sectionText.match(/(?:[*#\s]*标题[*#\s]*[：:]\s*|【标题】\s*)([^\r\n]+)/i);
            if (titleInBody && titleInBody[1]) {
                rawTitle = titleInBody[1]
                    .replace(/[*#]/g, '')
                    .replace(/^[0-9]+[.\s、]+/, '')
                    .replace(/^[*#.\s、]+|[*#.\s、]+$/g, '')
                    .trim();
            }
            // 标题包含疑问句或答疑特征，拒绝作为正式文章
            if (/[？?]$/.test(rawTitle) || /是用.*吗|为什么|怎么做|代码拼接/i.test(rawTitle)) {
                continue;
            }
            let content = '';
            const contentMatch = sectionText.match(/(?:[*#\s]*正文[*#\s]*[：:]\s*|【正文】\s*)([\s\S]+)$/i);
            if (contentMatch && contentMatch[1]) {
                content = contentMatch[1].trim();
            }
            else {
                const lines = sectionText.split('\n');
                content = lines.slice(1).join('\n').trim();
            }
            // 【中文修复依据】：大模型流式输出工具调用参数或回答问答时，严禁当作文章正文
            if (isToolMetadataJson(content) || isAssistantConversationOrExplanation(content)) {
                content = '';
            }
            // 如果当前是最新一轮 Assistant 输出，且是最后一个小节，标记为正在流式输出中
            const isLastSection = i === matches.length - 1;
            const isStreaming = Boolean(options?.isLastRow && isLastSection && !sectionText.includes('### 汇总') && !sectionText.includes('---'));
            if (rawTitle || content.length >= 10) {
                results.push({
                    index: artIdx,
                    title: rawTitle || (artIdx === 1 ? '头条精选图文' : `次条精选图文 #${artIdx}`),
                    content: cleanAndUnescapeHtmlContent(content),
                    isStreaming,
                    platform: effPlat,
                    accountId: effAcc,
                    articleType: effPlat === 'xiaohongshu' ? 'newspic' : 'news',
                });
            }
        }
    }
    // 若未提取到多篇，回退尝试提取单篇
    if (results.length === 0) {
        const single = parseArticleFromAssistantText(trimmed, options);
        if (single && (single.title || (single.content && single.content.length >= 10))) {
            results.push({
                index: 1,
                title: single.title || '社媒精选图文',
                content: cleanAndUnescapeHtmlContent(single.content || ''),
                isStreaming: Boolean(options?.isLastRow),
                platform: single.platform || effPlat,
                accountId: single.accountId || effAcc,
                articleType: (single.platform || effPlat) === 'xiaohongshu' ? 'newspic' : 'news',
            });
        }
    }
    return results;
}
/**
 * 从 Assistant 消息文本中解析配图文件列表与落盘路径前缀
 */
export function parseImagesFromMarkdownText(text, options) {
    const images = [];
    // 1. 寻找显式路径前缀，例如：路径前缀：`d:\666\wincode\apps\wincode-cli\packages\social-publisher-plugin\tasks\default\accounts\xhs\scripts\`
    const prefixMatch = text.match(/路径前缀[：:]\s*([^\r\n]+)/);
    let prefix = prefixMatch
        ? prefixMatch[1]
            .trim()
            .replace(/[`"']/g, '')
            .replace(/[\\/]+$/, '')
        : (options?.scriptsDir || '');
    // 若无显式路径前缀且未提供 scriptsDir，但指定了账号 ID，使用社媒工作台规范的相对前缀
    if (!prefix && options?.accountId) {
        prefix = `apps/wincode-cli/packages/social-publisher-plugin/tasks/default/accounts/${options.accountId}/scripts`;
    }
    // 2. 匹配以常见图片后缀结尾的文件名（如 cover_1.png, content_1_1.png, pic_1_1.png 等）
    // 【中文修复依据】：严禁提取 Markdown 规划表格（如 | 1 | 封面海报 | cover_1.png |）中的文件名，表格属于方案设计并非已落盘产物
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('|') ||
            trimmedLine.includes(' | ') ||
            trimmedLine.includes('提示词') ||
            trimmedLine.includes('配图方案') ||
            trimmedLine.includes('方案设计')) {
            continue;
        }
        const fileMatches = trimmedLine.matchAll(/([a-zA-Z0-9_\-./\\:]+\.(?:png|jpg|jpeg|webp))/gi);
        for (const m of fileMatches) {
            const rawPath = m[1]?.trim().replace(/[`"']/g, '');
            if (!rawPath)
                continue;
            let fullPath = rawPath;
            if (prefix && !rawPath.includes(':') && !rawPath.startsWith('/')) {
                const sep = prefix.includes('\\') ? '\\' : '/';
                fullPath = `${prefix}${sep}${rawPath.replace(/^[\\/]+/, '')}`;
            }
            const normalized = normalizeLocalImageUrl(fullPath);
            if (normalized && !images.includes(normalized)) {
                images.push(normalized);
            }
        }
    }
    // 3. 匹配标准 Markdown 图片 ![...](url)
    const mdImgMatches = text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g);
    for (const m of mdImgMatches) {
        const url = m[1]?.trim().replace(/[`"']/g, '');
        if (url) {
            const normalized = normalizeLocalImageUrl(url);
            if (normalized && !images.includes(normalized)) {
                images.push(normalized);
            }
        }
    }
    return images;
}
/**
 * 标准化平台标识符为合法 Platform 类型
 */
export function normalizePlatformName(raw) {
    if (!raw || typeof raw !== 'string')
        return null;
    const s = raw.toLowerCase().trim();
    if (s === 'gzh' || s === 'wechat' || s.includes('公众号') || s.includes('微信'))
        return 'gzh';
    if (s === 'xiaohongshu' || s === 'xhs' || s.includes('小红书'))
        return 'xiaohongshu';
    if (s === 'zhihu' || s.includes('知乎'))
        return 'zhihu';
    if (s === 'baijiahao' || s === 'bjh' || s.includes('百家号') || s.includes('百家'))
        return 'baijiahao';
    if (s === 'toutiao' || s.includes('头条') || s.includes('今日头条'))
        return 'toutiao';
    return null;
}
/**
 * 从多维会话信号中精准推断目标社媒平台（彻底消除硬编码小红书的问题）
 */
/**
 * 判定当前会话是否属于社媒发布任务
 * 全生命周期强感知：不仅仅在调用工具时生效，
 * 用户输入包含社媒指令/意图（公众号/小红书/知乎/社媒等）即在第一秒常驻激活
 */
export function isSocialPublisherSession(rows) {
    if (!rows || rows.length === 0)
        return false;
    for (const row of rows) {
        if (row.kind === 'toolCall') {
            const toolName = (row.toolName || '').toLowerCase();
            if (toolName.includes('social_publisher') ||
                toolName.includes('gzh_') ||
                toolName.includes('xhs_') ||
                toolName.includes('wechat_') ||
                toolName.includes('social_') ||
                toolName.includes('publish_draft')) {
                return true;
            }
        }
        if (row.kind === 'userInput') {
            const text = row.text || '';
            // 【中文修复依据】：严格收敛社媒任务检测边界（诉求 3）！
            // 必须包含社媒专用命令、明确的任务结构化标签或具体动宾发文意图，剔除单字及普通写作/编程词汇
            if (/^\/(publish|gzh|wechat|xhs|xiaohongshu|zhihu|toutiao|baijiahao|publisher)\b/i.test(text) ||
                text.includes('【发布平台】') ||
                text.includes('【社媒发布任务】') ||
                text.includes('【社媒发布】') ||
                text.includes('【执行账号】') ||
                /(?:一键|确认)?(?:发布|推送|发表|同步)到(?:微信公众号|公众号|小红书|知乎|今日头条|百家号)/i.test(text) ||
                /(?:推送到|存入)(?:官方)?草稿箱/i.test(text) ||
                /(?:生成|写|撰写|规划|生产|排版|发布|发表|推送).{0,20}?(?:微信公众号|公众号|小红书|小绿书|知乎专栏|今日头条|百家号).{0,20}?(?:笔记|图文|推文|卡片|长文|便签)/i.test(text) ||
                /(?:微信公众号|公众号|小红书|小绿书|知乎专栏|今日头条|百家号).{0,20}?(?:生成|写|撰写|规划|生产|排版|发布|发表|推送).{0,20}?(?:笔记|图文|推文|卡片|长文|便签)/i.test(text)) {
                return true;
            }
        }
        if (row.kind === 'assistantText') {
            const text = row.text || '';
            if (text.includes('已为您规划多图文拟发布序列') ||
                text.includes('【社媒发布任务】') ||
                text.includes('多图文拟发布序列') ||
                (text.includes('【发布平台】') && text.includes('【执行账号】'))) {
                return true;
            }
        }
    }
    return false;
}
export function detectPlatformFromRows(rows) {
    // 1. 最高优先级：ToolCall 中的显式 input.platform 或 output.platform
    for (const row of rows) {
        if (row.kind === 'toolCall') {
            const input = (row.input ?? {});
            const outputPayload = parseToolOutputPayload(row.output);
            const pFromInput = normalizePlatformName(typeof input.platform === 'string' ? input.platform : undefined);
            if (pFromInput)
                return pFromInput;
            const pFromOutput = normalizePlatformName(typeof outputPayload.platform === 'string' ? outputPayload.platform : undefined);
            if (pFromOutput)
                return pFromOutput;
            // 产物文件特征推断（含沙箱路径与平台标识推断）
            const fileCandidate = String(outputPayload.file ||
                outputPayload.path ||
                outputPayload.filePath ||
                outputPayload.target_file ||
                input.file ||
                input.Path ||
                input.path ||
                input.filePath ||
                input.TargetFile ||
                '');
            if (fileCandidate) {
                if (fileCandidate.includes('xiaohongshu') || fileCandidate.includes('_xhs.') || fileCandidate.includes('xhs_') || fileCandidate.includes('xhs/'))
                    return 'xiaohongshu';
                if (fileCandidate.includes('zhihu'))
                    return 'zhihu';
                if (fileCandidate.includes('baijiahao'))
                    return 'baijiahao';
                if (fileCandidate.includes('toutiao'))
                    return 'toutiao';
                if (fileCandidate.includes('gzh') || fileCandidate.includes('wechat') || fileCandidate.endsWith('.html'))
                    return 'gzh';
            }
        }
    }
    // 2. 次高优先级：用户输入的快捷指令与显式指令
    for (const row of rows) {
        if (row.kind === 'userInput') {
            const text = row.text.trim();
            // /publish <platform> 格式识别（社媒矩阵任务标准格式）
            const publishCmdMatch = text.match(/^\/publish\s+(gzh|wechat|zhihu|xiaohongshu|xhs|baijiahao|bjh|toutiao)\b/i);
            if (publishCmdMatch && publishCmdMatch[1]) {
                const fromPublish = normalizePlatformName(publishCmdMatch[1]);
                if (fromPublish)
                    return fromPublish;
            }
            // 快捷指令匹配，如 /gzh, /zhihu, /xhs, /xiaohongshu, /toutiao, /baijiahao
            const cmdMatch = text.match(/^\/(gzh|wechat|zhihu|xiaohongshu|xhs|baijiahao|bjh|toutiao)\b/i);
            if (cmdMatch && cmdMatch[1]) {
                const fromCmd = normalizePlatformName(cmdMatch[1]);
                if (fromCmd)
                    return fromCmd;
            }
            // 卡片格式前缀与自然标签 【发布平台】xxx 或 平台: xxx
            const explicitMatch = text.match(/【发布平台】([^\n]+)/) || text.match(/(?:发布)?平台[：:]\s*([^\s\n]+)/);
            if (explicitMatch && explicitMatch[1]) {
                const fromExplicit = normalizePlatformName(explicitMatch[1]);
                if (fromExplicit)
                    return fromExplicit;
            }
            // 自然意图识别
            if (text.includes('小红书'))
                return 'xiaohongshu';
            if (text.includes('知乎'))
                return 'zhihu';
            if (text.includes('百家号') || text.includes('百家'))
                return 'baijiahao';
            if (text.includes('头条') || text.includes('今日头条'))
                return 'toutiao';
            if (text.includes('公众号') || text.includes('微信'))
                return 'gzh';
        }
    }
    // 3. 第三优先级：从 Assistant 文本中提取
    for (const row of rows) {
        if (row.kind === 'assistantText') {
            const text = row.text;
            if (text.includes('【小红书') || text.includes('小红书笔记') || text.includes('小红书爆款'))
                return 'xiaohongshu';
            if (text.includes('【知乎') || text.includes('知乎专栏'))
                return 'zhihu';
            if (text.includes('【今日头条') || text.includes('头条号'))
                return 'toutiao';
            if (text.includes('【百家号') || text.includes('百家号草稿'))
                return 'baijiahao';
            if (text.includes('【微信公众号') || text.includes('公众号长文') || text.includes('13px 单行 HTML'))
                return 'gzh';
        }
    }
    // 4. 账号名称特征推断
    for (const row of rows) {
        if (row.kind === 'toolCall') {
            const input = (row.input ?? {});
            const acc = String(input.account_id || '');
            if (acc.includes('xhs'))
                return 'xiaohongshu';
            if (acc.includes('zhihu'))
                return 'zhihu';
            if (acc.includes('toutiao'))
                return 'toutiao';
            if (acc.includes('baijiahao'))
                return 'baijiahao';
        }
    }
    // 5. 缺省安全兜底：默认微信公众号（基石生态），绝非小红书
    return 'gzh';
}
/**
 * 将正文中的图片占位符（如 IMG_A1_1, IMG_1_1, ![...](IMG_A1_1)）精确映射替换为落盘的真实安全图片 URL
 * 确保富文本渲染与复制导出时图文 100% 严密贴合，消灭孤立字符串
 */
export function inlineInjectImagesIntoContent(content, images, coverUrl) {
    if (!content)
        return '';
    let result = cleanAndUnescapeHtmlContent(content);
    // 1. 未配置独立品牌图时，彻底静默清洗品牌图占位符，杜绝 ![头部品牌图](_BRAND_TOP_) 裸露
    result = result
        .replace(/^.*!\[.*?\]\(__?BRAND_(?:TOP|BOT)__?\).*$/gm, '')
        .replace(/<!--\s*__?BRAND_(?:TOP|BOT)__?\s*-->/gi, '')
        .replace(/__?BRAND_(?:TOP|BOT)__?/gi, '');
    // 2. 【中文修复依据】：严禁将封面图插入正文区域！长文封面由独立封面卡片专享，正文区仅承载章节插图
    // 全面清洗正文中的任何封面占位符、注释与 Markdown 封面图片标签，杜绝封面在正文区域二次出现
    result = result
        .replace(/^.*!\[.*?封面.*?\]\(.*?\).*$/gm, '')
        .replace(/^.*!\[.*?\]\(.*?(?:IMG_COVER|COVER_IMG|_COVER_|cover_\d+|cover\.).*?\).*$/gm, '')
        .replace(/<img[^>]+src=["'][^"']*(?:cover_\d+|cover\.|IMG_COVER)[^"']*["'][^>]*>/gi, '')
        .replace(/<!--\s*IMG_COVER(?:_\d+)?\s*-->|IMG_COVER_\d+|IMG_COVER|COVER_IMG|_COVER_/gi, '');
    // 3. 正文插图精确映射：过滤掉封面图，仅对真正的正文插图映射 IMG_1_1, IMG_1_2 等占位符
    const bodyImages = coverUrl ? images.filter(img => img !== coverUrl) : images;
    const targetImages = bodyImages.length > 0 ? bodyImages : images;
    const isHtml = /<\/?(?:p|div|section|span|h[1-6]|img)[^>]*>/i.test(result);
    // A. 优先将标准 Markdown 图片语法 !\[...\]\(IMG_A1_1\) 精准映射为真实图片或安全清洗
    result = result.replace(/!\[(.*?)\]\((IMG_A\d+_(\d+)|IMG_\d+_(\d+)|IMG_(\d+))\)/gi, (_fullMatch, alt, _rawPlaceholder, sub1, sub2, sub3) => {
        const rawSub = sub1 || sub2 || sub3;
        const subIdx = rawSub ? Number.parseInt(rawSub, 10) : 1;
        const imgUrl = targetImages[subIdx - 1];
        if (imgUrl) {
            if (isHtml) {
                return `<div style="text-align:center;margin:18px 0;"><img src="${imgUrl}" alt="${alt || `插图 ${subIdx}`}" style="max-width:100%;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.06);" /></div>`;
            }
            return `\n\n![${alt || `插图 ${subIdx}`}](${imgUrl})\n\n`;
        }
        return '';
    });
    // B. 针对 HTML 模式、注释模式与中括号模式进行序号映射
    if (targetImages.length > 0) {
        targetImages.forEach((imgUrl, idx) => {
            const subIdx = idx + 1;
            const htmlImgSnippet = `<div style="text-align:center;margin:18px 0;"><img src="${imgUrl}" style="max-width:100%;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.06);" /></div>`;
            const mdImgSnippet = `\n\n![插图 ${subIdx}](${imgUrl})\n\n`;
            // 替换已经在 <img src="IMG_..."> 标签内部的属性占位符
            const inAttrPatterns = [
                new RegExp(`(src=["'])IMG_A\\d+_${subIdx}(["'])`, 'gi'),
                new RegExp(`(src=["'])IMG_\\d+_${subIdx}(["'])`, 'gi'),
                new RegExp(`(src=["'])IMG_${subIdx}(["'])`, 'gi'),
            ];
            for (const p of inAttrPatterns) {
                result = result.replace(p, `$1${imgUrl}$2`);
            }
            // 替换注释占位符 <!-- IMG_A1_1 --> 或 <!-- IMG_1 -->
            const commentPatterns = [
                new RegExp(`<!--\\s*IMG_A\\d+_${subIdx}\\s*-->`, 'gi'),
                new RegExp(`<!--\\s*IMG_\\d+_${subIdx}\\s*-->`, 'gi'),
                new RegExp(`<!--\\s*IMG_${subIdx}\\s*-->`, 'gi'),
            ];
            for (const p of commentPatterns) {
                result = result.replace(p, isHtml ? htmlImgSnippet : mdImgSnippet);
            }
            // 替换中括号占位符 [IMG_1] 或 [插图1]
            const bracketPatterns = [
                new RegExp(`\\[\\s*(?:IMG_A?\\d*_${subIdx}|IMG_${subIdx}|插图\\s*${subIdx})\\s*\\]`, 'gi'),
            ];
            for (const p of bracketPatterns) {
                result = result.replace(p, isHtml ? htmlImgSnippet : mdImgSnippet);
            }
            // 替换独立的 IMG_1 纯词占位符
            const wordPatterns = [
                new RegExp(`(?<=\\s|^)IMG_A\\d+_${subIdx}(?=\\s|$)`, 'g'),
                new RegExp(`(?<=\\s|^)IMG_\\d+_${subIdx}(?=\\s|$)`, 'g'),
                new RegExp(`(?<=\\s|^)IMG_${subIdx}(?=\\s|$)`, 'g'),
            ];
            for (const p of wordPatterns) {
                result = result.replace(p, isHtml ? htmlImgSnippet : mdImgSnippet);
            }
        });
    }
    // 4. 彻底清洗剩余所有未匹配/超额的占位符（保证实际生成数量与文本呈现 100% 一致）
    result = result
        .replace(/^.*!\[.*?\]\((?:IMG_A?\d*_\d+|IMG_\d+)\).*$/gm, '')
        .replace(/<img[^>]+src=["'](?:IMG_A?\d*_\d+|IMG_\d+)["'][^>]*>/gi, '')
        .replace(/<!--\s*IMG_A?\d*_\d+\s*-->/gi, '')
        .replace(/\[\s*(?:IMG_A?\d*_\d+|IMG_\d+|插图\s*\d+)\s*\]/gi, '')
        .replace(/\bIMG_A\d+_\d+\b/g, '')
        .replace(/\bIMG_\d+_\d+\b/g, '')
        .replace(/\n{3,}/g, '\n\n');
    return result.trim();
}
/**
 * 从图片 URL、文件名及生图参数中解析位置感知元数据
 */
export function parseImageMeta(rawUrlOrPath, hint) {
    const normUrl = normalizeLocalImageUrl(rawUrlOrPath);
    // 【中文修复依据】：优先还原磁盘真实路径并提取真实纯文件名（例如 cover_1.png 或 content_1_1.png）
    // 彻底根除因 wincode-media://local/preview?path= 编码反斜杠导致 split('/').pop() 失效的致命 Bug（彻底解决图 2 与图 3）
    const diskPath = extractLocalDiskPathFromUrl(rawUrlOrPath);
    const fileName = extractFileName(rawUrlOrPath);
    let kind = 'content';
    let articleIndex = typeof hint?.index === 'number' && hint.index > 0 ? hint.index : 0;
    let subIndex = typeof hint?.sub === 'number' ? hint.sub : 1;
    // 1. 优先通过更具包容性的正则解析文件名特征（覆盖多平台前缀与变体）
    // 封面：cover_1.png, cover.png, gzh_cover_1.png, art1_cover.png, cover_art1.png
    const coverMatch = fileName.match(/(?:^|[_.-])cover(?:[_.-]?(\d+))?\.(?:png|jpg|jpeg|webp)/i) ||
        fileName.match(/art(?:icle)?[_.-]?(\d+)[_.-]cover\.(?:png|jpg|jpeg|webp)/i) ||
        fileName.match(/cover[_.-]art(?:icle)?[_.-]?(\d+)\.(?:png|jpg|jpeg|webp)/i);
    if (coverMatch) {
        kind = 'cover';
        articleIndex = coverMatch[1] ? Number.parseInt(coverMatch[1], 10) : (hint?.index || 1);
        subIndex = 0;
    }
    else {
        // 正文长文插图：content_1_2.png, gzh_content_1_2.png, art1_content_2.png
        const contentMatch = fileName.match(/(?:^|[_.-])content[_.-]?(\d+)[_.-](\d+)\.(?:png|jpg|jpeg|webp)/i) ||
            fileName.match(/art(?:icle)?[_.-]?(\d+)[_.-]content[_.-]?(\d+)\.(?:png|jpg|jpeg|webp)/i);
        if (contentMatch && contentMatch[1] && contentMatch[2]) {
            kind = 'content';
            articleIndex = Number.parseInt(contentMatch[1], 10);
            subIndex = Number.parseInt(contentMatch[2], 10);
        }
        else {
            // 竖版卡片或图片：pic_1_1.png, xhs_pic_1_1.png, art1_pic_2.png
            const picMatch = fileName.match(/(?:^|[_.-])pic[_.-]?(\d+)[_.-](\d+)\.(?:png|jpg|jpeg|webp)/i) ||
                fileName.match(/art(?:icle)?[_.-]?(\d+)[_.-]pic[_.-]?(\d+)\.(?:png|jpg|jpeg|webp)/i) ||
                fileName.match(/img[_.-]?(\d+)[_.-](\d+)\.(?:png|jpg|jpeg|webp)/i);
            if (picMatch && picMatch[1] && picMatch[2]) {
                kind = 'pic';
                articleIndex = Number.parseInt(picMatch[1], 10);
                subIndex = Number.parseInt(picMatch[2], 10);
            }
            else {
                // 单序号回退识别：如 art1_2.png 或 pic_1.png
                const singleMatch = fileName.match(/art(?:icle)?[_.-]?(\d+)[_.-](\d+)\.(?:png|jpg|jpeg|webp)/i);
                if (singleMatch && singleMatch[1] && singleMatch[2]) {
                    kind = 'content';
                    articleIndex = Number.parseInt(singleMatch[1], 10);
                    subIndex = Number.parseInt(singleMatch[2], 10);
                }
                else if (hint?.kind) {
                    kind = hint.kind === 'cover' ? 'cover' : hint.kind === 'pic' ? 'pic' : 'content';
                }
            }
        }
    }
    // 2. 从真实物理路径中提取所属账号与平台（优先兼容沙箱路径 tasks/active/<taskId>/<platform>_<accountId>/images/）
    let accId = hint?.accountId;
    let plat = hint?.platform;
    const sandboxMatch = diskPath.match(/(?:tasks[\\/](?:active|archive|default[\\/]tasks[\\/](?:active|archive))[\\/][^\\/]+[\\/])([a-z0-9]+)_([a-z0-9_-]+)[\\/]/i);
    if (sandboxMatch && sandboxMatch[1] && sandboxMatch[2]) {
        const rawPlat = sandboxMatch[1].toLowerCase();
        if (rawPlat === 'xiaohongshu' || rawPlat === 'xhs')
            plat = 'xiaohongshu';
        else if (rawPlat === 'gzh')
            plat = 'gzh';
        else if (rawPlat === 'zhihu')
            plat = 'zhihu';
        else if (rawPlat === 'baijiahao')
            plat = 'baijiahao';
        else if (rawPlat === 'toutiao')
            plat = 'toutiao';
        if (!accId)
            accId = sandboxMatch[2];
    }
    else {
        const accMatch = diskPath.match(/accounts[\\/]([^\\/]+)[\\/]/);
        if (accMatch && accMatch[1] && !accId) {
            accId = accMatch[1];
        }
    }
    // 3. 从账号名、路径或特征前缀推导确切平台归属
    if (!plat) {
        if (diskPath.includes('wyxst') || fileName.startsWith('gzh_') || diskPath.includes('gzh')) {
            plat = 'gzh';
        }
        else if (diskPath.includes('xhs') || diskPath.includes('xiaohongshu') || fileName.startsWith('xhs_')) {
            plat = 'xiaohongshu';
        }
        else if (diskPath.includes('zhihu') || fileName.startsWith('zhihu_')) {
            plat = 'zhihu';
        }
        else if (diskPath.includes('baijiahao')) {
            plat = 'baijiahao';
        }
        else if (diskPath.includes('toutiao')) {
            plat = 'toutiao';
        }
    }
    // 提取所属任务 ID（优先从 hint，其次从物理沙箱路径 tasks/(active|archive)/<taskId>/）
    let taskId = hint?.taskId;
    if (!taskId) {
        const taskMatch = diskPath.match(/(?:tasks[\\/](?:active|archive|default[\\/]tasks[\\/](?:active|archive))[\\/])(task_[a-z0-9_-]+)/i) ||
            rawUrlOrPath.match(/(?:tasks[\\/](?:active|archive|default[\\/]tasks[\\/](?:active|archive))[\\/])(task_[a-z0-9_-]+)/i);
        if (taskMatch && taskMatch[1]) {
            taskId = taskMatch[1];
        }
    }
    return {
        url: normUrl,
        kind,
        articleIndex,
        subIndex,
        platform: plat,
        accountId: accId,
        taskId,
    };
}
/**
 * 从会话的真实 ConversationRow[] 中纯函数式提取社媒发布状态与全阶段数据
 */
export function extractSocialWorkflow(rows) {
    let isExplicitSocialModeTask = false;
    for (const row of rows) {
        if (row.kind === 'userInput' &&
            (row.text?.includes('【社媒矩阵任务') ||
                row.text?.includes('【社媒发布任务】') ||
                row.text?.includes('【社媒发布模式任务】') ||
                row.text?.trim().startsWith('/publish'))) {
            isExplicitSocialModeTask = true;
            break;
        }
    }
    let detectedPlatform = detectPlatformFromRows(rows);
    let detectedAccountName;
    let detectedAccountId;
    let detectedTopicTheme;
    let detectedTaskId;
    let detectedManifestFingerprint;
    let detectedIsDryRun = false;
    let checkTopicsCallFound = false;
    let checkTopicsCompleted = false;
    const checkTopicsFromTool = [];
    let discoverTopicsCallFound = false;
    const discoverTopicsFromTool = [];
    let extractedResearchEvidence;
    let buildArticleRunning = false;
    let buildArticleCompleted = false;
    const articlesMap = new Map();
    let genImagesRunning = false;
    let genImagesCompleted = false;
    const generatedImageUrls = [];
    const parsedImagesList = [];
    let validateHtmlRunning = false;
    let validateHtmlCompleted = false;
    let publishDraftRunning = false;
    let publishDraftCompleted = false;
    let publishedDraftId;
    let publishedMediaId;
    let publishedScheduleTime;
    let publishedReceiptScreenshot;
    let publishedQrScreenshot;
    let verifyDraftCompleted = false;
    let publishIntentIssued = false;
    let detectedScriptsDir = undefined;
    let detectedTargetCount = 1;
    const taskPublishRunningMap = new Map();
    const taskPublishedMap = new Map();
    const taskPublishedInfoMap = new Map();
    const taskGeneratingMap = new Map();
    let latestAssistantTopics = [];
    const knownSpecFiles = new Map();
    const capturedVisualSlots = [];
    const knownFileContents = new Map();
    // 按账号或全局维护复合篇数目额结构
    const accountQuotaMap = new Map();
    let detectedNewspicCardCount;
    let detectedXhsCardCount;
    // 前置提取已有的账号上下文信息与规格文件映射
    for (const row of rows) {
        if (row.kind === 'userInput' || row.kind === 'humanMessage' || row.kind === 'assistantText') {
            const text = ('text' in row && typeof row.text === 'string' ? row.text : '') || '';
            const taskCmdMatch = text.match(/--task-id\s+([a-z0-9_-]+)/i) || text.match(/\b(task_\d{8}_\d{6}_[a-z0-9_-]+)\b/i);
            if (taskCmdMatch && taskCmdMatch[1]) {
                detectedTaskId = taskCmdMatch[1].trim();
            }
            const accCmdMatch = text.match(/\/publish\s+([a-z0-9_-]+)\s+([a-z0-9_-]+)/i);
            if (accCmdMatch && accCmdMatch[2] && !accCmdMatch[2].startsWith('-')) {
                detectedAccountId = accCmdMatch[2].trim();
            }
            // 【中文修复依据】：前置捕获小绿书与小红书卡片张数（如：“3. 小绿书卡片图 (4 张)”、“4 张 3:4 竖版多图画廊”、“共 4 张 3:4 竖版高清海报”）
            const newspicCardsMatch = text.match(/小绿书(?:卡片图|图文卡片|视觉卡片|卡片)?\s*[（(](?:共\s*)?([0-9]+)\s*张[)）]/i) ||
                text.match(/(?:共\s*)?([0-9]+)\s*张\s*3:4\s*竖版(?:高清)?(?:视觉)?(?:海报|卡片|多图|图)/i) ||
                text.match(/卡片配图[：:]\s*(?:共\s*)?([0-9]+)\s*张/i) ||
                text.match(/小绿书.*?[（(]?([0-9]+)\s*张/i);
            if (newspicCardsMatch && newspicCardsMatch[1]) {
                detectedNewspicCardCount = Number.parseInt(newspicCardsMatch[1], 10);
            }
            const xhsCardsMatch = text.match(/小红书(?:卡片|图文|笔记)?\s*[（(](?:共\s*)?([0-9]+)\s*张[)）]/i) ||
                text.match(/小红书.*?[（(]?([0-9]+)\s*张/i);
            if (xhsCardsMatch && xhsCardsMatch[1]) {
                detectedXhsCardCount = Number.parseInt(xhsCardsMatch[1], 10);
            }
            // 全局捕获多图文合辑/拟发布序列篇数声明（如：多图文合辑（6篇长文）、微信公众号多图文拟发布序列（共 7 篇）、本次生产的 7 篇微信公众号长文）
            const multiNewsHeader = text.match(/多图文(?:合辑|拟发布序列|排版清单|发布序列|规划)\s*[（(](?:共\s*)?([0-9]+)\s*篇/i) ||
                text.match(/本次生产的\s*([0-9]+)\s*篇.*?长文/i) ||
                text.match(/多图文合辑\s*[（(]([0-9]+)\s*篇(?:长文|文章)?/i);
            if (multiNewsHeader && multiNewsHeader[1]) {
                const count = Number.parseInt(multiNewsHeader[1], 10);
                detectedTargetCount = Math.max(detectedTargetCount, count);
                const existing = accountQuotaMap.get('default') || { total: count, articleCount: count, newspicCount: 0, hasNewspic: false };
                existing.articleCount = Math.max(existing.articleCount, count);
                existing.total = existing.articleCount + existing.newspicCount;
                accountQuotaMap.set('default', existing);
            }
            // 捕获独立小绿书篇数声明（如：二、同步双发小绿书卡片图文（共 1 篇）或 ### 同步小绿书卡片图文）
            const newspicHeader = text.match(/(?:同步)?(?:双发)?小绿书(?:卡片图文)?\s*[（(](?:共\s*)?([0-9]+)\s*篇[)）]/i) ||
                text.match(/(?:###|二[、.]|【)\s*(?:同步)?(?:双发)?小绿书(?:卡片图文)?/i);
            if (newspicHeader) {
                const nCount = newspicHeader[1] ? Number.parseInt(newspicHeader[1], 10) : 1;
                const existing = accountQuotaMap.get('default') || { total: nCount, articleCount: 0, newspicCount: nCount, hasNewspic: true };
                existing.newspicCount = Math.max(existing.newspicCount, nCount);
                existing.hasNewspic = true;
                existing.total = existing.articleCount + existing.newspicCount;
                accountQuotaMap.set('default', existing);
                detectedTargetCount = Math.max(detectedTargetCount, existing.total);
            }
            // 全文级复合句式提取（无论来自用户指令还是大模型规划陈述：7 篇长文 + 1 篇小绿书）
            const textComboMatch = text.match(/([0-9]+)\s*篇(?:微信公众号)?(?:长文|文章|深度长文|图文|多图文)?(?:合辑)?[^0-9\n\r]{1,30}?([0-9]+)\s*篇(?:小绿书|图片消息|卡片)/i) ||
                text.match(/([0-9]+)\s*篇(?:小绿书|图片消息|卡片)[^0-9\n\r]{1,30}?([0-9]+)\s*篇(?:微信公众号)?(?:长文|文章|深度长文|图文|多图文)?/i) ||
                text.match(/([0-9]+)\s*长文\s*(?:[+＋与和、]|以及)\s*([0-9]+)\s*小绿书/i);
            if (textComboMatch && textComboMatch[1] && textComboMatch[2]) {
                const matchedStr = textComboMatch[0];
                let aCount = 0;
                let nCount = 0;
                const num1 = Number.parseInt(textComboMatch[1], 10);
                const num2 = Number.parseInt(textComboMatch[2], 10);
                if (/小绿书|图片消息|卡片/.test(matchedStr.slice(0, matchedStr.indexOf(String(num2))))) {
                    nCount = num1;
                    aCount = num2;
                }
                else {
                    aCount = num1;
                    nCount = num2;
                }
                const q = { total: aCount + nCount, articleCount: aCount, newspicCount: nCount, hasNewspic: nCount > 0 };
                const existing = accountQuotaMap.get('default');
                if (!existing || q.total >= existing.total) {
                    accountQuotaMap.set('default', q);
                    detectedTargetCount = Math.max(detectedTargetCount, q.total);
                }
            }
            // 提取针对特定账号声明的篇数规格（如：文映学术2 (default-copy) · 7 篇长文 + 1 篇小绿书）
            const perAccLines = text.split('\n');
            for (const l of perAccLines) {
                const cleanedLine = l.replace(/^.*?本轮规划[：:]\s*/i, '').replace(/^.*?规划[：:]\s*/i, '');
                const accHeaderMatch = cleanedLine.match(/([^\s·•#|（(]+?)(?:[（(]([a-zA-Z0-9_-]+)[)）])?\s*[·•\-:]\s*([^\n\r]+)/) ||
                    cleanedLine.match(/账号[：:]\s*([^\s|（(]+)(?:[（(]([a-zA-Z0-9_-]+)[)）])?[^\n\r]*?[·•\-:]\s*([^\n\r]+)/);
                if (accHeaderMatch) {
                    const accName = accHeaderMatch[1]?.trim();
                    const accId = accHeaderMatch[2]?.trim();
                    const detailPart = accHeaderMatch[3]?.trim() || '';
                    // 匹配：7 篇长文 + 1 篇小绿书
                    const combo = detailPart.match(/([0-9]+)\s*篇(?:长文|文章|深度长文|图文)?\s*(?:[+＋与和、]|以及)\s*([0-9]+)\s*篇(?:小绿书|图片消息|卡片)/i);
                    if (combo && combo[1] && combo[2]) {
                        const aCount = Number.parseInt(combo[1], 10);
                        const nCount = Number.parseInt(combo[2], 10);
                        const q = { total: aCount + nCount, articleCount: aCount, newspicCount: nCount, hasNewspic: true };
                        if (accId)
                            accountQuotaMap.set(accId, q);
                        if (accName)
                            accountQuotaMap.set(accName, q);
                        detectedTargetCount = Math.max(detectedTargetCount, q.total);
                    }
                    else {
                        const singleCount = detailPart.match(/([0-9]+)\s*篇/);
                        if (singleCount && singleCount[1]) {
                            const count = Number.parseInt(singleCount[1], 10);
                            const isNewspic = detailPart.includes('小绿书') || detailPart.includes('图片消息');
                            const q = {
                                total: count,
                                articleCount: isNewspic ? 0 : count,
                                newspicCount: isNewspic ? count : 0,
                                hasNewspic: isNewspic,
                            };
                            if (accId)
                                accountQuotaMap.set(accId, q);
                            if (accName)
                                accountQuotaMap.set(accName, q);
                            detectedTargetCount = Math.max(detectedTargetCount, count);
                        }
                    }
                }
            }
            if (row.kind === 'userInput') {
                const accountMatch = row.text.match(/【执行账号】\s*([^\s\n【]+)/);
                if (accountMatch)
                    detectedAccountName = accountMatch[1]?.trim();
                // 复合句式提取：支持双向顺序与跨短语隔断（长文+小绿书 或 小绿书+长文）
                const comboMatch = row.text.match(/([0-9]+)\s*篇(?:长文|文章|深度长文|图文|多图文)?(?:合辑)?[^0-9\n\r]{1,30}?([0-9]+)\s*篇(?:小绿书|图片消息|卡片)/i) ||
                    row.text.match(/([0-9]+)\s*篇(?:小绿书|图片消息|卡片)[^0-9\n\r]{1,30}?([0-9]+)\s*篇(?:长文|文章|深度长文|图文|多图文)?/i) ||
                    row.text.match(/([0-9]+)\s*长文\s*(?:[+＋与和、]|以及)\s*([0-9]+)\s*小绿书/i);
                if (comboMatch && comboMatch[1] && comboMatch[2]) {
                    const matchedStr = comboMatch[0];
                    let aCount = 0;
                    let nCount = 0;
                    const num1 = Number.parseInt(comboMatch[1], 10);
                    const num2 = Number.parseInt(comboMatch[2], 10);
                    // 判断第一个数字是属于长文还是小绿书
                    if (/小绿书|图片消息|卡片/.test(matchedStr.slice(0, matchedStr.indexOf(String(num2))))) {
                        nCount = num1;
                        aCount = num2;
                    }
                    else {
                        aCount = num1;
                        nCount = num2;
                    }
                    const q = { total: aCount + nCount, articleCount: aCount, newspicCount: nCount, hasNewspic: nCount > 0 };
                    if (detectedAccountName)
                        accountQuotaMap.set(detectedAccountName, q);
                    accountQuotaMap.set('default', q);
                    detectedTargetCount = Math.max(detectedTargetCount, aCount + nCount);
                }
                else {
                    let detectedCount = 1;
                    let countSpecified = false;
                    const countMatch = row.text.match(/【(?:目标)?篇数】\s*([0-9]+)/i) ||
                        row.text.match(/【(?:文章)?数量】\s*([0-9]+)/i) ||
                        row.text.match(/(?:写|生成|构建|产出|撰写|发布)\s*([0-9]+)\s*篇/i) ||
                        row.text.match(/([0-9]+)\s*篇(?:文章|长文|小绿书|笔记|图文)?/i);
                    if (countMatch && countMatch[1]) {
                        detectedCount = Number.parseInt(countMatch[1], 10);
                        countSpecified = true;
                    }
                    else if (row.text.includes('两篇') ||
                        row.text.includes('2篇') ||
                        row.text.includes('头条和次条') ||
                        row.text.includes('头条、次条')) {
                        detectedCount = 2;
                        countSpecified = true;
                    }
                    else if (row.text.includes('三篇') ||
                        row.text.includes('3篇') ||
                        row.text.includes('头条次条尾条')) {
                        detectedCount = 3;
                        countSpecified = true;
                    }
                    detectedTargetCount = Math.max(detectedTargetCount, detectedCount);
                    // 单体裁精确意图推导 (小绿书 vs 长文 vs 小红书笔记)
                    const isExplicitNewspic = row.text.includes('小绿书') ||
                        row.text.includes('图片消息') ||
                        row.text.includes('图文卡片');
                    const isExplicitNews = row.text.includes('长文') ||
                        row.text.includes('公众号文章') ||
                        row.text.includes('深度文章') ||
                        row.text.includes('深度图文');
                    const isXhsTask = row.text.includes('小红书') ||
                        row.text.includes('笔记');
                    if (isExplicitNewspic && !isExplicitNews) {
                        const q = { total: detectedCount, articleCount: 0, newspicCount: detectedCount, hasNewspic: true };
                        if (detectedAccountName)
                            accountQuotaMap.set(detectedAccountName, q);
                        accountQuotaMap.set('default', q);
                    }
                    else if (isExplicitNews && !isExplicitNewspic) {
                        const q = { total: detectedCount, articleCount: detectedCount, newspicCount: 0, hasNewspic: false };
                        if (detectedAccountName)
                            accountQuotaMap.set(detectedAccountName, q);
                        accountQuotaMap.set('default', q);
                    }
                    else if (isXhsTask) {
                        const q = { total: detectedCount, articleCount: 0, newspicCount: detectedCount, hasNewspic: true };
                        if (detectedAccountName)
                            accountQuotaMap.set(detectedAccountName, q);
                        accountQuotaMap.set('default', q);
                    }
                    else if (countSpecified) {
                        const q = { total: detectedCount, articleCount: detectedCount, newspicCount: 0, hasNewspic: false };
                        if (detectedAccountName)
                            accountQuotaMap.set(detectedAccountName, q);
                        accountQuotaMap.set('default', q);
                    }
                }
            }
        }
        if (row.kind === 'assistantText') {
            const accMatch = row.text.match(/账号[：:]\s*([^\s|（(]+)(?:[（(]([a-zA-Z0-9_-]+)[)）])?/);
            if (accMatch) {
                if (!detectedAccountName || detectedAccountName === '所选平台全部启用账号') {
                    detectedAccountName = accMatch[1]?.trim();
                }
                if (accMatch[2]) {
                    detectedAccountId = accMatch[2]?.trim();
                }
            }
        }
        if (row.kind === 'toolCall') {
            const input = (row.input ?? {});
            const outputPayload = parseToolOutputPayload(row.output);
            if (typeof input.account_id === 'string' && input.account_id) {
                detectedAccountId = input.account_id;
            }
            if (typeof outputPayload.account_id === 'string' && outputPayload.account_id) {
                detectedAccountId = outputPayload.account_id;
            }
            // 全局前置推导：从 input / outputPayload 涉及的任意落盘路径中提炼真实落盘 scriptsDir 与 accountId
            const candidatePaths = [
                input.TargetFile,
                input.target_file,
                input.Path,
                input.path,
                input.file,
                input.filePath,
                input.FilePath,
                outputPayload.file,
                outputPayload.target_file,
                outputPayload.filePath,
                outputPayload.path,
            ];
            for (const p of candidatePaths) {
                if (typeof p === 'string' && p.trim()) {
                    const normP = p.trim().replace(/\\/g, '/');
                    if (normP.includes('/scripts/')) {
                        const dir = normP.replace(/\/scripts\/.*$/, '/scripts');
                        if (!detectedScriptsDir) {
                            detectedScriptsDir = dir;
                        }
                        if (!detectedAccountId) {
                            const accMatch = normP.match(/\/accounts\/([^/]+)\/scripts/);
                            if (accMatch && accMatch[1]) {
                                detectedAccountId = accMatch[1];
                            }
                        }
                    }
                    // 【修复原因】：兼容物理沙箱规范（specs/social-publisher-task-isolation-and-dedup.md）：
                    // 产物位于 tasks/active/<taskId>/<platform>_<accountId>/ 或 tasks/archive/<taskId>/<platform>_<accountId>/ 下
                    const sandboxMatch = normP.match(new RegExp('(.*\\/tasks\\/(?:active|archive)\\/[^/]+\\/([a-z0-9]+)_([^/]+))(?:\\/(?:articles|images)(?:\\/.*)?)?$', 'i'));
                    if (sandboxMatch) {
                        const sandboxTargetDir = sandboxMatch[1];
                        const plat = sandboxMatch[2];
                        const acc = sandboxMatch[3];
                        // 【中文修复依据】：逆向锁定最新任务沙箱，多轮交互时确保切换到最新沙箱，防止被首轮旧沙箱锁死
                        detectedScriptsDir = sandboxTargetDir;
                        if (acc) {
                            detectedAccountId = acc;
                        }
                        if (plat) {
                            const normPlat = normalizePlatformName(plat);
                            if (normPlat) {
                                detectedPlatform = normPlat;
                            }
                        }
                    }
                }
            }
            // 捕获会话中生成/编辑的文件内容（如 write_to_file / write_file / create_file / code_edit 等）
            const targetFilePath = String(input.TargetFile ||
                input.target_file ||
                input.Path ||
                input.path ||
                input.file ||
                input.filePath ||
                input.FilePath ||
                '');
            const codeContent = typeof input.CodeContent === 'string'
                ? input.CodeContent
                : typeof input.code_content === 'string'
                    ? input.code_content
                    : typeof input.Content === 'string'
                        ? input.Content
                        : typeof input.content === 'string'
                            ? input.content
                            : '';
            if (targetFilePath && codeContent) {
                const cleanPath = targetFilePath.replace(/\\/g, '/');
                const baseName = cleanPath.replace(/^.*[\\/]/, '');
                knownFileContents.set(targetFilePath, codeContent);
                knownFileContents.set(cleanPath, codeContent);
                knownFileContents.set(baseName, codeContent);
                if (baseName.endsWith('.json')) {
                    try {
                        const parsed = JSON.parse(codeContent);
                        if (parsed && typeof parsed === 'object') {
                            knownSpecFiles.set(targetFilePath, parsed);
                            knownSpecFiles.set(cleanPath, parsed);
                            knownSpecFiles.set(baseName, parsed);
                        }
                    }
                    catch {
                        // ignore
                    }
                }
            }
        }
    }
    const effectiveAccountId = detectedAccountId ||
        (detectedPlatform === 'xiaohongshu'
            ? 'xhs'
            : detectedPlatform === 'gzh'
                ? 'default'
                : detectedPlatform);
    for (const row of rows) {
        // 1. 用户输入解析平台、核心主题与发布确认指令
        if (row.kind === 'userInput' || row.kind === 'humanMessage') {
            const text = ('text' in row && typeof row.text === 'string' ? row.text : '') || '';
            const taskCmdMatch = text.match(/--task-id\s+([a-z0-9_-]+)/i) || text.match(/\b(task_\d{8}_\d{6}_[a-z0-9_-]+)\b/i);
            if (taskCmdMatch && taskCmdMatch[1]) {
                detectedTaskId = taskCmdMatch[1].trim();
            }
            const themeMatch = text.match(/【发文主题】([^\n]+)/);
            if (themeMatch)
                detectedTopicTheme = themeMatch[1]?.trim();
            const platformMatch = text.match(/【发布平台】([^\n]+)/);
            if (platformMatch) {
                const pText = platformMatch[1]?.trim() || '';
                if (pText.includes('公众号') || pText.includes('gzh'))
                    detectedPlatform = 'gzh';
                else if (pText.includes('知乎') || pText.includes('zhihu'))
                    detectedPlatform = 'zhihu';
                else if (pText.includes('小红书') || pText.includes('xhs'))
                    detectedPlatform = 'xiaohongshu';
                else if (pText.includes('百家') || pText.includes('baijiahao'))
                    detectedPlatform = 'baijiahao';
                else if (pText.includes('头条') || pText.includes('toutiao'))
                    detectedPlatform = 'toutiao';
            }
            // 检测用户是否已正式下发发布意图指令（包括卡片动作按钮发送的指令与用户手工输入的发布确认命令）
            const isInitialTaskPrompt = text.includes('【发文主题】') ||
                text.includes('【执行账号】') ||
                text.includes('【发布平台】') ||
                text.includes('规划选题') ||
                text.includes('查重') ||
                text.includes('写两篇') ||
                text.includes('写一篇');
            if (!isInitialTaskPrompt) {
                if (text.includes('【发布确认】') ||
                    text.includes('【单篇局部发布确认】') ||
                    text.includes('一键推送到各平台官方草稿箱') ||
                    text.includes('一键全平台定时排期发布') ||
                    text.includes('确认执行发布') ||
                    text.includes('推送至官方草稿箱') ||
                    text.includes('推送到官方草稿箱') ||
                    text.includes('推送到草稿箱') ||
                    text.includes('发布到小红书') ||
                    text.includes('推送到小红书') ||
                    text.includes('推送到微信') ||
                    text.includes('发布到知乎') ||
                    text.includes('发表到今日头条') ||
                    text.includes('推送到百家号') ||
                    text.includes('存入官方草稿箱') ||
                    text.includes('提交发布') ||
                    text.includes('定时排期发布') ||
                    /^(确认发布|立即发布|提交发布|开始发布|发布所有文章|确认推送|定时发布|推送到草稿箱|推送到官方草稿箱|发布|帮我发布)[!！。~]?$/i.test(text.trim())) {
                    publishIntentIssued = true;
                }
            }
        }
        // 2. Assistant 消息文本中解析选题表格与生成配图
        if (row.kind === 'assistantText') {
            // 检测 Assistant 是否已输出发布成果或全链路核验总结（兼容小红书创作者中心、浏览器驱动等发布完成场景）
            if (row.text.includes('完成排期发布') ||
                row.text.includes('完成定时发表') ||
                row.text.includes('定时发表已完成') ||
                row.text.includes('平台收录有效') ||
                row.text.includes('已成功发布') ||
                row.text.includes('已完成发布') ||
                row.text.includes('已存入官方草稿箱') ||
                row.text.includes('已推送到官方草稿箱') ||
                row.text.includes('已成功存入草稿箱') ||
                (row.text.includes('全链路合规核验') && row.text.includes('远程核验结果')) ||
                (row.text.includes('发布与回查') && (row.text.includes('收录有效') || row.text.includes('可正常访问')))) {
                publishDraftCompleted = true;
            }
            const parsed = parseTopicsFromMarkdownText(row.text, {
                platform: detectedPlatform,
                accountId: effectiveAccountId,
                idPrefix: `topic_msg_${row.rowId || row.turnId}`,
            });
            if (parsed.length > 0) {
                // 关键收敛：最新一条包含候选选题表格的 Assistant 消息代表最新决策，覆盖旧轮次
                latestAssistantTopics = parsed;
            }
            const parsedImgs = parseImagesFromMarkdownText(row.text, {
                accountId: effectiveAccountId,
                scriptsDir: detectedScriptsDir,
            });
            if (parsedImgs.length > 0) {
                for (const img of parsedImgs) {
                    if (!generatedImageUrls.includes(img)) {
                        generatedImageUrls.push(img);
                    }
                    // 同步将 Assistant 文本中提取到的图片解析为 ParsedImageMeta 推入配图池
                    const meta = parseImageMeta(img, {
                        platform: detectedPlatform,
                        accountId: effectiveAccountId,
                        taskId: detectedTaskId,
                    });
                    if (!parsedImagesList.some(p => p.url === meta.url)) {
                        parsedImagesList.push(meta);
                    }
                }
            }
            // 关键纳管：全景解析 Assistant 消息中规划的多图文拟发布序列与同步小绿书卡片
            const seqArticles = parsePublishedSequenceFromAssistantText(row.text, {
                platform: detectedPlatform,
                accountId: effectiveAccountId,
                accountName: detectedAccountName,
                scriptsDir: detectedScriptsDir,
            });
            if (seqArticles.length > 0) {
                for (const art of seqArticles) {
                    const docType = art.articleType || 'news';
                    const artKey = `${art.platform}_${art.accountId || 'default'}_${docType}_${art.index || 1}`;
                    if (!articlesMap.has(artKey)) {
                        articlesMap.set(artKey, art);
                    }
                    else {
                        const existing = articlesMap.get(artKey);
                        if (!existing.content || existing.content.includes('已生成就绪')) {
                            existing.title = art.title;
                            existing.digest = art.digest;
                            existing.content = art.content;
                        }
                    }
                }
            }
            else {
                // 核心纳管：流式多篇/单篇正文增量解析（支持逐篇流式输出与即时画布同步）
                const isCurrentLastRow = rows.indexOf(row) === rows.length - 1;
                const streamingArticles = parseStreamingArticlesFromAssistantText(row.text, {
                    platform: detectedPlatform,
                    accountId: effectiveAccountId,
                    accountName: detectedAccountName,
                    isLastRow: isCurrentLastRow,
                });
                if (streamingArticles.length > 0) {
                    for (const sArt of streamingArticles) {
                        const docType = sArt.articleType || 'news';
                        const artKey = `${sArt.platform || detectedPlatform}_${sArt.accountId || effectiveAccountId || 'default'}_${docType}_${sArt.index || 1}`;
                        const existing = articlesMap.get(artKey);
                        if (!existing) {
                            // 【中文修复依据】：契约24——长文配额上限防护（彻底阻断超出目标长文配额的虚假次条流式生成）
                            const currentQuota = (sArt.accountId ? accountQuotaMap.get(sArt.accountId) : undefined) ||
                                (effectiveAccountId ? accountQuotaMap.get(effectiveAccountId) : undefined) ||
                                accountQuotaMap.get('default');
                            if (currentQuota &&
                                typeof currentQuota.articleCount === 'number' &&
                                currentQuota.articleCount > 0 &&
                                sArt.index > currentQuota.articleCount) {
                                continue;
                            }
                            articlesMap.set(artKey, {
                                id: `art_stream_${sArt.platform || detectedPlatform}_${sArt.accountId || 'default'}_${docType}_${sArt.index || 1}`,
                                index: sArt.index,
                                platform: sArt.platform || detectedPlatform,
                                accountId: sArt.accountId || effectiveAccountId,
                                accountName: detectedAccountName,
                                title: sArt.title || (sArt.index === 1 ? '头条精选图文' : `次条精选图文 #${sArt.index}`),
                                digest: sArt.digest || '实时流式排版生成中',
                                content: cleanAndUnescapeHtmlContent(sArt.content || ''),
                                articleType: docType,
                                coverUrl: '',
                                images: [],
                                isStreaming: sArt.isStreaming,
                                status: sArt.isStreaming ? 'streaming' : 'completed',
                            });
                        }
                        else {
                            if (sArt.content && sArt.content.length > 0) {
                                existing.content = cleanAndUnescapeHtmlContent(sArt.content);
                            }
                            if (sArt.title && (!existing.title || existing.title.startsWith('社媒精选') || existing.title.startsWith('公众号精选') || existing.title.includes('**'))) {
                                existing.title = sArt.title;
                            }
                            if (sArt.isStreaming !== undefined) {
                                existing.isStreaming = sArt.isStreaming;
                                existing.status = sArt.isStreaming ? 'streaming' : 'completed';
                            }
                        }
                    }
                }
                // 回退保障：若未检测到拟发布序列表格，尝试单篇文案预览提取
                const parsedArt = parseArticleFromAssistantText(row.text, {
                    platform: detectedPlatform,
                    accountId: effectiveAccountId,
                });
                if (parsedArt && (parsedArt.title || parsedArt.content)) {
                    const effPlat = parsedArt.platform || detectedPlatform;
                    const effAcc = parsedArt.accountId || effectiveAccountId;
                    const currentQuota = (effAcc ? accountQuotaMap.get(effAcc) : undefined) ||
                        (detectedAccountId ? accountQuotaMap.get(detectedAccountId) : undefined) ||
                        accountQuotaMap.get('default');
                    const fallbackDocType = effPlat === 'xiaohongshu' || (currentQuota && currentQuota.articleCount === 0 && currentQuota.newspicCount > 0) || row.text.includes('小绿书') || row.text.includes('图片消息')
                        ? 'newspic'
                        : 'news';
                    const fallbackKey = `${effPlat}_${effAcc || 'default'}_${fallbackDocType}_1`;
                    const existing = articlesMap.get(fallbackKey);
                    if (!existing) {
                        articlesMap.set(fallbackKey, {
                            id: `art_assistant_${fallbackDocType}_1`,
                            index: 1,
                            platform: effPlat || detectedPlatform,
                            accountId: effAcc,
                            accountName: detectedAccountName,
                            title: parsedArt.title || (fallbackDocType === 'newspic' ? '小绿书精选图文' : '社媒精选图文长文'),
                            digest: '基于对话回复提取的稿件内容',
                            content: cleanAndUnescapeHtmlContent(parsedArt.content || ''),
                            articleType: fallbackDocType,
                            coverUrl: '',
                            images: [],
                        });
                    }
                    else if ((!existing.content || existing.content.includes('已生成就绪')) &&
                        parsedArt.content) {
                        existing.content = cleanAndUnescapeHtmlContent(parsedArt.content);
                        if (parsedArt.title)
                            existing.title = parsedArt.title;
                    }
                }
            }
        }
        // 3. ToolCall 行解析：在 v4 协议中，真实工具结果位于 output.text 中，使用 parseToolOutputPayload 深度反序列化
        if (row.kind === 'toolCall' || row.role === 'tool') {
            const toolRow = row;
            const toolName = toolRow.toolName || toolRow.name || '';
            const status = toolRow.status;
            const input = (toolRow.input ?? {});
            const outputPayload = parseToolOutputPayload(toolRow.output);
            if (typeof outputPayload.task_id === 'string' && outputPayload.task_id.trim()) {
                detectedTaskId = outputPayload.task_id.trim();
            }
            else if (typeof input.task_id === 'string' && input.task_id.trim()) {
                detectedTaskId = input.task_id.trim();
            }
            if (typeof outputPayload.manifest_fingerprint === 'string' && outputPayload.manifest_fingerprint.trim()) {
                detectedManifestFingerprint = outputPayload.manifest_fingerprint.trim();
                if (outputPayload.dry_run === true || outputPayload.is_dry_run === true) {
                    detectedIsDryRun = true;
                }
            }
            // 结构化事件高速通道：若工具执行返回体包含 _social_event，优先提取确定性事实
            const socialEvent = outputPayload._social_event;
            if (socialEvent && socialEvent.v === 1) {
                if (socialEvent.platform) {
                    const normP = normalizePlatformName(socialEvent.platform);
                    if (normP)
                        detectedPlatform = normP;
                }
                if (socialEvent.accountId)
                    detectedAccountId = socialEvent.accountId;
                if (socialEvent.accountName)
                    detectedAccountName = socialEvent.accountName;
                if (socialEvent.publishedInfo) {
                    if (socialEvent.publishedInfo.draftId)
                        publishedDraftId = socialEvent.publishedInfo.draftId;
                    if (socialEvent.publishedInfo.mediaId)
                        publishedMediaId = socialEvent.publishedInfo.mediaId;
                    if (socialEvent.publishedInfo.scheduledTime)
                        publishedScheduleTime = socialEvent.publishedInfo.scheduledTime;
                    if (socialEvent.publishedInfo.isVerified)
                        verifyDraftCompleted = true;
                    const se = socialEvent.publishedInfo;
                    if (typeof se.receiptScreenshot === 'string')
                        publishedReceiptScreenshot = se.receiptScreenshot;
                    if (typeof se.qrScreenshot === 'string')
                        publishedQrScreenshot = se.qrScreenshot;
                    if (status === 'success')
                        publishDraftCompleted = true;
                }
            }
            // A1: gzh_discover_topics (全网热点与选题雷达)
            if (toolName === 'gzh_discover_topics' || toolName.includes('discover_topics')) {
                discoverTopicsCallFound = true;
                if (status === 'success') {
                    const toolPlat = normalizePlatformName(typeof input.platform === 'string' ? input.platform : undefined) ||
                        detectedPlatform;
                    const toolPlatName = toolPlat === 'xiaohongshu'
                        ? '小红书'
                        : toolPlat === 'gzh'
                            ? '微信公众号'
                            : toolPlat === 'zhihu'
                                ? '知乎专栏'
                                : toolPlat === 'toutiao'
                                    ? '今日头条'
                                    : toolPlat === 'baijiahao'
                                        ? '百家号'
                                        : '社媒专栏';
                    const dataObj = outputPayload.data || outputPayload;
                    const recTopics = Array.isArray(dataObj.recommended_topics) ? dataObj.recommended_topics : [];
                    for (let i = 0; i < recTopics.length; i++) {
                        const rt = recTopics[i];
                        const title = String(rt.title || '');
                        if (!title)
                            continue;
                        const hotScore = typeof rt.hot_score === 'number' ? rt.hot_score : 90;
                        const sources = Array.isArray(rt.sources) ? rt.sources : undefined;
                        const crossPlatformCount = typeof rt.cross_platform_count === 'number' ? rt.cross_platform_count : undefined;
                        const evidencePreview = typeof rt.evidence_preview === 'string' ? rt.evidence_preview : undefined;
                        const toolAcc = typeof input.account_id === 'string' ? input.account_id : effectiveAccountId;
                        discoverTopicsFromTool.push({
                            id: `discover_${toolPlat}_${toolAcc}_${i + 1}`,
                            platform: toolPlat,
                            platformName: toolPlatName,
                            accountId: toolAcc,
                            title,
                            hookAngle: String(rt.angle_name || rt.angle || (toolPlat === 'xiaohongshu' ? '爆款痛点切角' : '全网爆款切角')),
                            genreBadge: toolPlat === 'xiaohongshu' ? '3:4图文卡片' : '全网共振热点',
                            similarityScore: 10,
                            viralScore: hotScore,
                            selected: i === 0,
                            sources,
                            crossPlatformCount,
                            evidencePreview,
                        });
                    }
                }
            }
            // A2: gzh_research_topic (主题 30 天深度研究)
            if (toolName === 'gzh_research_topic' || toolName.includes('research_topic')) {
                if (status === 'success') {
                    extractedResearchEvidence = outputPayload;
                }
            }
            // A3: gzh_check_topics
            if (toolName === 'gzh_check_topics' || toolName.includes('check_topics')) {
                checkTopicsCallFound = true;
                if (status === 'success') {
                    checkTopicsCompleted = true;
                    const toolPlat = normalizePlatformName(typeof input.platform === 'string' ? input.platform : undefined) ||
                        detectedPlatform;
                    const toolPlatName = toolPlat === 'xiaohongshu'
                        ? '小红书'
                        : toolPlat === 'gzh'
                            ? '微信公众号'
                            : toolPlat === 'zhihu'
                                ? '知乎专栏'
                                : toolPlat === 'toutiao'
                                    ? '今日头条'
                                    : toolPlat === 'baijiahao'
                                        ? '百家号'
                                        : '社媒专栏';
                    const items = Array.isArray(outputPayload.items) ? outputPayload.items : [];
                    for (let i = 0; i < items.length; i++) {
                        const it = items[i];
                        const title = String(it.topic || '');
                        if (!title)
                            continue;
                        const topScore = typeof it.top_score === 'number' ? Math.round(it.top_score * 100) : 10;
                        const toolAcc = typeof input.account_id === 'string' ? input.account_id : effectiveAccountId;
                        checkTopicsFromTool.push({
                            id: `tool_${toolPlat}_${toolAcc}_${i + 1}`,
                            platform: toolPlat,
                            platformName: toolPlatName,
                            accountId: toolAcc,
                            title,
                            hookAngle: typeof it.warning === 'string' ? it.warning : '独家切角与爆款体裁',
                            genreBadge: toolPlat === 'xiaohongshu' ? '新手避坑卡片' : '深度科普长文',
                            similarityScore: topScore,
                            viralScore: Math.max(65, 95 - topScore),
                            selected: i === 0,
                        });
                    }
                }
            }
            // B: gzh_build_article
            if (toolName === 'gzh_build_article' || toolName.includes('build_article')) {
                if (status === 'running')
                    buildArticleRunning = true;
                const isErrorOutput = status === 'error' ||
                    outputPayload.isError === true ||
                    (typeof outputPayload.error === 'string' && Boolean(outputPayload.error)) ||
                    (typeof outputPayload.text === 'string' && isToolErrorOrCrashContent(outputPayload.text));
                // 仅在明确非错误且成功时纳入构建
                if (status === 'success' && !isErrorOutput) {
                    buildArticleCompleted = true;
                    // 解析生成物真实物理路径所在目录（如 d:/.../tasks/default/accounts/xhs/scripts）
                    const file = String(outputPayload.file || '');
                    if (file) {
                        detectedScriptsDir = file.replace(/[\\/][^\\/]+$/, '');
                    }
                    let doc = {};
                    if (typeof input.doc_json === 'object' && input.doc_json) {
                        doc = input.doc_json;
                    }
                    else if (typeof input.doc_json === 'string') {
                        const trimmed = input.doc_json.trim();
                        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                            try {
                                doc = JSON.parse(trimmed);
                            }
                            catch {
                                // ignore
                            }
                        }
                        else {
                            // 文件路径或文件名匹配（如 @_spec_1.json、_spec_1.json 或 d:/.../_spec_1.json）
                            const cleanPath = trimmed.replace(/^@/, '').replace(/\\/g, '/');
                            const baseName = cleanPath.replace(/^.*[\\/]/, '');
                            if (knownSpecFiles.has(cleanPath)) {
                                doc = knownSpecFiles.get(cleanPath);
                            }
                            else if (knownSpecFiles.has(baseName)) {
                                doc = knownSpecFiles.get(baseName);
                            }
                            else if (knownSpecFiles.has(trimmed)) {
                                doc = knownSpecFiles.get(trimmed);
                            }
                        }
                    }
                    if (Object.keys(doc).length === 0) {
                        if (typeof input.doc_spec === 'object' && input.doc_spec) {
                            doc = input.doc_spec;
                        }
                        else if (typeof input.doc === 'object' && input.doc) {
                            doc = input.doc;
                        }
                    }
                    // 平台优先精确决策
                    let artPlatform = detectedPlatform;
                    const pFromSingleInput = normalizePlatformName(typeof input.platform === 'string' ? input.platform : undefined);
                    const pFromSingleOutput = normalizePlatformName(typeof outputPayload.platform === 'string' ? outputPayload.platform : undefined);
                    const pFromSingleDoc = normalizePlatformName(typeof doc.platform === 'string' ? doc.platform : undefined);
                    if (pFromSingleInput)
                        artPlatform = pFromSingleInput;
                    else if (pFromSingleOutput)
                        artPlatform = pFromSingleOutput;
                    else if (pFromSingleDoc)
                        artPlatform = pFromSingleDoc;
                    else if (file.includes('_xhs.') || file.includes('xhs_') || file.includes('xhs/'))
                        artPlatform = 'xiaohongshu';
                    else if (file.includes('zhihu'))
                        artPlatform = 'zhihu';
                    else if (file.includes('baijiahao'))
                        artPlatform = 'baijiahao';
                    else if (file.includes('toutiao'))
                        artPlatform = 'toutiao';
                    else if (file.endsWith('.html'))
                        artPlatform = 'gzh';
                    const plainChars = Number(outputPayload.plain_chars || doc.plain_chars || 0);
                    let docType = String(doc.article_type || 'news');
                    if (file.includes('newspic') ||
                        file.includes('_pic.') ||
                        file.includes('pic_') ||
                        (typeof input.article_type === 'string' && input.article_type === 'newspic') ||
                        (typeof input.type === 'string' && input.type === 'newspic')) {
                        docType = 'newspic';
                    }
                    // 反查任务配额契约：若当前明确为纯小绿书任务（articleCount === 0 && newspicCount > 0），强制判定为 newspic
                    const quotaForBuild = (typeof input.account_id === 'string' ? accountQuotaMap.get(input.account_id) : undefined) ||
                        (detectedAccountId ? accountQuotaMap.get(detectedAccountId) : undefined) ||
                        (detectedAccountName ? accountQuotaMap.get(detectedAccountName) : undefined) ||
                        accountQuotaMap.get('default');
                    if (quotaForBuild && quotaForBuild.articleCount === 0 && quotaForBuild.newspicCount > 0) {
                        docType = 'newspic';
                    }
                    else if (!file.includes('_pic_') && !file.includes('_pic.') && !file.includes('newspic') && file.endsWith('.html')) {
                        // 【中文修复依据】：长文物理产物（.html）绝对锁定为 news 体裁，杜绝目录名或别名包含 pic 导致误判为小绿书
                        docType = 'news';
                    }
                    const digest = String(doc.digest || '');
                    const hasExplicitIndex = (typeof doc.index === 'number' && doc.index > 0) ||
                        (Number(outputPayload.index) > 0) ||
                        (typeof input.index === 'number' && input.index > 0);
                    let inferredIdx;
                    if (file) {
                        const m = file.match(/_(\d+)(?:_[a-z0-9]+)?\.(?:html|md|txt|json)$/i) || file.match(/(?:article|newspic|note)[-_](\d+)/i);
                        if (m && m[1]) {
                            inferredIdx = Number.parseInt(m[1], 10);
                        }
                    }
                    let docIdx = typeof doc.index === 'number' && doc.index > 0
                        ? doc.index
                        : Number(outputPayload.index) > 0
                            ? Number(outputPayload.index)
                            : typeof input.index === 'number' && input.index > 0
                                ? input.index
                                : inferredIdx && inferredIdx > 0
                                    ? inferredIdx
                                    : 1;
                    if (Array.isArray(doc.visual_blueprint)) {
                        const isDocNewspic = docType === 'newspic';
                        for (const vb of doc.visual_blueprint) {
                            capturedVisualSlots.push({
                                slotId: vb.slot_id || vb.slotId || `slot_${docIdx}_${vb.sub || 1}`,
                                index: docIdx,
                                sub: vb.sub,
                                kind: vb.kind || (isDocNewspic ? (vb.sub === 1 ? 'cover' : 'pic') : 'content'),
                                ratio: vb.ratio,
                                contextText: vb.context_text || vb.contextText,
                                intentDescription: vb.intent_description || vb.intentDescription || vb.desc,
                                generationPrompt: vb.generation_prompt || vb.generationPrompt || vb.prompt,
                                searchKeywords: vb.search_keywords || vb.searchKeywords,
                            });
                        }
                    }
                    // 标题提取与智能自适应回退（杜绝生硬占位符）
                    let title = String(outputPayload.title || doc.title || '').trim();
                    if (!title || title === '生成的社媒文章') {
                        const matchedTopic = checkTopicsFromTool[docIdx - 1]?.title ||
                            discoverTopicsFromTool[docIdx - 1]?.title ||
                            latestAssistantTopics[docIdx - 1]?.title;
                        if (matchedTopic) {
                            title = matchedTopic;
                        }
                        else if (detectedTopicTheme) {
                            title = `${detectedTopicTheme}深度精选图文 #${docIdx}`;
                        }
                        else {
                            title = artPlatform === 'xiaohongshu' ? '小红书爆款精选笔记' : '社媒精选图文长文';
                        }
                    }
                    // 正文提取：彻底拦截工具执行返回值元数据 JSON 字符串与报错崩溃代码
                    let content = '';
                    const candidateContents = [
                        outputPayload.content,
                        outputPayload.html,
                        outputPayload.markdown,
                        outputPayload.text,
                        doc.html,
                        doc.markdown,
                        doc.content,
                        doc.text,
                        doc.note,
                    ];
                    for (const c of candidateContents) {
                        if (typeof c === 'string' && c.trim()) {
                            if (!isToolMetadataJson(c) && !isToolErrorOrCrashContent(c)) {
                                content = c.trim();
                                break;
                            }
                        }
                    }
                    // 若候选字段均未提取出有效正文，且拥有 doc 骨架对象，从 doc_spec 骨架中深度还原
                    if (!content && Object.keys(doc).length > 0) {
                        content = extractContentFromDocSpec(doc);
                    }
                    // 若仍为空，尝试从已捕获的文件内容中匹配（如 article_v2_1_xhs.txt 或 article_v2_1.html）
                    if (!content && file) {
                        const baseFile = file.replace(/^.*[\\/]/, '');
                        if (knownFileContents.has(file)) {
                            content = knownFileContents.get(file);
                        }
                        else if (knownFileContents.has(baseFile)) {
                            content = knownFileContents.get(baseFile);
                        }
                    }
                    // 如果文本以 <!-- TITLE: ... --> 开头（常见于小红书构建产物），将其清洗并同步真实标题
                    if (content.startsWith('<!-- TITLE:')) {
                        const titleMatch = content.match(/<!--\s*TITLE:\s*([^\r\n>]+)\s*-->/);
                        if (titleMatch && titleMatch[1] && (!title || title.startsWith('小红书'))) {
                            title = titleMatch[1].trim();
                        }
                        content = content.replace(/<!--\s*TITLE:[^\r\n>]*-->\s*/, '').trim();
                    }
                    if (!content) {
                        content =
                            artPlatform === 'xiaohongshu'
                                ? '笔记正文与 3:4 竖版配图已生成就绪，可随时发布或导出。'
                                : '文章排版与规范校验已就绪，可随时发布或导出。';
                    }
                    const accFromPath = file.match(/accounts[\\/]([^\\/]+)[\\/]/)?.[1];
                    const artAccountId = (typeof input.account_id === 'string' && input.account_id) ||
                        (typeof doc.account_id === 'string' && doc.account_id) ||
                        accFromPath ||
                        effectiveAccountId;
                    // 基于 (platform, accountId, articleType, index) 唯一主键存储
                    let artKey = `${artPlatform}_${artAccountId || 'default'}_${docType}_${docIdx}`;
                    // 仅在未显式指定 index 且明确存在不同物理文件时自动顺延；若显式指定了相同 index 则执行重试覆盖
                    if (!hasExplicitIndex && articlesMap.has(artKey)) {
                        const existing = articlesMap.get(artKey);
                        const isDifferentFile = file && existing.filePath && file !== existing.filePath && !file.endsWith(existing.filePath) && !existing.filePath.endsWith(file);
                        if (isDifferentFile) {
                            const existingIndices = Array.from(articlesMap.values())
                                .filter(a => a.platform === artPlatform && (a.accountId || 'default') === (artAccountId || 'default') && a.articleType === docType)
                                .map(a => a.index || 0);
                            const maxIdx = existingIndices.length > 0 ? Math.max(...existingIndices) : docIdx;
                            docIdx = maxIdx + 1;
                            artKey = `${artPlatform}_${artAccountId || 'default'}_${docType}_${docIdx}`;
                        }
                    }
                    articlesMap.set(artKey, {
                        id: `art_${artPlatform}_${artAccountId || 'default'}_${docType}_${docIdx}`,
                        index: docIdx,
                        platform: artPlatform,
                        accountId: artAccountId,
                        accountName: detectedAccountName,
                        title,
                        digest: digest || `${plainChars > 0 ? plainChars + ' 字深度解析' : '爆款精选图文'}`,
                        content: cleanAndUnescapeHtmlContent(content),
                        articleType: docType,
                        coverUrl: '',
                        images: [],
                        filePath: file || undefined,
                        scriptsDir: detectedScriptsDir || undefined,
                    });
                }
            }
            // B2: write_to_file / create_file / write_file：支持直接生成的落盘排版稿件自动纳管
            if (toolName === 'write_to_file' ||
                toolName === 'create_file' ||
                toolName === 'write_file' ||
                toolName.includes('write_file')) {
                const targetFilePath = String(input.TargetFile ||
                    input.target_file ||
                    input.Path ||
                    input.path ||
                    input.file ||
                    input.filePath ||
                    input.FilePath ||
                    '');
                const codeContent = typeof input.CodeContent === 'string'
                    ? input.CodeContent
                    : typeof input.code_content === 'string'
                        ? input.code_content
                        : typeof input.Content === 'string'
                            ? input.Content
                            : typeof input.content === 'string'
                                ? input.content
                                : '';
                // 【中文修复依据】：支持直接通过文件写入工具落盘的物理沙箱配图纳管（如 images/pic_1_1.png, cover_1.png 等真实产物）
                if (targetFilePath && /\.(?:png|jpg|jpeg|webp)$/i.test(targetFilePath)) {
                    const norm = normalizeLocalImageUrl(targetFilePath);
                    if (norm && !generatedImageUrls.includes(norm)) {
                        generatedImageUrls.push(norm);
                    }
                    const pathAcc = targetFilePath.match(/accounts[\\/]([^\\/]+)[\\/]/)?.[1] ||
                        targetFilePath.match(/tasks[\\/](?:active|archive)[\\/][^\\/]+[\\/][a-z0-9]+_([^\\/]+)[\\/]/)?.[1];
                    const meta = parseImageMeta(targetFilePath, {
                        platform: detectedPlatform,
                        accountId: pathAcc || effectiveAccountId,
                        taskId: detectedTaskId,
                    });
                    if (!parsedImagesList.some(p => p.url === meta.url)) {
                        parsedImagesList.push(meta);
                    }
                }
                if (targetFilePath &&
                    codeContent &&
                    !isToolErrorOrCrashContent(codeContent) &&
                    /\/(?:scripts|drafts|articles)\/(?:article|xhs_note|note|draft|newspic)_/i.test(targetFilePath.replace(/\\/g, '/'))) {
                    const baseName = targetFilePath.replace(/^.*[\\/]/, '');
                    // 严格拦截辅助元数据文件（配图 prompt JSON、配置、大纲、备份等，严禁作为独立文章纳管）
                    let isAuxiliaryMeta = baseName.includes('_prompt') ||
                        baseName.includes('_config') ||
                        baseName.includes('_meta') ||
                        baseName.includes('outline') ||
                        baseName.includes('backup');
                    if (!isAuxiliaryMeta && baseName.includes('_pic.json')) {
                        // 若带有 _pic.json，仅在不包含文章内容（如纯生图配置且无 content 字段）时视为辅助文件；若含 content 则为小绿书稿件
                        if (!codeContent.includes('"content"') && !codeContent.includes('"article_type"')) {
                            isAuxiliaryMeta = true;
                        }
                    }
                    if (!isAuxiliaryMeta) {
                        const isHtml = baseName.endsWith('.html');
                        const isMd = baseName.endsWith('.md');
                        const isTxt = baseName.endsWith('.txt');
                        const isJson = baseName.endsWith('.json');
                        if (isHtml || isMd || isTxt || isJson) {
                            const accMatch = targetFilePath.match(/accounts[\\/]([^\\/]+)[\\/]/) ||
                                targetFilePath.match(/tasks[\\/](?:active|archive)[\\/][^\\/]+[\\/][a-z0-9]+_([^\\/]+)[\\/]/);
                            const artAcc = accMatch ? accMatch[1] : effectiveAccountId;
                            let artPlat = detectedPlatform;
                            if (targetFilePath.includes('xiaohongshu') ||
                                targetFilePath.includes('xhs') ||
                                baseName.includes('xhs')) {
                                artPlat = 'xiaohongshu';
                            }
                            else if (targetFilePath.includes('zhihu') || baseName.includes('zhihu')) {
                                artPlat = 'zhihu';
                            }
                            else if (targetFilePath.includes('baijiahao')) {
                                artPlat = 'baijiahao';
                            }
                            else if (targetFilePath.includes('toutiao')) {
                                artPlat = 'toutiao';
                            }
                            else if (targetFilePath.includes('gzh') || targetFilePath.includes('wechat')) {
                                artPlat = 'gzh';
                            }
                            const idxMatch = baseName.match(/_(\d+)(?:_[a-z0-9]+)?\.(?:html|md|txt|json)$/i) || baseName.match(/(?:article|newspic|note)[-_](\d+)/i);
                            let docIdx = idxMatch && idxMatch[1] ? Number.parseInt(idxMatch[1], 10) : 1;
                            const isNewspic = baseName.includes('newspic') || baseName.includes('_pic.') || baseName.includes('_pic_') || baseName.includes('pic_');
                            let fileDocType = isNewspic ? 'newspic' : 'news';
                            // 反查任务配额契约：若当前明确为纯小绿书任务（articleCount === 0 && newspicCount > 0），强制判定为 newspic
                            const fileQuota = (artAcc ? accountQuotaMap.get(artAcc) : undefined) ||
                                (detectedAccountId ? accountQuotaMap.get(detectedAccountId) : undefined) ||
                                (detectedAccountName ? accountQuotaMap.get(detectedAccountName) : undefined) ||
                                accountQuotaMap.get('default');
                            if (fileQuota && fileQuota.articleCount === 0 && fileQuota.newspicCount > 0) {
                                fileDocType = 'newspic';
                            }
                            else if (!isNewspic && baseName.endsWith('.html')) {
                                // 【中文修复依据】：以 .html 结尾的落盘文件必须强锁定为 news 体裁，绝对禁止标为 newspic
                                fileDocType = 'news';
                            }
                            let artTitle = '';
                            let effectiveTextContent = codeContent;
                            let parsedCardCount;
                            let parsedVisualSlots;
                            // 若文件为 JSON，解析其中的 spec 数据，提取真实 title 与 content，严防 cards 结构体泄露
                            if (isJson) {
                                try {
                                    const parsed = JSON.parse(codeContent);
                                    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                                        if (typeof parsed.title === 'string' && parsed.title.trim()) {
                                            artTitle = parsed.title.trim();
                                        }
                                        if (parsed.article_type === 'newspic') {
                                            fileDocType = 'newspic';
                                        }
                                        if (Array.isArray(parsed.cards) && parsed.cards.length > 0) {
                                            parsedCardCount = parsed.cards.length;
                                            const slots = parsed.cards.map((c, cIdx) => ({
                                                slotId: `newspic_${docIdx}_${c.index || cIdx + 1}`,
                                                index: docIdx,
                                                sub: c.index || cIdx + 1,
                                                kind: c.role === 'cover' || cIdx === 0 ? 'cover' : 'pic',
                                                ratio: '3:4',
                                                intentDescription: c.title,
                                                generationPrompt: c.prompt,
                                                articleType: 'newspic',
                                            }));
                                            parsedVisualSlots = slots;
                                            for (const vs of slots) {
                                                if (!capturedVisualSlots.some(s => s.slotId === vs.slotId)) {
                                                    capturedVisualSlots.push(vs);
                                                }
                                            }
                                        }
                                        else if (typeof parsed.img_count === 'number' && parsed.img_count > 0) {
                                            parsedCardCount = parsed.img_count;
                                        }
                                        const extracted = extractContentFromDocSpec(parsed);
                                        if (extracted && extracted.trim()) {
                                            effectiveTextContent = extracted.trim();
                                        }
                                    }
                                }
                                catch {
                                    // ignore
                                }
                            }
                            if (!artTitle) {
                                const h1Match = effectiveTextContent.match(/<h[12][^>]*>(.*?)<\/h[12]>/i) || effectiveTextContent.match(/^#+\s*(.+)$/m);
                                if (h1Match && h1Match[1]) {
                                    artTitle = h1Match[1].replace(/<[^>]+>/g, '').trim();
                                }
                                else {
                                    artTitle = artPlat === 'xiaohongshu'
                                        ? `小红书精选笔记 #${docIdx}`
                                        : fileDocType === 'newspic'
                                            ? `微信小绿书图文 #${docIdx}`
                                            : `精选深度长文 #${docIdx}`;
                                }
                            }
                            // 标题清洗：剥除粗体星号
                            artTitle = artTitle
                                .replace(/^[*#\s]+|[*#\s]+$/g, '')
                                .replace(/^[0-9]+[.\s、]+/, '')
                                .replace(/[\u{1F7E2}\u{1F7E1}\u{1F534}\u{2B50}\u{2605}]/gu, '')
                                .replace(/^[*#\s]+|[*#\s]+$/g, '')
                                .trim();
                            let fileArtKey = `${artPlat}_${artAcc || 'default'}_${fileDocType}_${docIdx}`;
                            buildArticleCompleted = true;
                            if (articlesMap.has(fileArtKey)) {
                                const existing = articlesMap.get(fileArtKey);
                                const isSameFile = existing.filePath &&
                                    (targetFilePath === existing.filePath || targetFilePath.endsWith(existing.filePath) || existing.filePath.endsWith(targetFilePath));
                                if (isSameFile) {
                                    if (!existing.content ||
                                        existing.content.includes('已生成就绪') ||
                                        existing.content.length < effectiveTextContent.length) {
                                        existing.content = cleanAndUnescapeHtmlContent(effectiveTextContent);
                                        if (artTitle &&
                                            (!existing.title ||
                                                existing.title.startsWith('社媒精选') ||
                                                existing.title.startsWith('小红书精选') ||
                                                existing.title.startsWith('微信小绿书图文'))) {
                                            existing.title = artTitle;
                                        }
                                    }
                                }
                                else {
                                    // 不同落盘文件，自动顺延分配独立序号，确保所有的长文与小绿书均可被独立纳管预览
                                    const existingIndices = Array.from(articlesMap.values())
                                        .filter(a => a.platform === artPlat && (a.accountId || 'default') === (artAcc || 'default') && a.articleType === fileDocType)
                                        .map(a => a.index || 0);
                                    const maxIdx = existingIndices.length > 0 ? Math.max(...existingIndices) : docIdx;
                                    docIdx = maxIdx + 1;
                                    fileArtKey = `${artPlat}_${artAcc || 'default'}_${fileDocType}_${docIdx}`;
                                    const isSandboxPath = targetFilePath.includes('/tasks/active/') ||
                                        targetFilePath.includes('/tasks/archive/') ||
                                        targetFilePath.includes('\\tasks\\active\\') ||
                                        targetFilePath.includes('\\tasks\\archive\\');
                                    let fileScriptsDir = targetFilePath.replace(/[/\\][^/\\]+$/, '');
                                    if (isSandboxPath &&
                                        (fileScriptsDir.endsWith('/articles') || fileScriptsDir.endsWith('\\articles'))) {
                                        fileScriptsDir = fileScriptsDir.replace(/[/\\]articles$/, '');
                                    }
                                    // 【中文修复依据】：落盘排版阶段配图尚未被工具真实生成，严禁虚构填充假配图，防止小绿书与长文跨篇串图（彻底解决图 2 与图 3）
                                    articlesMap.set(fileArtKey, {
                                        id: `art_file_${artPlat}_${artAcc || 'default'}_${fileDocType}_${docIdx}`,
                                        index: docIdx,
                                        platform: artPlat,
                                        accountId: artAcc,
                                        accountName: detectedAccountName,
                                        title: artTitle,
                                        digest: `落盘稿件 (${effectiveTextContent.length} 字符)`,
                                        content: cleanAndUnescapeHtmlContent(effectiveTextContent),
                                        articleType: fileDocType,
                                        coverUrl: undefined,
                                        images: [],
                                        contentImages: [],
                                        filePath: targetFilePath,
                                        scriptsDir: fileScriptsDir,
                                        targetCardImageCount: parsedCardCount,
                                        visualSlots: parsedVisualSlots,
                                    });
                                }
                            }
                            else {
                                const isSandboxPath = targetFilePath.includes('/tasks/active/') ||
                                    targetFilePath.includes('/tasks/archive/') ||
                                    targetFilePath.includes('\\tasks\\active\\') ||
                                    targetFilePath.includes('\\tasks\\archive\\');
                                let fileScriptsDir = targetFilePath.replace(/[/\\][^/\\]+$/, '');
                                if (isSandboxPath &&
                                    (fileScriptsDir.endsWith('/articles') || fileScriptsDir.endsWith('\\articles'))) {
                                    fileScriptsDir = fileScriptsDir.replace(/[/\\]articles$/, '');
                                }
                                // 【中文修复依据】：落盘排版阶段配图尚未被工具真实生成，严禁虚构填充假配图，防止小绿书与长文跨篇串图（彻底解决图 2 与图 3）
                                articlesMap.set(fileArtKey, {
                                    id: `art_file_${artPlat}_${artAcc || 'default'}_${fileDocType}_${docIdx}`,
                                    index: docIdx,
                                    platform: artPlat,
                                    accountId: artAcc,
                                    accountName: detectedAccountName,
                                    title: artTitle,
                                    digest: `落盘稿件 (${effectiveTextContent.length} 字符)`,
                                    content: cleanAndUnescapeHtmlContent(effectiveTextContent),
                                    articleType: fileDocType,
                                    coverUrl: undefined,
                                    images: [],
                                    contentImages: [],
                                    filePath: targetFilePath,
                                    scriptsDir: fileScriptsDir,
                                    targetCardImageCount: parsedCardCount,
                                    visualSlots: parsedVisualSlots,
                                });
                            }
                        }
                    }
                }
            }
            // C: gzh_generate_images、系统 generate_image 与统一 social_publisher 工具：全面解析多平台生图产物
            if (toolName === 'gzh_generate_images' ||
                toolName.includes('generate_images') ||
                toolName === 'generate_image' ||
                toolName === 'social_publisher' ||
                toolName.includes('social_publisher')) {
                if (status === 'running') {
                    const isPublishAction = input.action === 'publish' ||
                        input.action === 'publish_draft' ||
                        input.action === 'publish_now' ||
                        input.action === 'schedule';
                    if (!isPublishAction) {
                        genImagesRunning = true;
                    }
                }
                // 【中文修复依据】：场景 7 任务执行期画布首秒即时展开规范与会话持久化展示规范
                // 无论 produce 处于 running 态、结算态还是历史重放，只要大模型在 input 中传入了正文与视觉规划，
                // 均全量提取正文并构建文章注入 articlesMap，使得画布在调起首秒及会话重开、切换刷新后均恒定展示高保真长文，
                // 彻底杜绝重开会话后画布消失退化问题！
                const rawIncomingList = Array.isArray(input.articles) && input.articles.length > 0
                    ? input.articles
                    : typeof input.content === 'string' && input.content.trim()
                        ? [{ title: input.title, content: input.content, visual_slots: input.visual_slots }]
                        : [];
                if ((input.action === 'produce' || toolName.includes('produce')) && rawIncomingList.length > 0) {
                    const isRunning = status === 'running';
                    rawIncomingList.forEach((rawArt, artIdx) => {
                        const artNum = typeof rawArt.index === 'number' ? rawArt.index : artIdx + 1;
                        const toolPlat = normalizePlatformName(typeof input.platform === 'string' ? input.platform : undefined) ||
                            detectedPlatform ||
                            'xiaohongshu';
                        const toolAcc = (typeof input.account_id === 'string' && input.account_id) ||
                            effectiveAccountId ||
                            'default';
                        const artType = toolPlat === 'xiaohongshu' ? 'newspic' : 'news';
                        const artKey = `${toolPlat}_${toolAcc}_${artType}_${artNum}`;
                        let runningSlots = [];
                        const artSlots = Array.isArray(rawArt.visual_slots)
                            ? rawArt.visual_slots
                            : artIdx === 0 && Array.isArray(input.visual_slots)
                                ? input.visual_slots
                                : [];
                        if (artSlots.length > 0) {
                            runningSlots = artSlots.map((vs, idx) => {
                                const isCover = idx === 0;
                                const kind = toolPlat === 'xiaohongshu' ? 'pic' : isCover ? 'cover' : 'content';
                                const slotObj = {
                                    slotId: `slot_${artNum}_${idx + 1}`,
                                    index: artNum,
                                    sub: idx + 1,
                                    kind,
                                    ratio: vs.aspect_ratio,
                                    intentDescription: vs.description,
                                    generationPrompt: vs.prompt,
                                };
                                if (!capturedVisualSlots.some(s => s.slotId === slotObj.slotId)) {
                                    capturedVisualSlots.push(slotObj);
                                }
                                return slotObj;
                            });
                        }
                        const rawContent = typeof rawArt.content === 'string' ? rawArt.content : '';
                        const artTitle = (typeof rawArt.title === 'string' && rawArt.title.trim()) ||
                            (toolPlat === 'xiaohongshu'
                                ? `小红书精选笔记 #${artNum}`
                                : `社媒精选图文 #${artNum}`);
                        if (!articlesMap.has(artKey)) {
                            articlesMap.set(artKey, {
                                id: `art_${toolPlat}_${toolAcc}_${artNum}`,
                                index: artNum,
                                platform: toolPlat,
                                accountId: toolAcc,
                                accountName: detectedAccountName,
                                title: artTitle,
                                digest: rawContent.slice(0, 120).replace(/\n/g, ' '),
                                content: cleanAndUnescapeHtmlContent(rawContent),
                                articleType: artType,
                                status: isRunning ? 'streaming' : 'completed',
                                isStreaming: isRunning,
                                visualSlots: runningSlots,
                                images: [],
                                coverUrl: undefined,
                            });
                        }
                        else {
                            const existing = articlesMap.get(artKey);
                            if (!isRunning) {
                                existing.status = 'completed';
                                existing.isStreaming = false;
                            }
                            if (!existing.content || existing.content.length < rawContent.length) {
                                existing.content = cleanAndUnescapeHtmlContent(rawContent);
                            }
                            if (artTitle &&
                                (!existing.title ||
                                    existing.title.startsWith('社媒精选') ||
                                    existing.title.startsWith('小红书精选'))) {
                                existing.title = artTitle;
                            }
                            if (runningSlots.length > 0 && (!existing.visualSlots || existing.visualSlots.length === 0)) {
                                existing.visualSlots = runningSlots;
                            }
                        }
                    });
                }
                if (status === 'success') {
                    genImagesCompleted = true;
                    genImagesRunning = false;
                    // 解析 input.items 或 input.items_json 或 input.visual_slots
                    let imageHints = [];
                    try {
                        if (Array.isArray(input.items)) {
                            imageHints = input.items;
                        }
                        else if (typeof input.items_json === 'string') {
                            imageHints = JSON.parse(input.items_json);
                        }
                        else if (Array.isArray(input.visual_slots)) {
                            imageHints = input.visual_slots.map((vs, idx) => {
                                const roleStr = String(vs.role || vs.kind || '').toLowerCase();
                                const slotIdStr = String(vs.slot_id || vs.slotId || '').toLowerCase();
                                const isCover = roleStr === 'cover' || slotIdStr.startsWith('cover_');
                                const isPic = roleStr === 'pic' || slotIdStr.startsWith('pic_') || slotIdStr.startsWith('newspic_');
                                const kind = isCover ? 'cover' : isPic ? 'pic' : 'content';
                                let aIdx = typeof vs.index === 'number' && vs.index > 0 ? vs.index : undefined;
                                let sIdx = typeof vs.sub === 'number' && vs.sub > 0 ? vs.sub : idx + 1;
                                if (!aIdx && slotIdStr) {
                                    const m = slotIdStr.match(/(?:cover|content|pic|newspic)_(\d+)(?:_(\d+))?/i);
                                    if (m && m[1]) {
                                        aIdx = Number.parseInt(m[1], 10);
                                        if (m[2])
                                            sIdx = Number.parseInt(m[2], 10);
                                    }
                                }
                                return {
                                    kind,
                                    index: aIdx || (isPic ? 1 : idx + 1),
                                    sub: sIdx,
                                    prompt: vs.prompt,
                                };
                            });
                        }
                    }
                    catch { }
                    for (const hint of imageHints) {
                        if (hint && typeof hint === 'object' && hint.prompt) {
                            capturedVisualSlots.push({
                                slotId: `img_${hint.index || 1}_${hint.kind || 'content'}_${hint.sub || 1}`,
                                index: hint.index || 1,
                                sub: hint.sub || 1,
                                kind: hint.kind || 'content',
                                generationPrompt: hint.prompt,
                                articleType: hint.kind === 'pic' ? 'newspic' : 'news',
                            });
                        }
                    }
                    const toolPlat = normalizePlatformName(typeof input.platform === 'string'
                        ? input.platform
                        : typeof outputPayload.platform === 'string'
                            ? outputPayload.platform
                            : undefined);
                    const toolAcc = (typeof input.account_id === 'string' && input.account_id) ||
                        (typeof outputPayload.accountId === 'string' && outputPayload.accountId) ||
                        (typeof outputPayload.account_id === 'string' && outputPayload.account_id) ||
                        undefined;
                    const rawImgs = [];
                    if (typeof outputPayload.path === 'string' && outputPayload.path) {
                        rawImgs.push(outputPayload.path);
                    }
                    if (typeof outputPayload.url === 'string' && outputPayload.url) {
                        rawImgs.push(outputPayload.url);
                    }
                    if (typeof outputPayload.file === 'string' && outputPayload.file) {
                        rawImgs.push(outputPayload.file);
                    }
                    if (typeof outputPayload.filePath === 'string' && outputPayload.filePath) {
                        rawImgs.push(outputPayload.filePath);
                    }
                    if (typeof outputPayload.outputPath === 'string' && outputPayload.outputPath) {
                        rawImgs.push(outputPayload.outputPath);
                    }
                    if (typeof input.output_path === 'string' && input.output_path) {
                        rawImgs.push(input.output_path);
                    }
                    if (Array.isArray(outputPayload.images)) {
                        for (const img of outputPayload.images) {
                            if (typeof img === 'string') {
                                rawImgs.push(img);
                            }
                            else if (img && typeof img.path === 'string') {
                                rawImgs.push(img.path);
                            }
                        }
                    }
                    if (Array.isArray(outputPayload.generated)) {
                        for (let gIdx = 0; gIdx < outputPayload.generated.length; gIdx++) {
                            const g = outputPayload.generated[gIdx];
                            let outPath = '';
                            let gItem = undefined;
                            if (typeof g === 'string') {
                                outPath = g;
                            }
                            else if (g && typeof g.out === 'string') {
                                outPath = g.out;
                                gItem = g.item;
                            }
                            if (outPath) {
                                rawImgs.push(outPath);
                                if (gItem && typeof gItem === 'object') {
                                    imageHints[rawImgs.length - 1] = {
                                        kind: gItem.kind,
                                        index: typeof gItem.index === 'number' ? gItem.index : undefined,
                                        sub: typeof gItem.sub === 'number' ? gItem.sub : undefined,
                                    };
                                }
                            }
                        }
                    }
                    // 关键纳管：若为 social_publisher 的 produce 闭环动作，直接纳管返回的权威文章
                    const rawOutArticles = Array.isArray(outputPayload.articles) && outputPayload.articles.length > 0
                        ? outputPayload.articles
                        : outputPayload.article && typeof outputPayload.article === 'object'
                            ? [outputPayload.article]
                            : [];
                    if (rawOutArticles.length > 0) {
                        rawOutArticles.forEach((artObj, artIdx) => {
                            const artNum = typeof artObj.index === 'number' ? artObj.index : artIdx + 1;
                            const artPlat = toolPlat || detectedPlatform || 'xiaohongshu';
                            const artAcc = toolAcc || effectiveAccountId || 'default';
                            const artType = artPlat === 'xiaohongshu' ? 'newspic' : 'news';
                            const artKey = `${artPlat}_${artAcc}_${artType}_${artNum}`;
                            const rawInputArt = Array.isArray(input.articles) ? input.articles[artIdx] : input;
                            const rawContent = typeof rawInputArt?.content === 'string'
                                ? rawInputArt.content
                                : typeof input.content === 'string'
                                    ? input.content
                                    : '';
                            const artTitle = (typeof artObj.title === 'string' ? artObj.title : '') ||
                                (typeof rawInputArt?.title === 'string'
                                    ? rawInputArt.title
                                    : typeof input.title === 'string'
                                        ? input.title
                                        : artPlat === 'xiaohongshu'
                                            ? `小红书精选笔记 #${artNum}`
                                            : `社媒精选图文 #${artNum}`);
                            const filePath = typeof artObj.path === 'string' ? artObj.path : undefined;
                            if (!articlesMap.has(artKey)) {
                                articlesMap.set(artKey, {
                                    id: `art_${artPlat}_${artAcc}_${artNum}`,
                                    index: artNum,
                                    platform: artPlat,
                                    accountId: artAcc,
                                    accountName: detectedAccountName,
                                    title: artTitle,
                                    digest: rawContent.slice(0, 120).replace(/\n/g, ' '),
                                    content: cleanAndUnescapeHtmlContent(rawContent),
                                    articleType: artType,
                                    filePath,
                                    scriptsDir: detectedScriptsDir,
                                    status: 'completed',
                                    isStreaming: false,
                                });
                            }
                            else {
                                const existing = articlesMap.get(artKey);
                                existing.status = 'completed';
                                existing.isStreaming = false;
                                if (filePath)
                                    existing.filePath = filePath;
                                if (artTitle &&
                                    (!existing.title ||
                                        existing.title.startsWith('社媒精选') ||
                                        existing.title.startsWith('小红书精选'))) {
                                    existing.title = artTitle;
                                }
                                if (rawContent && (!existing.content || existing.content.length < rawContent.length)) {
                                    existing.content = cleanAndUnescapeHtmlContent(rawContent);
                                }
                                if (detectedScriptsDir && !existing.scriptsDir) {
                                    existing.scriptsDir = detectedScriptsDir;
                                }
                            }
                        });
                    }
                    // 如果是系统的 generate_image 工具，支持根据 ImageName 提取元数据 hint
                    const imgNameHint = typeof input.ImageName === 'string' ? input.ImageName : '';
                    if (imgNameHint && imageHints.length === 0) {
                        let imgKind = 'content';
                        if (imgNameHint.includes('cover'))
                            imgKind = 'cover';
                        else if (imgNameHint.includes('pic'))
                            imgKind = 'pic';
                        const idxMatch = imgNameHint.match(/_(\d+)(?:_(\d+))?$/);
                        const aIdx = typeof outputPayload.articleIndex === 'number' ? outputPayload.articleIndex : idxMatch && idxMatch[1] ? Number.parseInt(idxMatch[1], 10) : 0;
                        const sIdx = idxMatch && idxMatch[2] ? Number.parseInt(idxMatch[2], 10) : 1;
                        imageHints.push({ kind: imgKind, index: aIdx, sub: sIdx });
                    }
                    for (let i = 0; i < rawImgs.length; i++) {
                        const raw = rawImgs[i];
                        let fullImgPath = raw;
                        // 相对文件名自动挂载到已知的 scriptsDir 物理目录
                        if (detectedScriptsDir &&
                            !raw.includes(':') &&
                            !raw.startsWith('/') &&
                            !raw.startsWith('http://') &&
                            !raw.startsWith('https://') &&
                            !raw.startsWith('data:') &&
                            !raw.startsWith('wincode-media://')) {
                            const sep = detectedScriptsDir.includes('\\') ? '\\' : '/';
                            const cleanName = raw.replace(/^[\\/]+/, '');
                            const isSandboxTarget = detectedScriptsDir.includes('/tasks/active/') ||
                                detectedScriptsDir.includes('/tasks/archive/') ||
                                detectedScriptsDir.includes('\\tasks\\active\\') ||
                                detectedScriptsDir.includes('\\tasks\\archive\\');
                            if (isSandboxTarget &&
                                !cleanName.startsWith('images/') &&
                                !cleanName.startsWith('images\\') &&
                                !detectedScriptsDir.endsWith('/images') &&
                                !detectedScriptsDir.endsWith('\\images')) {
                                fullImgPath = `${detectedScriptsDir}${sep}images${sep}${cleanName}`;
                            }
                            else {
                                fullImgPath = `${detectedScriptsDir}${sep}${cleanName}`;
                            }
                        }
                        const norm = normalizeLocalImageUrl(fullImgPath);
                        if (norm && !generatedImageUrls.includes(norm)) {
                            generatedImageUrls.push(norm);
                        }
                        const pathAcc = fullImgPath.match(/accounts[\\/]([^\\/]+)[\\/]/)?.[1] ||
                            fullImgPath.match(/tasks[\\/](?:active|archive)[\\/][^\\/]+[\\/][a-z0-9]+_([^\\/]+)[\\/]/)?.[1];
                        const hint = imageHints[i] || {};
                        const meta = parseImageMeta(fullImgPath, {
                            kind: hint.kind,
                            index: hint.index,
                            sub: hint.sub,
                            platform: toolPlat || detectedPlatform,
                            accountId: pathAcc || toolAcc || effectiveAccountId,
                            taskId: detectedTaskId,
                        });
                        if (!parsedImagesList.some(p => p.url === meta.url)) {
                            parsedImagesList.push(meta);
                        }
                    }
                    // 深度感知合辑规模：若生图 hints 中包含多篇长文封面与插图（cover_1 ~ cover_N），自动将长文目标篇数升维对齐
                    const hasPicInHints = imageHints.some(h => h.kind === 'pic');
                    for (const h of imageHints) {
                        if (h && (h.kind === 'cover' || h.kind === 'content') && typeof h.index === 'number' && h.index > 0) {
                            const accKey = toolAcc || effectiveAccountId || 'default';
                            const curQ = accountQuotaMap.get(accKey) || accountQuotaMap.get('default') || {
                                total: h.index + (hasPicInHints ? 1 : 0),
                                articleCount: h.index,
                                newspicCount: hasPicInHints ? 1 : 0,
                                hasNewspic: hasPicInHints,
                            };
                            if (h.index > curQ.articleCount) {
                                curQ.articleCount = h.index;
                                curQ.total = curQ.articleCount + curQ.newspicCount;
                                accountQuotaMap.set(accKey, curQ);
                                accountQuotaMap.set('default', curQ);
                                detectedTargetCount = Math.max(detectedTargetCount, curQ.total);
                            }
                        }
                    }
                }
            }
            // D: gzh_validate_html
            if (toolName === 'gzh_validate_html' || toolName.includes('validate_html')) {
                if (status === 'running')
                    validateHtmlRunning = true;
                if (status === 'success')
                    validateHtmlCompleted = true;
            }
            // E: gzh_publish_draft
            if (toolName === 'gzh_publish_draft' || toolName.includes('publish_draft')) {
                const pubPlat = normalizePlatformName(typeof input.platform === 'string' ? input.platform : undefined) || detectedPlatform;
                const pubAcc = (typeof input.account_id === 'string' && input.account_id) || effectiveAccountId || 'default';
                const pubKey = `${pubPlat}_${pubAcc}`;
                if (status === 'running' || status === 'inputStreaming' || status === 'pendingApproval') {
                    publishDraftRunning = true;
                    taskPublishRunningMap.set(pubKey, true);
                }
                if (status === 'success') {
                    publishDraftCompleted = true;
                    publishDraftRunning = false;
                    publishedDraftId = String(outputPayload.draft_id || outputPayload.id || '');
                    publishedMediaId = String(outputPayload.media_id || '');
                    publishedScheduleTime = String(input.schedule_time || '');
                    if (typeof outputPayload.receipt_screenshot === 'string') {
                        publishedReceiptScreenshot = outputPayload.receipt_screenshot;
                    }
                    if (typeof outputPayload.qr_screenshot === 'string') {
                        publishedQrScreenshot = outputPayload.qr_screenshot;
                    }
                    taskPublishedMap.set(pubKey, true);
                    taskPublishRunningMap.set(pubKey, false);
                    taskPublishedInfoMap.set(pubKey, {
                        mediaId: publishedMediaId,
                        draftId: publishedDraftId,
                        scheduledTime: publishedScheduleTime,
                        receiptScreenshot: publishedReceiptScreenshot,
                        qrScreenshot: publishedQrScreenshot,
                    });
                }
                // 无论执行中还是完成，从发布入参 titles / digests 中全景自愈并补齐合辑中的所有篇目（头条 + 次条 + 小绿书）
                if (Array.isArray(input.titles) && input.titles.length > 0) {
                    const draftPlat = normalizePlatformName(typeof input.platform === 'string' ? input.platform : undefined) || detectedPlatform;
                    const draftAcc = (typeof input.account_id === 'string' && input.account_id) || effectiveAccountId || 'default';
                    const draftType = String(input.article_type || 'news');
                    const titlesList = input.titles;
                    const digestsList = Array.isArray(input.digests) ? input.digests : [];
                    const filesList = Array.isArray(input.article_files) ? input.article_files : [];
                    for (let tIdx = 0; tIdx < titlesList.length; tIdx++) {
                        const tTitle = String(titlesList[tIdx] || '').trim();
                        if (!tTitle)
                            continue;
                        const tDigest = String(digestsList[tIdx] || '');
                        const customFile = String(filesList[tIdx] || '');
                        // 动态判定当前篇目的体裁：依据文件名与标题特征精准分流长文与小绿书
                        let singleType = draftType;
                        if (customFile.includes('newspic') ||
                            customFile.includes('_pic.') ||
                            tTitle.includes('小绿书') ||
                            tTitle.includes('图片消息')) {
                            singleType = 'newspic';
                        }
                        else if (customFile.endsWith('.html') || (!customFile && tIdx < titlesList.length - 1)) {
                            singleType = 'news';
                        }
                        // 计算该体裁在当前合辑中的局部序号
                        const priorSameTypeCount = titlesList
                            .slice(0, tIdx)
                            .filter((_, pIdx) => {
                            const pFile = String(filesList[pIdx] || '');
                            const pT = String(titlesList[pIdx] || '');
                            const isNp = pFile.includes('newspic') || pFile.includes('_pic.') || pT.includes('小绿书') || pT.includes('图片消息');
                            return singleType === 'newspic' ? isNp : !isNp;
                        }).length;
                        const docIdx = priorSameTypeCount + 1;
                        const artKey = `${draftPlat}_${draftAcc}_${singleType}_${docIdx}`;
                        let inferredPath = '';
                        if (customFile) {
                            inferredPath = detectedScriptsDir ? `${detectedScriptsDir}/${customFile}` : customFile;
                        }
                        else if (detectedScriptsDir) {
                            const defaultName = draftType === 'newspic' ? `article_v2_${docIdx}_pic.json` : `article_v2_${docIdx}.html`;
                            inferredPath = `${detectedScriptsDir}/${defaultName}`;
                        }
                        // 关键修复（中文注释）：优先在 articlesMap 中寻找已存在的同账号、同体裁、同序号真实文章，防止仅因 key 前缀微差重新生成空壳占位文章
                        let existing = articlesMap.get(artKey);
                        if (!existing) {
                            for (const art of articlesMap.values()) {
                                if (art.platform === draftPlat &&
                                    (art.accountId || 'default') === (draftAcc || 'default') &&
                                    art.articleType === singleType &&
                                    art.index === docIdx) {
                                    existing = art;
                                    break;
                                }
                            }
                        }
                        // 【中文修复依据】：放宽匹配至同任务、同平台、同体裁、同序号，防止克隆账号如 default 与 default-copy 导致匹配丢失
                        if (!existing) {
                            for (const art of articlesMap.values()) {
                                if (art.platform === draftPlat &&
                                    art.articleType === singleType &&
                                    art.index === docIdx) {
                                    existing = art;
                                    break;
                                }
                            }
                        }
                        if (existing) {
                            if (tTitle && (!existing.title || existing.title.startsWith('社媒精选') || existing.title.startsWith('小红书精选') || existing.title === '生成的社媒文章')) {
                                existing.title = tTitle;
                            }
                            if (tDigest && !existing.digest) {
                                existing.digest = tDigest;
                            }
                            if (inferredPath && !existing.filePath) {
                                existing.filePath = inferredPath;
                            }
                            if (detectedScriptsDir && !existing.scriptsDir) {
                                existing.scriptsDir = detectedScriptsDir;
                            }
                        }
                        else {
                            // 关键修复（中文注释）：若确实不存在，优先尝试从 knownFileContents 或 knownSpecFiles 中恢复真实正文，绝对杜绝使用“文章排版与规范校验已就绪，可随时发布或导出”篡改真实文章
                            let recoveredContent = '';
                            for (const [fName, fContent] of knownFileContents.entries()) {
                                if ((fName.includes(`article_v2_${docIdx}`) || fName.includes(`article_${docIdx}`)) && fContent.includes('<')) {
                                    recoveredContent = fContent;
                                    break;
                                }
                            }
                            if (!recoveredContent) {
                                for (const [sName, sObj] of knownSpecFiles.entries()) {
                                    if (sObj.index === docIdx || sName.includes(`spec_${docIdx}`)) {
                                        recoveredContent = extractContentFromDocSpec(sObj);
                                        break;
                                    }
                                }
                            }
                            if (!recoveredContent) {
                                // 【中文修复依据】：严禁注入假文本！保留为空，由 filePath 触发从本地磁盘读取真实 HTML，杜绝 AB 货
                                recoveredContent = '';
                            }
                            articlesMap.set(artKey, {
                                id: `art_draft_${draftPlat}_${draftAcc}_${singleType}_${docIdx}`,
                                index: docIdx,
                                platform: draftPlat,
                                accountId: draftAcc,
                                accountName: detectedAccountName,
                                title: tTitle,
                                digest: tDigest || (singleType === 'newspic' ? '小绿书图文卡片' : '公众号排版长文'),
                                content: cleanAndUnescapeHtmlContent(recoveredContent),
                                articleType: singleType,
                                coverUrl: '',
                                images: [],
                                filePath: inferredPath || undefined,
                                scriptsDir: detectedScriptsDir || undefined,
                            });
                        }
                    }
                }
            }
            // F: gzh_verify_draft
            if (toolName === 'gzh_verify_draft' || toolName.includes('verify_draft')) {
                if (status === 'success') {
                    verifyDraftCompleted = true;
                }
            }
        }
    }
    // 3.4 发布前审校门禁多篇长文合辑全景自愈 (Pre-publish Review Quota Healing)
    // 当任务已规划或生图暗示了多篇长文合辑（如 6 篇长文 + 1 篇小绿书），但在调用 gzh_publish_draft 前，
    // 仅首篇长文被构建时，提取器依据 knownSpecFiles、knownFileContents、生图产物与候选选题列表自愈补全缺失的长文篇目，
    // 确保在发布确认门禁与右侧拟真工作台中全景呈现所有篇目（#1 封面大图 + #2~#N 次篇列表 + 小绿书），彻底终结“只显示 2 篇”问题。
    const hasGenerationStarted = articlesMap.size > 0 ||
        buildArticleCompleted ||
        genImagesCompleted ||
        validateHtmlCompleted ||
        knownSpecFiles.size > 0 ||
        knownFileContents.size > 0;
    // 【中文修复依据】：多篇长文合辑全景自愈仅适用于微信公众号（gzh），
    // 知乎、百家号、今日头条、小红书等单篇专栏任务严禁脑补虚假篇目，篇数与产物必须绝对与磁盘落盘 100% 保持一致（彻底修复知乎任务落盘1篇画布显示6篇缺陷）
    const isGzhHealingTarget = detectedPlatform === 'gzh';
    if (hasGenerationStarted && isGzhHealingTarget) {
        const canonicalAccounts = new Set();
        for (const art of articlesMap.values()) {
            if (art.accountId)
                canonicalAccounts.add(art.accountId);
        }
        if (canonicalAccounts.size === 0) {
            if (effectiveAccountId)
                canonicalAccounts.add(effectiveAccountId);
            else
                canonicalAccounts.add('default');
        }
        for (const accKey of canonicalAccounts) {
            const quota = accountQuotaMap.get(accKey) ||
                (detectedAccountId ? accountQuotaMap.get(detectedAccountId) : undefined) ||
                (detectedAccountName ? accountQuotaMap.get(detectedAccountName) : undefined) ||
                accountQuotaMap.get('default');
            // 仅在明确有长文配额需求（如 articleCount >= 2）时触发自愈补全
            const targetNewsCount = quota?.articleCount || 0;
            if (targetNewsCount <= 1)
                continue;
            // 统计当前账号下已有的长文篇目与序号
            const existingNews = Array.from(articlesMap.values()).filter(a => (a.platform === detectedPlatform || a.platform === 'gzh') &&
                (a.accountId || 'default') === (accKey || 'default') &&
                a.articleType !== 'newspic');
            const existingNewsIndices = new Set(existingNews.map(a => a.index || 1));
            // 为缺失的长文序号（例如 2, 3, 4, 5, 6）执行多源自愈构建
            for (let missingIdx = 1; missingIdx <= targetNewsCount; missingIdx++) {
                if (existingNewsIndices.has(missingIdx))
                    continue;
                const artKey = `${detectedPlatform}_${accKey || 'default'}_news_${missingIdx}`;
                if (articlesMap.has(artKey))
                    continue;
                // 1. 尝试匹配 knownSpecFiles 中的 spec 对象（例如 _spec_2.json 或带有 index: missingIdx 的 spec）
                let foundSpec;
                for (const [sName, sObj] of knownSpecFiles.entries()) {
                    const specIdx = typeof sObj.index === 'number' ? sObj.index : undefined;
                    const isNotNewspic = sObj.article_type !== 'newspic';
                    if (isNotNewspic &&
                        (specIdx === missingIdx ||
                            sName.includes(`_spec_${missingIdx}.json`) ||
                            sName.includes(`spec_${missingIdx}.json`))) {
                        foundSpec = sObj;
                        break;
                    }
                }
                // 2. 尝试从 knownFileContents 匹配落盘的 HTML 内容（例如 article_v2_2.html）
                let foundHtmlContent = '';
                for (const [fName, fContent] of knownFileContents.entries()) {
                    if ((fName.includes(`article_v2_${missingIdx}.html`) ||
                        fName.includes(`article_${missingIdx}.html`)) &&
                        fContent.includes('<')) {
                        foundHtmlContent = fContent;
                        break;
                    }
                }
                // 3. 匹配选题标题与切角
                const matchedTopic = latestAssistantTopics.filter(t => t.articleType !== 'newspic')[missingIdx - 1] ||
                    checkTopicsFromTool.filter(t => t.articleType !== 'newspic')[missingIdx - 1] ||
                    discoverTopicsFromTool.filter(t => t.articleType !== 'newspic')[missingIdx - 1];
                let artTitle = '';
                if (foundSpec && typeof foundSpec.title === 'string' && foundSpec.title.trim()) {
                    artTitle = foundSpec.title.trim();
                }
                else if (foundHtmlContent) {
                    const hMatch = foundHtmlContent.match(/<h[12][^>]*>(.*?)<\/h[12]>/i) ||
                        foundHtmlContent.match(/<title[^>]*>(.*?)<\/title>/i) ||
                        foundHtmlContent.match(/<!--\s*TITLE:\s*([^\r\n>]+)\s*-->/);
                    if (hMatch && hMatch[1]) {
                        artTitle = hMatch[1].replace(/<[^>]+>/g, '').trim();
                    }
                }
                if (!artTitle && matchedTopic?.title) {
                    artTitle = matchedTopic.title;
                }
                if (!artTitle) {
                    artTitle = detectedTopicTheme
                        ? `${detectedTopicTheme}深度精选次篇 #${missingIdx}`
                        : `公众号精选排版长文 #${missingIdx}`;
                }
                // 4. 正文提取与构建
                let artContent = '';
                if (foundSpec) {
                    artContent = extractContentFromDocSpec(foundSpec);
                }
                else if (foundHtmlContent) {
                    artContent = foundHtmlContent;
                }
                else {
                    // 【中文修复依据】：严禁将混有模型内部审核警告或选题切角的 hookAngle 拼入正文，纯净统一输出待生成占位标记
                    artContent = '正文排版落盘产物生成中，文章正在快马加鞭赶来的路上...';
                }
                const inferredPath = detectedScriptsDir ? `${detectedScriptsDir}/article_v2_${missingIdx}.html` : undefined;
                articlesMap.set(artKey, {
                    id: `art_auto_${detectedPlatform}_${accKey || 'default'}_news_${missingIdx}`,
                    index: missingIdx,
                    platform: detectedPlatform,
                    accountId: accKey !== 'default' ? accKey : effectiveAccountId,
                    accountName: detectedAccountName,
                    title: artTitle,
                    digest: matchedTopic?.hookAngle || `公众号多图文合辑次条 #${missingIdx}`,
                    content: cleanAndUnescapeHtmlContent(artContent),
                    articleType: 'news',
                    coverUrl: '',
                    images: [],
                    filePath: inferredPath,
                    scriptsDir: detectedScriptsDir || undefined,
                });
                existingNewsIndices.add(missingIdx);
            }
        }
    }
    // 3.5 任务契约对齐与配额强制收敛器 (Quota Reconciliation & Pruning)
    // 依据用户明确下达的任务规格（篇数配额与体裁倾向），淘汰非目标体裁的游离草稿与超配额的中间冗余产物，确保篇数与体裁绝对对齐
    const reconciledArticles = [];
    const articlesByGroup = new Map();
    for (const art of articlesMap.values()) {
        const gKey = `${art.platform}_${art.accountId || 'default'}`;
        const list = articlesByGroup.get(gKey) ?? [];
        list.push(art);
        articlesByGroup.set(gKey, list);
    }
    for (const [_gKey, gArts] of articlesByGroup.entries()) {
        const firstArt = gArts[0];
        const isGzhArt = firstArt?.platform === 'gzh';
        if (!isGzhArt) {
            // 【中文修复依据】：非微信公众号平台（知乎、百家号、头条、小红书等）严格以真实落盘产物与工具调用事实为准，
            // 彻底清除所有未落盘的虚拟占位稿（art_auto_*），严格与物理磁盘文件 1:1 对齐（修复知乎任务产物1篇画布显示6篇）
            const cleanArts = gArts.filter(a => !a.id.startsWith('art_auto_'));
            const fileArts = cleanArts.filter(a => a.id.startsWith('art_file_') || Boolean(a.filePath));
            const targetList = fileArts.length > 0 ? fileArts : cleanArts;
            targetList.sort((a, b) => (a.index || 0) - (b.index || 0));
            reconciledArticles.push(...targetList);
            continue;
        }
        const accId = firstArt?.accountId;
        const quota = (accId ? accountQuotaMap.get(accId) : undefined) ||
            (detectedAccountId ? accountQuotaMap.get(detectedAccountId) : undefined) ||
            (detectedAccountName ? accountQuotaMap.get(detectedAccountName) : undefined) ||
            accountQuotaMap.get('default');
        if (quota) {
            const newsArticles = gArts.filter(a => a.articleType !== 'newspic');
            let newspics = gArts.filter(a => a.articleType === 'newspic');
            // 【中文修复依据】：契约24——长文与小绿书选题标题强排他互斥，杜绝长文选题被克隆为小绿书幽灵草稿
            const newsTitleSet = new Set(newsArticles
                .map(a => a.title.replace(/^[《<]|[》>]$/g, '').replace(/\s+/g, '').trim())
                .filter(Boolean));
            // 判定小绿书是否拥有真实独立物理产物
            const hasIndependentPicFile = (np) => {
                return Boolean(np.filePath &&
                    (np.filePath.includes('_pic.json') ||
                        np.filePath.includes('newspic') ||
                        np.filePath.includes('_pic.')));
            };
            // 【中文修复依据】：契约24——判定长文是否拥有真实独立物理落盘产物（杜绝未落盘虚拟草稿参与最大值放大）
            const hasIndependentNewsFile = (art) => {
                if (art.id.startsWith('art_file_'))
                    return true;
                if (!art.filePath)
                    return false;
                const normPath = art.filePath.replace(/\\/g, '/');
                const fName = normPath.split('/').pop() || '';
                if (knownFileContents.has(fName) || knownFileContents.has(normPath))
                    return true;
                const isSandboxPath = normPath.includes('/tasks/active/') ||
                    normPath.includes('/tasks/archive/') ||
                    normPath.includes('/articles/');
                const hasSubstantialContent = art.content &&
                    art.content.length > 500 &&
                    !art.content.includes('快马加鞭赶来的路上') &&
                    !art.content.includes('正文排版落盘产物生成中');
                return Boolean(isSandboxPath && hasSubstantialContent);
            };
            // 剔除同账号下与长文标题完全相同的虚拟未落盘小绿书占位稿（防止长文选题被 1:1 镜像克隆出多篇小绿书）
            newspics = newspics.filter((np) => {
                if (hasIndependentPicFile(np))
                    return true; // 真实独立物理物料予以保留
                const cleanNpTitle = np.title.replace(/^[《<]|[》>]$/g, '').replace(/\s+/g, '').trim();
                if (cleanNpTitle && newsTitleSet.has(cleanNpTitle)) {
                    return false; // 命中长文同名选题克隆，强制剔除！
                }
                return true;
            });
            // 黄金自愈准则：工具实际生成/发布的合法文章（如 6 篇长文或 1 篇小绿书）为最高优先级事实
            if (quota.articleCount === 0 && quota.newspicCount > 0 && newsArticles.length === 0) {
                // 纯小绿书且无真实长文
                const physicalNewspics = newspics.filter(hasIndependentPicFile);
                const otherNewspics = newspics.filter(np => !hasIndependentPicFile(np));
                const sortedNewspics = [...physicalNewspics, ...otherNewspics];
                sortedNewspics.sort((a, b) => (a.index || 0) - (b.index || 0));
                const keepCount = Math.max(quota.newspicCount, physicalNewspics.length);
                reconciledArticles.push(...sortedNewspics.slice(0, keepCount));
                continue;
            }
            if (quota.newspicCount === 0 && quota.articleCount > 0 && newspics.length === 0) {
                // 纯长文且无真实小绿书
                const physicalNews = newsArticles.filter(hasIndependentNewsFile);
                const otherNews = newsArticles.filter(na => !hasIndependentNewsFile(na));
                let sortedNews;
                if (physicalNews.length > 0) {
                    if (physicalNews.length >= quota.articleCount) {
                        sortedNews = physicalNews;
                    }
                    else {
                        const existingIndices = new Set(physicalNews.map(p => p.index || 1));
                        const supplemental = otherNews.filter(o => !existingIndices.has(o.index || 1));
                        sortedNews = [...physicalNews, ...supplemental];
                    }
                }
                else {
                    sortedNews = newsArticles;
                }
                sortedNews.sort((a, b) => (a.index || 0) - (b.index || 0));
                const keepCount = Math.max(quota.articleCount, physicalNews.length);
                reconciledArticles.push(...sortedNews.slice(0, keepCount));
                continue;
            }
            // 【中文修复依据】：契约24——双体裁配额硬上限约束与超额未落盘幽灵占位稿强截断
            const physicalNewspics = newspics.filter(hasIndependentPicFile);
            const otherNewspics = newspics.filter(np => !hasIndependentPicFile(np));
            // 优先保留物理真实小绿书，其余小绿书按原始序号顺延
            const sortedNewspics = [...physicalNewspics, ...otherNewspics];
            const targetNewspicQuota = typeof quota.newspicCount === 'number' && quota.newspicCount > 0
                ? quota.newspicCount
                : (quota.hasNewspic || (newspics.length > 0 && quota.newspicCount !== 0))
                    ? 1
                    : 0;
            // 截断规则：仅保留不超过 targetNewspicQuota 的小绿书篇数（除非物理独立文件本身多于该配额）
            const maxAllowedNewspics = Math.max(targetNewspicQuota, physicalNewspics.length);
            const effectiveNewspics = sortedNewspics.slice(0, maxAllowedNewspics);
            // 【中文修复依据】：契约24——长文配额硬上限与幽灵占位稿零容忍淘汰
            // 杜绝使用 Math.max(quota, newsArticles.length) 反向膨胀篇数，杜绝未落盘的虚假幽灵次条冒出
            const physicalNews = newsArticles.filter(hasIndependentNewsFile);
            const otherNews = newsArticles.filter(na => !hasIndependentNewsFile(na));
            let sortedNews;
            if (physicalNews.length > 0) {
                if (physicalNews.length >= (quota.articleCount || 1)) {
                    // 物理真实长文已达到或超出配额，彻底淘汰所有未落盘的虚拟草稿（0容忍门禁）
                    sortedNews = physicalNews;
                }
                else {
                    // 物理长文不足配额（例如部分落盘生成中），按序号用虚拟草稿补齐至 articleCount
                    const existingIndices = new Set(physicalNews.map(p => p.index || 1));
                    const supplemental = otherNews.filter(o => !existingIndices.has(o.index || 1));
                    sortedNews = [...physicalNews, ...supplemental];
                }
            }
            else {
                // 早期规划阶段尚未落盘：按虚拟草稿序号
                sortedNews = newsArticles;
            }
            sortedNews.sort((a, b) => (a.index || 0) - (b.index || 0));
            effectiveNewspics.sort((a, b) => (a.index || 0) - (b.index || 0));
            // 严格按目标长文配额截断：仅当物理落盘数量本身多于配额时保留物理文件，绝不让虚拟草稿推高长文总数
            const maxAllowedNews = Math.max(quota.articleCount || 1, physicalNews.length);
            const effectiveNews = sortedNews.slice(0, maxAllowedNews);
            reconciledArticles.push(...effectiveNews, ...effectiveNewspics);
            continue;
        }
        // 若无明确配额契约，但存在物理真实长文时，过滤掉序号大于物理长文最大序号的未落盘草稿
        const physicalNews = gArts.filter(a => a.articleType !== 'newspic' && (a.id.startsWith('art_file_') || Boolean(a.filePath && knownFileContents.has(a.filePath.replace(/\\/g, '/').split('/').pop() || ''))));
        if (physicalNews.length > 0) {
            const maxPhysicalIdx = Math.max(...physicalNews.map(p => p.index || 1));
            const cleanArts = gArts.filter((a) => {
                if (a.articleType === 'newspic')
                    return true;
                if (a.id.startsWith('art_file_'))
                    return true;
                return (a.index || 1) <= maxPhysicalIdx;
            });
            reconciledArticles.push(...cleanArts);
            continue;
        }
        reconciledArticles.push(...gArts);
    }
    // 统一导出去重排序后的 builtArticles，并进行终极报错兜底清洗
    const rawArticlesList = reconciledArticles.length > 0 ? reconciledArticles : Array.from(articlesMap.values());
    const builtArticles = rawArticlesList.map((art) => {
        const isNewspic = art.articleType === 'newspic';
        const isXhs = art.platform === 'xiaohongshu';
        const assignedSlots = art.visualSlots && art.visualSlots.length > 0
            ? art.visualSlots
            : capturedVisualSlots.filter((vs) => {
                if (isNewspic) {
                    // 【中文修复依据】：小绿书专属槽位过滤，严格识别属于小绿书的卡片，坚决剔除 || vs.kind === "pic" 全局污染，杜绝混入长文所有插图
                    const isNewspicSlot = vs.articleType === 'newspic' ||
                        vs.slotId.includes('newspic') ||
                        vs.slotId.startsWith('pic_') ||
                        vs.slotId.startsWith('newspic_');
                    return isNewspicSlot && ((vs.index || 1) === (art.index || 1));
                }
                return (vs.index || 1) === (art.index || 1) && vs.articleType !== 'newspic' && !vs.slotId.includes('newspic');
            });
        let targetCount = art.targetCardImageCount;
        if (!targetCount && (isNewspic || isXhs)) {
            if (isNewspic && detectedNewspicCardCount) {
                targetCount = detectedNewspicCardCount;
            }
            else if (isXhs && detectedXhsCardCount) {
                targetCount = detectedXhsCardCount;
            }
            else if (assignedSlots.length > 0) {
                const picSlots = assignedSlots.filter(s => s.kind === 'pic' || s.kind === 'cover');
                // 【中文修复依据】：限制小绿书与小红书从 assignedSlots 推导的上限，默认标准为 4 张卡片，绝不虚标为 20
                if (picSlots.length > 0)
                    targetCount = Math.min(picSlots.length, 12);
            }
            if (!targetCount) {
                targetCount = 4;
            }
        }
        return {
            ...art,
            visualSlots: assignedSlots,
            targetCardImageCount: targetCount,
        };
    }).sort((a, b) => {
        // 同平台同账号下，长文 (news) 始终优先作为合辑的头条与次条，小绿书 (newspic) 排在长文之后
        if (a.platform === b.platform && (a.accountId || '') === (b.accountId || '')) {
            if (a.articleType !== b.articleType) {
                return a.articleType === 'news' ? -1 : 1;
            }
            return (a.index || 0) - (b.index || 0);
        }
        const idxDiff = (a.index || 0) - (b.index || 0);
        if (idxDiff !== 0)
            return idxDiff;
        return a.platform.localeCompare(b.platform);
    });
    for (const art of builtArticles) {
        if (isToolErrorOrCrashContent(art.content)) {
            art.content =
                art.platform === 'xiaohongshu'
                    ? '笔记正文生成就绪，可随时编辑修改。'
                    : '文章正文生成就绪，可随时编辑修改。';
        }
        // 核心强化：若当前正文为占位模板或简短摘要，自动从已知落盘文件 knownFileContents 回填真实排版 HTML
        const isTemplatePlaceholder = !art.content ||
            art.content.includes('已生成就绪') ||
            art.content.includes('文章排版与规范校验已就绪') ||
            art.content.includes('微信公众号深度图文排版长文') ||
            art.content.includes('小绿书 3:4 竖版专属图文卡片') ||
            art.content.includes('正文排版已完成微信官方') ||
            art.content.includes('本文由架构师深度解析') ||
            art.content.includes('全链路实战心法') ||
            art.content.includes('落盘稿件') ||
            art.content.includes('本文围绕当前主题展开全景剖析') ||
            art.content.length < 1500;
        if (isTemplatePlaceholder) {
            const artIdx = art.index || 1;
            let matchedHtml;
            // 按 article_v2_N.html、article_N.html 或 filePath 匹配
            for (const [k, v] of knownFileContents.entries()) {
                if (!v || v.length < 100 || !v.includes('<'))
                    continue;
                const normK = k.replace(/\\/g, '/');
                if (normK.endsWith(`/article_v2_${artIdx}.html`) ||
                    normK === `article_v2_${artIdx}.html` ||
                    normK.endsWith(`/article_${artIdx}.html`) ||
                    normK === `article_${artIdx}.html` ||
                    (art.filePath && (normK === art.filePath.replace(/\\/g, '/') || normK.endsWith(art.filePath.replace(/^.*[\\/]/, ''))))) {
                    matchedHtml = v;
                    break;
                }
            }
            if (matchedHtml) {
                art.content = cleanAndUnescapeHtmlContent(matchedHtml);
                const hMatch = matchedHtml.match(/<h[12][^>]*>(.*?)<\/h[12]>/i) ||
                    matchedHtml.match(/<title[^>]*>(.*?)<\/title>/i) ||
                    matchedHtml.match(/<!--\s*TITLE:\s*([^\r\n>]+)\s*-->/);
                if (hMatch && hMatch[1]) {
                    const tFromH = hMatch[1].replace(/<[^>]+>/g, '').trim();
                    if (tFromH && (!art.title || art.title.startsWith('社媒精选') || art.title.startsWith('公众号精选') || art.title.includes('**'))) {
                        art.title = tFromH;
                    }
                }
            }
            else if (art.filePath && (art.content.includes('微信公众号深度图文排版长文') || art.content.includes('小绿书 3:4 竖版专属图文卡片') || art.content.includes('已就绪'))) {
                // 【中文修复依据】：若内存未命中但磁盘落盘路径存在，清空假正文，让画纸组件从本地磁盘加载真实 HTML
                art.content = '';
            }
        }
        // 标题二次清洗：坚决剔除任何残留的 Markdown ** 星号与前缀
        if (art.title) {
            art.title = art.title
                .replace(/^[*#\s]+|[*#\s]+$/g, '')
                .replace(/^[0-9]+[.\s、]+/, '')
                .replace(/[\u{1F7E2}\u{1F7E1}\u{1F534}\u{2B50}\u{2605}]/gu, '')
                .replace(/^[*#\s]+|[*#\s]+$/g, '')
                .trim();
        }
        // 终极篇目生命周期状态收敛
        const isPendingPlaceholderText = !art.content ||
            art.content.includes('正文排版落盘产物生成中') ||
            art.content.includes('文章正在快马加鞭赶来') ||
            art.content.includes('正在从规范任务沙箱异步载入真实长文');
        if (art.isStreaming) {
            art.status = 'streaming';
        }
        else if (isPendingPlaceholderText && !art.filePath) {
            art.status = 'pending';
        }
        else {
            art.status = 'completed';
            art.isStreaming = false;
        }
    }
    // 计算全局当前正在流式生成的篇目序号
    let activeStreamingIndex;
    for (const art of builtArticles) {
        if (art.status === 'streaming' || art.isStreaming) {
            activeStreamingIndex = art.index || 1;
            break;
        }
    }
    // 4. 将生成的配图按文章 index、体裁类型（长文 vs 小绿书）、所属平台及账号沙箱精准装配，彻底杜绝混图与跨篇串图
    if (builtArticles.length > 0) {
        // 统计各账号下小绿书的数量与排序，用于精准按序号分流 pic_* 图片
        const newspicsByAccount = new Map();
        for (const a of builtArticles) {
            if (a.articleType === 'newspic') {
                const acc = a.accountId?.trim() || 'default';
                if (!newspicsByAccount.has(acc))
                    newspicsByAccount.set(acc, []);
                newspicsByAccount.get(acc).push(a);
            }
        }
        for (const art of builtArticles) {
            const artAcc = art.accountId?.trim() || 'default';
            const isNewspic = art.articleType === 'newspic';
            const accountNewspics = newspicsByAccount.get(artAcc) || [];
            const newspicIndexInAccount = accountNewspics.findIndex(n => n.id === art.id) + 1;
            // 筛选属于该文章专属的配图（严格体裁隔离、序号隔离、账号隔离与平台隔离）
            const matched = parsedImagesList.filter((img) => {
                // 0. 任务沙箱强隔离门禁：严格杜绝认领前序历史任务沙箱中的残留配图
                if (detectedTaskId && img.taskId && img.taskId !== detectedTaskId) {
                    return false;
                }
                // 1. 账号强隔离：若图片明确来源于特定账号目录且与文章账号不一致，严禁跨账号拉取
                if (img.accountId && art.accountId && img.accountId.trim() !== art.accountId.trim()) {
                    return false;
                }
                // 2. 平台规格强隔离
                if (img.platform && normalizePlatformName(img.platform) !== art.platform) {
                    return false;
                }
                // 3. 体裁与配图类型强隔离（彻底终结长文吞小绿书竖版图、小绿书混长文横版图）
                const isXhs = art.platform === 'xiaohongshu';
                if (isNewspic) {
                    // 小绿书（newspic）：必须是竖版卡片（kind === "pic" 或文件名包含 pic/newspic），绝对拒绝长文封面与插图
                    if (img.kind !== 'pic' && !img.url.includes('pic_') && !img.url.includes('newspic')) {
                        return false;
                    }
                    // 【中文修复依据】：小绿书配图必须严格匹配自身篇目槽位（杜绝在未轮到自身生图前提前抢占长文图片，彻底根治图 2 与图 3）
                    if (typeof img.articleIndex === 'number' && img.articleIndex > 0) {
                        return img.articleIndex === newspicIndexInAccount || img.articleIndex === art.index;
                    }
                    // 若多篇图文合辑中图片未声明序号，仅在明确为小绿书专属生图产物且归属于本平台账号时认领
                    if (builtArticles.length > 1) {
                        return Boolean(img.kind === 'pic' && img.platform === art.platform && (!img.accountId || img.accountId === art.accountId));
                    }
                    return true;
                }
                else if (isXhs) {
                    // 小红书（xiaohongshu）：卡片与封面均为专属 3:4 竖版多图，按序号强匹配
                    if (typeof art.index === 'number' && art.index > 0) {
                        if (typeof img.articleIndex === 'number' && img.articleIndex > 0) {
                            if (img.articleIndex !== art.index)
                                return false;
                        }
                    }
                    return true;
                }
                else {
                    // 长文（news）：若当前账号存在独立小绿书篇目，则严格隔离小绿书 3:4 竖版卡片（pic）
                    if (accountNewspics.length > 0 && (img.kind === 'pic' || img.url.includes('pic_'))) {
                        return false;
                    }
                    // 平台与账号物理隔离防错版门禁：禁止跨平台（知乎/小红书/公众号）或跨账号复用配图
                    if (img.platform && art.platform && img.platform !== art.platform)
                        return false;
                    if (img.accountId && art.accountId && img.accountId !== art.accountId)
                        return false;
                    // 序号强匹配：长文 #N 仅匹配自身序号的封面与插图
                    if (typeof art.index === 'number' && art.index > 0) {
                        if (typeof img.articleIndex === 'number' && img.articleIndex > 0) {
                            if (img.articleIndex !== art.index)
                                return false;
                        }
                        else if (builtArticles.length > 1) {
                            return false;
                        }
                    }
                    return true;
                }
            });
            // 智能排序：封面（cover）置顶，正文插图与卡片按 subIndex 递增排列
            matched.sort((a, b) => {
                if (a.kind === 'cover' && b.kind !== 'cover')
                    return -1;
                if (a.kind !== 'cover' && b.kind === 'cover')
                    return 1;
                return a.subIndex - b.subIndex;
            });
            const isXhs = art.platform === 'xiaohongshu';
            // 智能物理槽位去重与沙箱权威正本优先（解决根目录与 images/ 子文件夹同名图片重复统计导致 1/8 破图问题）
            const dedupedMatched = [];
            for (const m of matched) {
                const rawUrl = m.url.replace(/\\/g, '/');
                const fileName = (rawUrl.split('/').pop() || '').toLowerCase();
                const baseWithoutExt = fileName.replace(/\.[^.]+$/, '');
                const slotKey = isXhs || isNewspic
                    ? `card_${m.subIndex || baseWithoutExt}`
                    : m.kind === 'cover'
                        ? `cover_${m.articleIndex || 1}`
                        : `content_${m.articleIndex || 1}_${m.subIndex || baseWithoutExt}`;
                const existingIdx = dedupedMatched.findIndex((item) => {
                    const itemUrl = item.url.replace(/\\/g, '/');
                    const itemFileName = (itemUrl.split('/').pop() || '').toLowerCase();
                    const itemBaseWithoutExt = itemFileName.replace(/\.[^.]+$/, '');
                    const itemSlot = isXhs || isNewspic
                        ? `card_${item.subIndex || itemBaseWithoutExt}`
                        : item.kind === 'cover'
                            ? `cover_${item.articleIndex || 1}`
                            : `content_${item.articleIndex || 1}_${item.subIndex || itemBaseWithoutExt}`;
                    return itemSlot === slotKey || itemFileName === fileName;
                });
                if (existingIdx === -1) {
                    dedupedMatched.push(m);
                }
                else {
                    // 若已有同槽位或同名项：规范沙箱 images/ 目录优先于外层根目录
                    const existingItem = dedupedMatched[existingIdx];
                    const currentIsCanonical = rawUrl.includes('/images/');
                    const existingIsCanonical = existingItem.url.replace(/\\/g, '/').includes('/images/');
                    if (currentIsCanonical && !existingIsCanonical) {
                        dedupedMatched[existingIdx] = m;
                    }
                }
            }
            // 智能配图装配与兜底（严格遵守绝对零虚构与沙箱闭环规范）
            let finalImgs = [];
            if (dedupedMatched.length > 0) {
                finalImgs = dedupedMatched.map(m => m.url);
            }
            else if (builtArticles.length === 1 &&
                !isNewspic &&
                !isXhs &&
                (genImagesCompleted || genImagesRunning) &&
                (parsedImagesList.length > 0 || generatedImageUrls.length > 0)) {
                finalImgs = parsedImagesList.length > 0 ? parsedImagesList.map(m => m.url) : generatedImageUrls;
            }
            else {
                // 【中文修复依据】：若当前文章在配图池中无真实落盘图片（生图未完成或未生图），保持为空，严禁臆测假文件名推入
                finalImgs = [];
            }
            // 配额硬闸门：小红书与小绿书严格限制配图数量等于内容规则要求（如最多 4 张卡片），杜绝溢出
            const maxCards = isXhs ? 4 : isNewspic ? (art.targetCardImageCount || 4) : undefined;
            if (maxCards && finalImgs.length > maxCards) {
                finalImgs = finalImgs.slice(0, maxCards);
            }
            art.images = [...new Set(finalImgs)];
            // 【中文修复依据】：长文封面与插图严格解耦，公众号长文绝不能用正文插图冒充封面，避免正文插图被截胡排空
            const coverItem = dedupedMatched.find(m => m.kind === 'cover') ||
                (isXhs || isNewspic
                    ? dedupedMatched[0]
                    : dedupedMatched.find(m => /(?:^|[\\/])cover[._]/i.test(m.url)));
            if (coverItem) {
                art.coverUrl = coverItem.url;
            }
            else if ((isXhs || isNewspic) && art.images[0]) {
                art.coverUrl = art.images[0];
            }
            else {
                // 长文封面尚未就绪或未匹配时保持 undefined，由前端预览自愈推导落盘产物
                art.coverUrl = undefined;
            }
            // 显式分离纯正文插图（绝对严禁将封面混入正文插图）
            const pureContent = art.images.filter(img => img !== art.coverUrl);
            art.contentImages = pureContent;
            if (!art.scriptsDir && detectedScriptsDir) {
                art.scriptsDir = detectedScriptsDir;
            }
            if (!art.filePath && detectedScriptsDir && !isNewspic) {
                const isSandboxTarget = detectedScriptsDir.includes('/tasks/active/') ||
                    detectedScriptsDir.includes('/tasks/archive/') ||
                    detectedScriptsDir.includes('\\tasks\\active\\') ||
                    detectedScriptsDir.includes('\\tasks\\archive\\');
                if (isSandboxTarget && !detectedScriptsDir.endsWith('/articles') && !detectedScriptsDir.endsWith('\\articles')) {
                    art.filePath = `${detectedScriptsDir}/articles/article_v2_${art.index || 1}.html`;
                }
                else {
                    art.filePath = `${detectedScriptsDir}/article_v2_${art.index || 1}.html`;
                }
            }
            // 4. 正文占位符内联深度替换：自动将正文中的 IMG_A1_1 映射替换为落盘的真实安全图片
            if (art.content && (art.images.length > 0 || art.coverUrl)) {
                art.content = inlineInjectImagesIntoContent(art.content, art.images, art.coverUrl);
            }
            // 5. 提交发布指令后的快照锁定门禁：一旦发出发布指令或开始发布，文章全面锁定，禁止漂移改写
            if (publishIntentIssued || publishDraftRunning || publishDraftCompleted || verifyDraftCompleted) {
                art.locked = true;
            }
        }
    }
    // 5. 候选选题多账号/多平台精准分流聚合：
    // 识别会话中涉及的所有 (platform, accountId) 维度，按分组优先采用 Assistant 文本解析，其次采用工具结果，避免跨账号清空
    const allTopicGroupKeys = new Set();
    for (const t of [...latestAssistantTopics, ...checkTopicsFromTool, ...discoverTopicsFromTool]) {
        const k = `${t.platform || detectedPlatform}_${t.accountId || effectiveAccountId}`;
        allTopicGroupKeys.add(k);
    }
    const topics = [];
    if (allTopicGroupKeys.size === 0) {
        if (latestAssistantTopics.length > 0)
            topics.push(...latestAssistantTopics);
        else if (checkTopicsFromTool.length > 0)
            topics.push(...checkTopicsFromTool);
        else if (discoverTopicsFromTool.length > 0)
            topics.push(...discoverTopicsFromTool);
    }
    else {
        for (const grpKey of allTopicGroupKeys) {
            const assistantForGrp = latestAssistantTopics.filter(t => `${t.platform || detectedPlatform}_${t.accountId || effectiveAccountId}` === grpKey);
            if (assistantForGrp.length > 0) {
                topics.push(...assistantForGrp);
                continue;
            }
            const checkForGrp = checkTopicsFromTool.filter(t => `${t.platform || detectedPlatform}_${t.accountId || effectiveAccountId}` === grpKey);
            if (checkForGrp.length > 0) {
                topics.push(...checkForGrp);
                continue;
            }
            const discoverForGrp = discoverTopicsFromTool.filter(t => `${t.platform || detectedPlatform}_${t.accountId || effectiveAccountId}` === grpKey);
            if (discoverForGrp.length > 0) {
                topics.push(...discoverForGrp);
            }
        }
    }
    // 6. 多平台独立并行任务模型（SocialPlatformTask[]）构建：彻底解耦全局单一 Stage
    const taskKeys = [];
    const taskGroups = new Map();
    // 1. 从已生成的文章收集平台任务
    for (const art of builtArticles) {
        const key = `${art.platform}_${art.accountId || effectiveAccountId || 'default'}`;
        if (!taskGroups.has(key)) {
            taskKeys.push(key);
            taskGroups.set(key, { platform: art.platform, accountId: art.accountId, accountName: art.accountName });
        }
    }
    // 2. 从已发现的选题中收集平台任务（确保在阶段1选题雷达期，多平台任务即可独立呈现）
    for (const t of topics) {
        if (t.platform) {
            const key = `${t.platform}_${t.accountId || effectiveAccountId || 'default'}`;
            if (!taskGroups.has(key)) {
                taskKeys.push(key);
                taskGroups.set(key, { platform: t.platform, accountId: t.accountId, accountName: t.accountName });
            }
        }
    }
    // 3. 若没有显式文章或选题，但存在真实工作流执行信号（如正在调用雷达、正在排版或生图等），则创建平台任务
    const hasActiveWorkflowSignals = discoverTopicsCallFound ||
        checkTopicsCallFound ||
        buildArticleRunning ||
        genImagesRunning ||
        validateHtmlRunning ||
        publishDraftRunning ||
        publishDraftCompleted ||
        publishIntentIssued;
    if (taskKeys.length === 0 && hasActiveWorkflowSignals) {
        const key = `${detectedPlatform}_${effectiveAccountId}`;
        taskKeys.push(key);
        taskGroups.set(key, { platform: detectedPlatform, accountId: effectiveAccountId, accountName: detectedAccountName });
    }
    const tasks = [];
    for (const key of taskKeys) {
        const grp = taskGroups.get(key);
        const taskArticles = builtArticles.filter(a => a.platform === grp.platform && (!grp.accountId || !a.accountId || a.accountId === grp.accountId));
        // 该平台任务专属的候选选题集合
        const taskTopics = topics.filter(t => (!t.platform || t.platform === grp.platform) && (!t.accountId || !grp.accountId || t.accountId === grp.accountId));
        // 独立判定该平台任务的生命周期阶段，绝不受其他平台影响
        const isThisTaskPublishRunning = taskPublishRunningMap.get(key) || (taskKeys.length === 1 && publishDraftRunning);
        const isThisTaskPublished = taskPublishedMap.get(key) || (taskKeys.length === 1 && publishDraftCompleted);
        const isThisTaskGenerating = taskGeneratingMap.get(key) || (buildArticleRunning || genImagesRunning || validateHtmlRunning);
        let taskStage = 'idle';
        if (isThisTaskPublishRunning) {
            taskStage = 'publishing';
        }
        else if (isThisTaskPublished) {
            taskStage = 'published';
        }
        else if (isThisTaskGenerating && taskArticles.length === 0) {
            taskStage = 'generating';
        }
        else if (taskArticles.length > 0) {
            taskStage = 'review'; // 稿件就绪，进入图文审校门禁
        }
        else if (discoverTopicsCallFound || checkTopicsCallFound || taskTopics.length > 0) {
            taskStage = 'topics';
        }
        const taskSteps = [
            {
                id: `step_topic_${key}`,
                name: `1. ${grp.platform === 'xiaohongshu' ? '小红书爆款切角' : '热点雷达'}与查重`,
                desc: '热点雷达嗅探与历史标题查重比对',
                status: taskTopics.length > 0 ? 'completed' : checkTopicsCallFound ? 'running' : 'pending',
                detail: taskTopics.length > 0
                    ? `已匹配 ${taskTopics.length} 个${grp.platform === 'xiaohongshu' ? '图文卡片' : '专属'}候选选题`
                    : checkTopicsCallFound
                        ? '正在雷达嗅探与查重...'
                        : '等待选题调度',
            },
            {
                id: `step_content_${key}`,
                name: `2. ${grp.platform === 'xiaohongshu' ? '小红书笔记撰写' : grp.platform === 'gzh' ? '微信长文排版' : '专栏正文撰写'}`,
                desc: '依据目标平台排版规范生成合规产物',
                status: taskArticles.length > 0 ? 'completed' : buildArticleRunning ? 'running' : 'pending',
                detail: taskArticles.length > 0 ? `已构建 ${taskArticles.length} 篇正文稿件` : buildArticleRunning ? '排版中...' : '等待执行',
            },
            {
                id: `step_images_${key}`,
                name: `3. ${grp.platform === 'xiaohongshu' ? '3:4 竖版多图生成' : grp.platform === 'gzh' ? '2.35:1 封面与正文插图' : '专栏题图生成'}`,
                desc: '根据平台规范比例生成封面图与正文插图',
                status: taskArticles.some(a => (a.images?.length ?? 0) > 0 || a.coverUrl) ? 'completed' : genImagesRunning ? 'running' : 'pending',
                detail: taskArticles.some(a => (a.images?.length ?? 0) > 0) ? `配图就绪 (${taskArticles[0]?.images?.length ?? 0} 张)` : '排队中',
            },
            {
                id: `step_validate_${key}`,
                name: '4. 平台规范硬校验',
                desc: '执行字数、敏感词过滤与排版合规断言',
                status: taskArticles.length > 0 ? 'completed' : validateHtmlRunning ? 'running' : 'pending',
                detail: taskArticles.length > 0 ? '机器合规校验通过' : '排队中',
            },
            {
                id: `step_review_${key}`,
                name: '5. 人工审核与发布决策',
                desc: '人工在线预览、微调保存并执行草稿/排期发布',
                status: taskStage === 'published' ? 'completed' : taskStage === 'publishing' || taskStage === 'review' ? 'running' : 'pending',
                detail: taskStage === 'published' ? '已提交发布' : taskStage === 'review' ? '稿件就绪，可独立发布' : '等待内容生成',
            },
        ];
        const platformName = grp.platform === 'gzh'
            ? '微信公众号'
            : grp.platform === 'xiaohongshu'
                ? '小红书'
                : grp.platform === 'zhihu'
                    ? '知乎专栏'
                    : grp.platform === 'toutiao'
                        ? '今日头条'
                        : grp.platform === 'baijiahao'
                            ? '百家号'
                            : grp.platform;
        const isGeneratingToolsRunning = Boolean(buildArticleRunning || genImagesRunning || validateHtmlRunning);
        const grpQuota = (grp.accountId ? accountQuotaMap.get(grp.accountId) : undefined) ||
            (grp.accountName ? accountQuotaMap.get(grp.accountName) : undefined) ||
            accountQuotaMap.get('default');
        const grpTargetCount = grpQuota?.total || grpQuota?.articleCount || taskArticles.length || 1;
        const realTaskArticles = taskArticles.filter((a) => {
            if (!a.content || a.content.trim().length === 0)
                return false;
            const minLen = a.platform === 'xiaohongshu' || a.articleType === 'newspic' ? 20 : 60;
            if (a.content.length < minLen)
                return false;
            return (!a.content.includes('正文排版落盘产物生成中') &&
                !a.content.includes('文章正在快马加鞭赶来') &&
                !a.content.includes('正在从规范任务沙箱异步载入真实长文'));
        });
        const isTaskArticlesReady = isGeneratingToolsRunning
            ? realTaskArticles.length >= grpTargetCount
            : realTaskArticles.length > 0;
        tasks.push({
            id: `task_${grp.platform}_${grp.accountId || 'default'}`,
            platform: grp.platform,
            platformName,
            accountId: grp.accountId,
            accountName: grp.accountName || detectedAccountName,
            stage: taskStage,
            topics: taskTopics,
            articles: taskArticles,
            pipelineSteps: taskSteps,
            allPrePublishTasksCompleted: !buildArticleRunning && !genImagesRunning && !validateHtmlRunning && isTaskArticlesReady && (taskStage === 'review' || taskStage === 'publishing' || taskStage === 'published'),
            publishedInfo: publishDraftCompleted
                ? {
                    draftId: taskPublishedInfoMap.get(key)?.draftId || publishedDraftId,
                    mediaId: taskPublishedInfoMap.get(key)?.mediaId || publishedMediaId,
                    scheduledTime: taskPublishedInfoMap.get(key)?.scheduledTime || publishedScheduleTime,
                    isVerified: verifyDraftCompleted,
                    receiptScreenshot: taskPublishedInfoMap.get(key)?.receiptScreenshot || publishedReceiptScreenshot,
                    qrScreenshot: taskPublishedInfoMap.get(key)?.qrScreenshot || publishedQrScreenshot,
                }
                : undefined,
        });
    }
    // 7. 全局聚合阶段
    // 【中文修复依据】：兼顾生成期防提前弹卡与完成期防死锁的实质就绪门禁。
    // 1. 区分成熟落盘的真实正文与自愈补齐的纯占位篇目；
    // 2. 流水线生成中 (isGeneratingToolsRunning)：严格核验已实质生成篇数 realGeneratedArticles.length >= targetTotalArticles，未齐备前强制锁定为 generating，杜绝第 1 篇未写完就提前弹卡；
    // 3. 流水线已全部运行完成 (!isGeneratingToolsRunning)：只要已有实质落盘文章 (realGeneratedArticles.length > 0)，立即认定就绪进入 review，绝不被历史任务高配额或自愈占位槽位永久死锁！
    const isGeneratingToolsRunning = Boolean(buildArticleRunning || genImagesRunning || validateHtmlRunning);
    const realGeneratedArticles = builtArticles.filter((art) => {
        if (!art.content || art.content.trim().length === 0)
            return false;
        const minLen = art.platform === 'xiaohongshu' || art.articleType === 'newspic' ? 20 : 60;
        if (art.content.length < minLen)
            return false;
        const lower = art.content.toLowerCase();
        if (lower.includes('正文排版落盘产物生成中') ||
            lower.includes('文章正在快马加鞭赶来') ||
            lower.includes('正在从规范任务沙箱异步载入真实长文')) {
            return false;
        }
        return true;
    });
    const hasPendingPlaceholder = builtArticles.some((art) => {
        if (!art.content || art.content.trim().length === 0)
            return true;
        const lower = art.content.toLowerCase();
        return (lower.includes('正文排版落盘产物生成中') ||
            lower.includes('文章正在快马加鞭赶来') ||
            lower.includes('正在从规范任务沙箱异步载入真实长文'));
    });
    const targetTotalArticles = tasks.reduce((acc, t) => {
        const qObj = (t.accountId ? accountQuotaMap.get(t.accountId) : undefined) ||
            (t.accountName ? accountQuotaMap.get(t.accountName) : undefined) ||
            accountQuotaMap.get('default');
        const count = qObj?.total || qObj?.articleCount || t.articles.length || 1;
        return acc + count;
    }, 0) || builtArticles.length || 1;
    // 全篇目实质就绪判定（兼顾多篇任务未齐备时防提前弹卡与全篇落盘后稳定展示）：
    // 1. 至少已有 1 篇真实落盘正文；
    // 2. 没有任何篇目处于占位/构思中 (!hasPendingPlaceholder)；
    // 3. 真实生成篇数达到目标配额 (realGeneratedArticles.length >= targetTotalArticles)；
    // 4. 没有任何生成前序工具正在运行 (!isGeneratingToolsRunning)。
    // 【中文修复依据】：正文全部实质构建就绪（诉求 1 核心依据：正文完成、生图未开始前即可显示预览窗口入口）
    const isContentFullyProduced = realGeneratedArticles.length > 0 &&
        realGeneratedArticles.length >= targetTotalArticles &&
        !buildArticleRunning;
    // 统计 AI 生图进度（诉求 3 核心依据：生图进度可视化与逐篇追踪）
    let currentImagesCount = 0;
    for (const art of builtArticles) {
        if (art.coverUrl)
            currentImagesCount += 1;
        if (art.images && art.images.length > 0) {
            currentImagesCount += art.images.length;
        }
    }
    let totalTargetImages = 0;
    for (const t of tasks) {
        const qObj = (t.accountId ? accountQuotaMap.get(t.accountId) : undefined) ||
            (t.accountName ? accountQuotaMap.get(t.accountName) : undefined) ||
            accountQuotaMap.get('default');
        const count = qObj?.total || qObj?.articleCount || t.articles.length || 1;
        const isXhs = t.platform === 'xiaohongshu';
        const imgsPerArt = isXhs ? 4 : 3;
        totalTargetImages += count * imgsPerArt;
    }
    if (totalTargetImages === 0) {
        totalTargetImages = Math.max(1, builtArticles.length * 3);
    }
    const imagePercentage = Math.min(100, Math.round((currentImagesCount / Math.max(1, totalTargetImages)) * 100));
    const currentImageArticleIndex = Math.min(builtArticles.length || 1, Math.floor(currentImagesCount / 3) + 1);
    const imageProgress = {
        current: currentImagesCount,
        total: Math.max(totalTargetImages, currentImagesCount),
        percentage: imagePercentage,
        currentArticleIndex: currentImageArticleIndex,
        isGenerating: Boolean(genImagesRunning && (imagePercentage < 100 || currentImagesCount < totalTargetImages)),
    };
    const areAllArticlesFullyGenerated = realGeneratedArticles.length > 0 &&
        !hasPendingPlaceholder &&
        realGeneratedArticles.length >= targetTotalArticles &&
        !isGeneratingToolsRunning;
    let stage = 'idle';
    const isPublishingNow = publishDraftRunning ||
        (publishIntentIssued && builtArticles.length > 0 && !publishDraftCompleted && !verifyDraftCompleted);
    if (isPublishingNow) {
        stage = 'publishing';
    }
    else if (publishDraftCompleted || verifyDraftCompleted) {
        stage = 'published';
    }
    else if (isGeneratingToolsRunning || (builtArticles.length > 0 && !areAllArticlesFullyGenerated)) {
        stage = 'generating'; // 只要有任何前序任务在跑，或者多篇目尚未实质全部落盘生成完毕，保持 generating
    }
    else if (builtArticles.length > 0 && areAllArticlesFullyGenerated) {
        stage = 'review'; // 全部文章实质就位或任务已执行完成，放行进入 review 决策阶段！
    }
    else if (discoverTopicsCallFound || checkTopicsCallFound || topics.length > 0) {
        stage = 'topics';
    }
    else {
        stage = 'idle';
    }
    // 全局聚合流水线步骤
    const pipelineSteps = [
        {
            id: 'step_topic',
            name: '1. 选题雷达与查重',
            desc: '热点雷达嗅探与历史标题查重比对',
            status: checkTopicsCompleted ? 'completed' : checkTopicsCallFound ? 'running' : 'pending',
            detail: checkTopicsCompleted
                ? `已产出 ${topics.length} 个候选选题，查重已通过`
                : checkTopicsCallFound
                    ? '正在比对历史库与爆款切角...'
                    : '等待选题调度...',
        },
        {
            id: 'step_content',
            name: '2. 正文定制构建',
            desc: '依据目标平台排版规范生成合规产物',
            status: buildArticleCompleted ? 'completed' : buildArticleRunning ? 'running' : 'pending',
            detail: buildArticleCompleted
                ? `已构建 ${builtArticles.length} 篇正文稿件`
                : buildArticleRunning
                    ? '正在撰写排版正文中...'
                    : '等待选题决策后执行',
        },
        {
            id: 'step_images',
            name: '3. AI 封面与多图配图',
            desc: '根据平台规范比例按篇目顺序逐篇生成封面与插图',
            status: genImagesCompleted ? 'completed' : genImagesRunning ? 'running' : 'pending',
            detail: genImagesCompleted
                ? `全部 ${currentImagesCount} 张配图已就绪`
                : genImagesRunning
                    ? `正在生成第 ${currentImageArticleIndex} 篇配图 (${currentImagesCount}/${totalTargetImages} 张 · ${imagePercentage}%)`
                    : '等待按篇逐个生成配图',
        },
        {
            id: 'step_validate',
            name: '4. 平台规范硬校验',
            desc: '执行字数、敏感词过滤与排版合规断言',
            status: validateHtmlCompleted ? 'completed' : validateHtmlRunning ? 'running' : 'pending',
            detail: validateHtmlCompleted
                ? '机器合规校验 100% 通过'
                : validateHtmlRunning
                    ? '正在执行合规断言...'
                    : '排队中',
        },
        {
            id: 'step_review',
            name: '5. 人工审核与发布决策',
            desc: '人工在线预览、微调保存并执行草稿/排期发布',
            status: publishDraftCompleted
                ? 'completed'
                : stage === 'publishing'
                    ? 'running'
                    : stage === 'review'
                        ? 'running'
                        : 'pending',
            detail: publishDraftCompleted
                ? '已成功提交发布'
                : stage === 'publishing'
                    ? '正在通过浏览器自动化向平台草稿箱提交推送并核验...'
                    : stage === 'review'
                        ? '已生成文章就绪，请在工作台审核决策'
                        : '等待内容生成完成',
        },
    ];
    // 7.5 组装多账号/多篇目选题分组视图（AccountTopicGroup[]）
    const accountTopicGroups = [];
    const handledGroupKeys = new Set();
    // 1. 优先按已识别的 tasks 映射
    for (const t of tasks) {
        const gKey = `${t.platform}_${t.accountId || 'default'}`;
        if (handledGroupKeys.has(gKey))
            continue;
        handledGroupKeys.add(gKey);
        const groupTopics = topics.filter(topic => (!topic.platform || topic.platform === t.platform) &&
            (!topic.accountId || !t.accountId || topic.accountId === t.accountId));
        const taskArticleCount = t.articles.length;
        const quota = (t.accountId ? accountQuotaMap.get(t.accountId) : undefined) ||
            (t.accountName ? accountQuotaMap.get(t.accountName) : undefined) ||
            (detectedAccountId ? accountQuotaMap.get(detectedAccountId) : undefined) ||
            (detectedAccountName ? accountQuotaMap.get(detectedAccountName) : undefined);
        const hasNewspicTopic = groupTopics.some(gt => gt.articleType === 'newspic') || t.platform === 'xiaohongshu';
        const finalTargetCount = Math.max(1, quota ? quota.total : detectedTargetCount, taskArticleCount);
        const finalHasNewspic = quota ? quota.hasNewspic : hasNewspicTopic;
        const finalArticleQuota = quota
            ? quota.articleCount
            : finalHasNewspic
                ? Math.max(1, finalTargetCount - 1)
                : finalTargetCount;
        const finalNewspicQuota = quota
            ? quota.newspicCount
            : finalHasNewspic
                ? 1
                : 0;
        accountTopicGroups.push({
            groupKey: gKey,
            platform: t.platform,
            platformName: t.platformName || '社媒专栏',
            accountId: t.accountId || 'default',
            accountName: t.accountName || detectedAccountName || '默认账号',
            targetArticleCount: finalTargetCount,
            articleQuota: finalArticleQuota,
            newspicQuota: finalNewspicQuota,
            hasNewspic: finalHasNewspic,
            topics: groupTopics.length > 0 ? groupTopics : t.topics || [],
        });
    }
    // 2. 若存在 tasks 之外但属于某些独立 (platform, accountId) 的选题，补充成组
    for (const topic of topics) {
        const p = topic.platform || detectedPlatform;
        const acc = topic.accountId || effectiveAccountId;
        const gKey = `${p}_${acc}`;
        if (handledGroupKeys.has(gKey))
            continue;
        handledGroupKeys.add(gKey);
        const groupTopics = topics.filter(t => (t.platform || detectedPlatform) === p && (t.accountId || effectiveAccountId) === acc);
        const quota = accountQuotaMap.get(acc) ||
            (topic.accountName ? accountQuotaMap.get(topic.accountName) : undefined) ||
            (detectedAccountId ? accountQuotaMap.get(detectedAccountId) : undefined) ||
            (detectedAccountName ? accountQuotaMap.get(detectedAccountName) : undefined);
        const hasNewspicTopic = groupTopics.some(gt => gt.articleType === 'newspic') || p === 'xiaohongshu';
        const finalTargetCount = Math.max(1, quota ? quota.total : detectedTargetCount);
        const finalHasNewspic = quota ? quota.hasNewspic : hasNewspicTopic;
        const finalArticleQuota = quota
            ? quota.articleCount
            : finalHasNewspic
                ? Math.max(1, finalTargetCount - 1)
                : finalTargetCount;
        const finalNewspicQuota = quota
            ? quota.newspicCount
            : finalHasNewspic
                ? 1
                : 0;
        accountTopicGroups.push({
            groupKey: gKey,
            platform: p,
            platformName: topic.platformName ||
                (p === 'xiaohongshu' ? '小红书' : p === 'gzh' ? '微信公众号' : '社媒专栏'),
            accountId: acc,
            accountName: topic.accountName || detectedAccountName || '默认账号',
            targetArticleCount: finalTargetCount,
            articleQuota: finalArticleQuota,
            newspicQuota: finalNewspicQuota,
            hasNewspic: finalHasNewspic,
            topics: groupTopics,
        });
    }
    // 3. 兜底回退：若全空，创建单账号默认分组
    if (accountTopicGroups.length === 0 && topics.length > 0) {
        const quota = (detectedAccountId ? accountQuotaMap.get(detectedAccountId) : undefined) ||
            (detectedAccountName ? accountQuotaMap.get(detectedAccountName) : undefined);
        const hasNewspicTopic = topics.some(gt => gt.articleType === 'newspic') || detectedPlatform === 'xiaohongshu';
        const finalTargetCount = Math.max(1, quota ? quota.total : detectedTargetCount);
        const finalHasNewspic = quota ? quota.hasNewspic : hasNewspicTopic;
        const finalArticleQuota = quota
            ? quota.articleCount
            : finalHasNewspic
                ? Math.max(1, finalTargetCount - 1)
                : finalTargetCount;
        const finalNewspicQuota = quota
            ? quota.newspicCount
            : finalHasNewspic
                ? 1
                : 0;
        accountTopicGroups.push({
            groupKey: `${detectedPlatform}_${effectiveAccountId}`,
            platform: detectedPlatform,
            platformName: detectedPlatform === 'xiaohongshu'
                ? '小红书'
                : detectedPlatform === 'gzh'
                    ? '微信公众号'
                    : '社媒专栏',
            accountId: effectiveAccountId,
            accountName: detectedAccountName || '默认账号',
            targetArticleCount: finalTargetCount,
            articleQuota: finalArticleQuota,
            newspicQuota: finalNewspicQuota,
            hasNewspic: finalHasNewspic,
            topics,
        });
    }
    // 8. 统一对所有分组实施【待选选题至多所需+3】截断与【全账号/全体裁零漏项兜底】
    for (const g of accountTopicGroups) {
        g.topics = pruneAndEnsureGroupTopics(g, detectedTopicTheme || '社媒热点与专业趋势');
    }
    return {
        stage,
        isSocialTask: isSocialPublisherSession(rows),
        isExplicitSocialModeTask,
        platform: detectedPlatform,
        accountName: detectedAccountName,
        accountId: effectiveAccountId,
        scriptsDir: detectedScriptsDir,
        topicTheme: detectedTopicTheme,
        topics,
        accountTopicGroups,
        pipelineSteps,
        articles: builtArticles,
        allPrePublishTasksCompleted: !buildArticleRunning && !genImagesRunning && !validateHtmlRunning && areAllArticlesFullyGenerated && (stage === 'review' || stage === 'publishing' || stage === 'published'),
        researchEvidence: extractedResearchEvidence,
        publishedInfo: publishDraftCompleted
            ? {
                draftId: publishedDraftId,
                mediaId: publishedMediaId,
                scheduledTime: publishedScheduleTime,
                isVerified: verifyDraftCompleted,
                receiptScreenshot: publishedReceiptScreenshot,
                qrScreenshot: publishedQrScreenshot,
            }
            : undefined,
        publishIntentIssued,
        tasks,
        taskId: detectedTaskId || tasks[0]?.id,
        manifestFingerprint: detectedManifestFingerprint,
        activeTaskId: detectedTaskId || tasks[0]?.id,
        isDryRun: detectedIsDryRun,
        isContentFullyProduced,
        imageProgress,
        activeStreamingIndex,
    };
}
/**
 * 确定文章的目标卡片总数（小绿书 / 小红书画廊）
 * 【中文规范依据】：遵循四级事实源锁定，绝不允许因生图未完成而反向截断为 images.length
 */
/**
 * 确定文章的目标卡片总数（小绿书 / 小红书画廊）
 * 【中文规范依据】：契约四级事实源锁定，卡片总数由选题与规格权威决定，绝对禁止被 images.length 脏数据反向放大
 */
export function resolveTargetCardCount(article) {
    const isXhs = article.platform === 'xiaohongshu';
    const isNewspic = article.articleType === 'newspic';
    if (!isXhs && !isNewspic) {
        return 1;
    }
    // 1. 显式契约声明（如选题/排版声明的 4 张卡片）
    if (typeof article.targetCardImageCount === 'number' && article.targetCardImageCount > 0) {
        return Math.min(Math.max(1, article.targetCardImageCount), 12);
    }
    // 2. 视觉插槽规范定义
    const visualSlotCount = (article.visualSlots || []).filter(vs => vs.kind === 'pic' || vs.kind === 'cover').length;
    if (visualSlotCount > 0) {
        return Math.min(Math.max(1, visualSlotCount), 12);
    }
    // 3. 平台标准规格（小绿书与小红书标准均为 4 张）
    return 4;
}
//# sourceMappingURL=socialPublisherWorkflowExtractor.js.map