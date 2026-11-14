/**
 * 微信公众号专业排版 - 常用推荐、最近使用与同类型智能推荐管理器
 * 约束：最多展示 10 个推荐组件；有选中容器时优先推荐同类型组件以供无损替换
 */
import type { ComponentTemplateItem, WechatSectionNode } from "./wechatCanvasTypes.js";
/**
 * 读取用户最近使用过的模板 ID 列表
 */
export declare function getRecentTemplateIds(): string[];
/**
 * 记录用户刚刚使用过的模板 ID
 */
export declare function recordRecentTemplateId(templateId: string): void;
/**
 * 获取智能推荐模板列表（最多 10 个）
 * @param selectedNode 当前画布中选中的容器节点（若有）
 */
export declare function getRecommendedTemplates(selectedNode: WechatSectionNode | null): ComponentTemplateItem[];
//# sourceMappingURL=wechatRecommendationManager.d.ts.map