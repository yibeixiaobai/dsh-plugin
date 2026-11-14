/**
 * 微信公众号专业排版画布 - 结构化组件容器树类型定义
 * 遵循现代独立出版物与瑞士平面排版美学（去卡片化、无 Emoji、无 AI 八股八面框）
 * 严格对齐微信公众平台排版规范（单行零换行、行内样式、13px/15px 正文字号与 span leaf 封装）
 */
export type WechatBlockType = "h2" | "drop_cap" | "double_column" | "swiss_metrics" | "marginalia" | "editor_note" | "sequence_steps" | "colophon" | "carousel" | "seamless_gallery" | "svg_marquee" | "svg_expand" | "p" | "image_card" | "gallery_grid" | "festival_banner" | "qa_bubble" | "checklist_box" | "intro_card" | "versus_card" | "stat_board" | "timeline_steps" | "glossary_def" | "qa_dialogue" | "summary_callout" | "case_study" | "grand_quote" | "warning_card" | "checklist_card" | "qa_card" | "engagement_trio" | "custom_html";
export interface WechatSectionNode {
    id: string;
    type: WechatBlockType;
    label: string;
    rawHtml?: string;
    props: Record<string, any>;
}
export type ComponentMainCategory = "all" | "recommend" | "heading" | "card" | "image" | "layout" | "svg" | "component" | "hot" | "festival";
export interface ComponentTemplateItem {
    id: string;
    type: WechatBlockType;
    mainCategory?: ComponentMainCategory;
    subCategory?: string;
    category: "headline" | "editorial" | "discourse" | "metrics" | "sequence" | "gallery" | "colophon";
    title: string;
    desc: string;
    badge?: string;
    iconName: string;
    createNode: (themeKey?: string) => WechatSectionNode;
}
export interface WechatThemePreset {
    id: string;
    name: string;
    main: string;
    light: string;
    ul: string;
    gold: string;
}
export declare const WECHAT_THEMES: Record<string, WechatThemePreset>;
/**
 * 秀米经典大类对应的二级精细子分类映射表（对齐参考图 2-4）
 */
export declare const SUB_CATEGORIES_BY_MAIN: Record<string, string[]>;
//# sourceMappingURL=wechatCanvasTypes.d.ts.map