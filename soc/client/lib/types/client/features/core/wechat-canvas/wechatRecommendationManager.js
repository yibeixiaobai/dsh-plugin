/**
 * 微信公众号专业排版 - 常用推荐、最近使用与同类型智能推荐管理器
 * 约束：最多展示 10 个推荐组件；有选中容器时优先推荐同类型组件以供无损替换
 */
import { WECHAT_COMPONENT_TEMPLATES } from "./wechatComponentLibrary.js";
const RECENT_STORAGE_KEY = "wincode_wechat_recent_template_ids";
const MAX_RECOMMENDED_COUNT = 10;
/**
 * 官方精选爆款高频组件 ID 集合（常用推荐底池）
 */
const POPULAR_TEMPLATE_IDS = [
    "heading-corn-simple", // 玉米生活下划线
    "heading-wincast-ai-badge", // WinCast AI高光胶囊
    "heading-red-flag-skew", // 红色长征斜切条
    "heading-frost-twin-circles", // 霜降上下双圆青印
    "heading-sports-neon-burst", // 荧光多巴胺运动便签
    "heading-fraud-tip-classic", // 经典深蓝防诈拼音标
    "heading-chongyang-sun-badge", // 重阳橙阳书法圆印
    "card-corn-food-gallery", // 玉米轻食美图大卡
    "card-sports-fixture", // 运动赛事日程打卡
    "card-fraud-case-study", // 防诈套路拆解卡
];
/**
 * 读取用户最近使用过的模板 ID 列表
 */
export function getRecentTemplateIds() {
    if (typeof window === "undefined" || !window.localStorage)
        return [];
    try {
        const raw = window.localStorage.getItem(RECENT_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    }
    catch {
        return [];
    }
}
/**
 * 记录用户刚刚使用过的模板 ID
 */
export function recordRecentTemplateId(templateId) {
    if (typeof window === "undefined" || !window.localStorage || !templateId)
        return;
    try {
        const curr = getRecentTemplateIds().filter((id) => id !== templateId);
        curr.unshift(templateId);
        window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(curr.slice(0, 20)));
    }
    catch {
        // 静默容错
    }
}
/**
 * 获取智能推荐模板列表（最多 10 个）
 * @param selectedNode 当前画布中选中的容器节点（若有）
 */
export function getRecommendedTemplates(selectedNode) {
    const allTemplates = WECHAT_COMPONENT_TEMPLATES;
    // 1. 当用户选中容器后，智能过滤出相同类型 (Same Type / MainCategory) 的组件供替换
    if (selectedNode) {
        const nodeType = selectedNode.type;
        // 针对标题类
        if (nodeType === "h2") {
            const headings = allTemplates.filter((t) => t.type === "h2" || t.mainCategory === "heading");
            return headings.slice(0, MAX_RECOMMENDED_COUNT);
        }
        // 针对图文卡片类
        if (nodeType === "image_card" || nodeType === "gallery_grid" || nodeType === "checklist_box") {
            const cards = allTemplates.filter((t) => t.type === nodeType || t.mainCategory === "card" || t.mainCategory === "image");
            if (cards.length > 0) {
                return cards.slice(0, MAX_RECOMMENDED_COUNT);
            }
        }
        // 针对其它类型容器
        const sameTypes = allTemplates.filter((t) => t.type === nodeType);
        if (sameTypes.length > 0) {
            return sameTypes.slice(0, MAX_RECOMMENDED_COUNT);
        }
    }
    // 2. 当未选中容器时，组合展示“最近使用组件”与“常用爆款组件”，最多 10 个
    const recentIds = getRecentTemplateIds();
    const templateMap = new Map(allTemplates.map((t) => [t.id, t]));
    const result = [];
    const addedIds = new Set();
    // 优先填入最近使用过的组件
    for (const id of recentIds) {
        const tpl = templateMap.get(id);
        if (tpl && !addedIds.has(tpl.id)) {
            result.push(tpl);
            addedIds.add(tpl.id);
            if (result.length >= MAX_RECOMMENDED_COUNT)
                break;
        }
    }
    // 补充填入常用爆款组件
    if (result.length < MAX_RECOMMENDED_COUNT) {
        for (const id of POPULAR_TEMPLATE_IDS) {
            const tpl = templateMap.get(id);
            if (tpl && !addedIds.has(tpl.id)) {
                result.push(tpl);
                addedIds.add(tpl.id);
                if (result.length >= MAX_RECOMMENDED_COUNT)
                    break;
            }
        }
    }
    // 若仍不足，拿推荐组件池兜底凑齐 10 个
    if (result.length < MAX_RECOMMENDED_COUNT) {
        for (const tpl of allTemplates) {
            if (!addedIds.has(tpl.id)) {
                result.push(tpl);
                addedIds.add(tpl.id);
                if (result.length >= MAX_RECOMMENDED_COUNT)
                    break;
            }
        }
    }
    return result.slice(0, MAX_RECOMMENDED_COUNT);
}
//# sourceMappingURL=wechatRecommendationManager.js.map