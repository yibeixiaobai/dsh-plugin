/**
 * 微信公众号专业排版画布 - 结构化组件容器树类型定义
 * 遵循现代独立出版物与瑞士平面排版美学（去卡片化、无 Emoji、无 AI 八股八面框）
 * 严格对齐微信公众平台排版规范（单行零换行、行内样式、13px/15px 正文字号与 span leaf 封装）
 */

export type WechatBlockType =
  | "h2"                // 报刊专栏头标式章节大标题 (Kicker & Headline)
  | "drop_cap"          // 经典开篇首字下沉段落 (Editorial Drop Cap)
  | "double_column"      // 古典对开双栏思辨对比 (Two-Column Discourse)
  | "swiss_metrics"      // 瑞士平面纯数字基线指标看板 (Swiss Baseline Metrics)
  | "marginalia"         // 专刊侧边单规标尺旁注 (Marginalia Pull Note)
  | "editor_note"        // 编者现场手记微引言 (Editor's Notebook)
  | "sequence_steps"     // 工匠专著阶段演进纪要 (Monograph Sequence Steps)
  | "colophon"           // 书籍扉页式出版致意尾页 (Colophon & Sign-off)
  | "carousel"           // 纯手势横向平滑滚动图组 (Gesture Carousel)
  | "seamless_gallery"   // 全景无缝长图精准拼接 (Seamless Gallery)
  | "svg_marquee"        // SVG 原生平滑无限循环跑马灯 (SVG Marquee)
  | "svg_expand"         // SVG 点击展开交互
  | "p"                  // 经典正文段落 (Editorial Paragraph)
  | "image_card"         // 单图卡片
  | "gallery_grid"        // 黄金比例双图/拍立得相框网格
  | "festival_banner"    // 节日专属主题徽章与横幅
  | "qa_bubble"          // 问答对话气泡组
  | "checklist_box"      // 备忘勾选清单卡
  // 保持向前兼容的历史别名类型
  | "intro_card"
  | "versus_card"
  | "stat_board"
  | "timeline_steps"
  | "glossary_def"
  | "qa_dialogue"
  | "summary_callout"
  | "case_study"
  | "grand_quote"
  | "warning_card"
  | "checklist_card"
  | "qa_card"
  | "engagement_trio"
  | "custom_html";

export interface WechatSectionNode {
  id: string;
  type: WechatBlockType;
  label: string; // 界面中立纯文字徽章，如 "首字下沉开篇"
  rawHtml?: string;
  props: Record<string, any>;
}

export type ComponentMainCategory =
  | "all"
  | "recommend"
  | "heading"
  | "card"
  | "image"
  | "layout"
  | "svg"
  | "component"
  | "hot"
  | "festival";

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

export const WECHAT_THEMES: Record<string, WechatThemePreset> = {
  wenying: {
    id: "wenying",
    name: "典雅深红",
    main: "#991B1B",
    light: "#FDF2F2",
    ul: "#E7C878",
    gold: "#B8860B",
  },
  olive: {
    id: "olive",
    name: "橄榄手记",
    main: "#1e1f23",
    light: "#F5F5F3",
    ul: "#ed7b2f",
    gold: "#ed7b2f",
  },
  graphite: {
    id: "graphite",
    name: "石墨极简",
    main: "#3F3F46",
    light: "#FAFAFA",
    ul: "#52525B",
    gold: "#D97706",
  },
  moyu: {
    id: "moyu",
    name: "冷杉墨绿",
    main: "#065F46",
    light: "#F0FDF4",
    ul: "#A7F3D0",
    gold: "#059669",
  },
  techblue: {
    id: "techblue",
    name: "科技幽蓝",
    main: "#2563EB",
    light: "#EFF6FF",
    ul: "#93C5FD",
    gold: "#3B82F6",
  },
  dopamine: {
    id: "dopamine",
    name: "多巴胺黄",
    main: "#84CC16",
    light: "#F7FEE7",
    ul: "#BEF264",
    gold: "#F59E0B",
  },
  zen: {
    id: "zen",
    name: "留白禅意",
    main: "#374151",
    light: "#F9FAFB",
    ul: "#B5C8BC",
    gold: "#4A5D52",
  },
};

/**
 * 秀米经典大类对应的二级精细子分类映射表（对齐参考图 2-4）
 */
export const SUB_CATEGORIES_BY_MAIN: Record<string, string[]> = {
  recommend: [
    "全部推荐",
    "同类推荐",
    "常用推荐",
    "最近使用",
  ],
  heading: [
    "全部标题",
    "基础标题",
    "极简标题",
    "框线标题",
    "图片标题",
    "底色标题",
    "符号标题",
    "主副标题",
    "编号标题",
    "竖排标题",
    "渐变标题",
    "动态标题",
    "文字纹理",
    "文字阴影",
  ],
  card: [
    "全部卡片",
    "基础卡片",
    "极简卡片",
    "纯文字卡片",
    "框线卡片",
    "底色卡片",
    "底纹卡片",
    "图文卡片",
    "对话/问答",
    "轴线卡片",
  ],
  image: [
    "全部图片",
    "基础图片",
    "纯图片",
    "单图",
    "双图",
    "三图",
    "四图",
    "多图",
    "圆形图",
    "背景图",
    "滑动图片",
  ],
  layout: [
    "全部布局",
    "基础布局",
    "表格",
    "左右图文",
    "上下图文",
    "上下滑动",
    "左右滑动",
    "自由布局",
    "组合",
  ],
  hot: [
    "全部热门",
    "节日专属",
    "WinCast专区",
    "党建政务",
    "生活饮食",
    "动感多巴胺",
    "安全防诈",
  ],
  component: [
    "全部组件",
    "关注引流",
    "分割装饰",
    "签名落款",
    "点赞在看",
  ],
  svg: [
    "全部SVG",
    "滑动交互",
    "点击展开",
    "跑马灯",
  ],
};
