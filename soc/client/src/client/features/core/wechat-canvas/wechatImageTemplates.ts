/**
 * 微信公众号专业排版画布 - 精选图片与图组画廊组件库
 * 包含：横向滑动图组、无缝长图拼接、双图对称网格、拍立得相纸图、SVG 无限循环跑马灯
 * 全部采用单行、微信行内样式与标准 leaf 封装，统一官方 WinCast 品牌
 */
import type { ComponentTemplateItem } from "./wechatCanvasTypes.js";

function randId(p: string): string {
  return `${p}_${Math.random().toString(36).slice(2, 8)}`;
}

export const WECHAT_IMAGE_TEMPLATES: ComponentTemplateItem[] = [
  // 1. 横向滑动图组 (图 4 秀米多图/滑动图片)
  {
    id: "tpl_carousel_scroll",
    type: "carousel",
    mainCategory: "image",
    subCategory: "滑动图片",
    category: "gallery",
    title: "手势左右滑动图组",
    desc: "原生横向滑动交互画廊，无边框阴影，纯粹的图像流与极简图注",
    badge: "滑动",
    iconName: "SlidersHorizontal",
    createNode: () => ({
      id: randId("sec_img_carousel"),
      type: "carousel",
      label: "左右滑动图组",
      rawHtml: `<section style="margin:18px 0;width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;"><div style="display:inline-flex;gap:12px;padding:2px 0;"><div style="width:230px;flex-shrink:0;background:#F3F4F6;border-radius:8px;overflow:hidden;"><div style="height:140px;background:#E5E7EB;display:flex;align-items:center;justify-content:center;color:#9CA3AF;font-size:13px;"><span leaf="">画廊相片 01</span></div><p style="margin:6px 8px 8px;font-size:12px;color:#4B5563;"><span leaf="">WinCast 视觉工程演进展位</span></p></div><div style="width:230px;flex-shrink:0;background:#F3F4F6;border-radius:8px;overflow:hidden;"><div style="height:140px;background:#D1D5DB;display:flex;align-items:center;justify-content:center;color:#6B7280;font-size:13px;"><span leaf="">画廊相片 02</span></div><p style="margin:6px 8px 8px;font-size:12px;color:#4B5563;"><span leaf="">极客排版与审美探索纪要</span></p></div><div style="width:230px;flex-shrink:0;background:#F3F4F6;border-radius:8px;overflow:hidden;"><div style="height:140px;background:#9CA3AF;display:flex;align-items:center;justify-content:center;color:#374151;font-size:13px;"><span leaf="">画廊相片 03</span></div><p style="margin:6px 8px 8px;font-size:12px;color:#4B5563;"><span leaf="">纯净长文排版体验</span></p></div></div></section>`,
      props: {},
    }),
  },

  // 2. 全景无缝长图精准拼接
  {
    id: "tpl_seamless_gallery",
    type: "seamless_gallery",
    mainCategory: "image",
    subCategory: "纯图片",
    category: "gallery",
    title: "全景无缝长图拼接",
    desc: "多张图像上下 0 缝隙精准贴合，消除移动端像素空隙",
    badge: "长图",
    iconName: "Columns",
    createNode: () => ({
      id: randId("sec_img_seamless"),
      type: "seamless_gallery",
      label: "无缝长图拼接",
      rawHtml: `<section style="margin:18px 0;padding:0;line-height:0;font-size:0;"><div style="width:100%;height:120px;background:#3B82F6;display:flex;align-items:center;justify-content:center;color:#FFFFFF;font-size:14px;letter-spacing:1px;"><span leaf="">WinCast 长图拼接 · 上篇</span></div><div style="width:100%;height:120px;background:#2563EB;display:flex;align-items:center;justify-content:center;color:#FFFFFF;font-size:14px;letter-spacing:1px;"><span leaf="">WinCast 长图拼接 · 中篇</span></div><div style="width:100%;height:120px;background:#1D4ED8;display:flex;align-items:center;justify-content:center;color:#FFFFFF;font-size:14px;letter-spacing:1px;"><span leaf="">WinCast 长图拼接 · 下篇</span></div></section>`,
      props: {},
    }),
  },

  // 3. 1:1 双图对称网格
  {
    id: "tpl_twin_images_grid",
    type: "gallery_grid",
    mainCategory: "image",
    subCategory: "双图",
    category: "gallery",
    title: "1:1 双图对称并列",
    desc: "左右等比例黄金分栏，带圆角与微边框，适合对比图与作品双展",
    badge: "双图",
    iconName: "SplitSquareVertical",
    createNode: () => ({
      id: randId("sec_img_twin"),
      type: "gallery_grid",
      label: "双图对称并列",
      rawHtml: `<section style="margin:18px 0;display:flex;gap:12px;"><div style="flex:1;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:8px;text-align:center;"><div style="height:110px;background:#E2E8F0;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#64748B;font-size:12px;"><span leaf="">左视图素材</span></div><p style="margin:8px 0 0;font-size:12px;font-weight:700;color:#334155;"><span leaf="">方案 A 视觉布局</span></p></div><div style="flex:1;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:8px;text-align:center;"><div style="height:110px;background:#CBD5E1;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#475569;font-size:12px;"><span leaf="">右视图素材</span></div><p style="margin:8px 0 0;font-size:12px;font-weight:700;color:#334155;"><span leaf="">方案 B 视觉布局</span></p></div></section>`,
      props: {},
    }),
  },

  // 4. 复古拍立得相纸图
  {
    id: "tpl_polaroid_frame",
    type: "gallery_grid",
    mainCategory: "image",
    subCategory: "单图",
    category: "gallery",
    title: "拍立得相纸图",
    desc: "经典下沉留白相纸相框，柔和悬浮微阴影，营造温暖生活感",
    badge: "拍立得",
    iconName: "FileCheck2",
    createNode: () => ({
      id: randId("sec_img_polaroid"),
      type: "gallery_grid",
      label: "拍立得相框",
      rawHtml: `<section style="margin:20px auto;max-width:320px;background:#FFFFFF;border:1px solid #E5E7EB;border-radius:4px;padding:12px 12px 20px;box-shadow:0 4px 16px rgba(0,0,0,0.06);text-align:center;"><div style="height:180px;background:linear-gradient(135deg,#F3F4F6,#E5E7EB);border-radius:2px;display:flex;align-items:center;justify-content:center;color:#6B7280;font-size:13px;font-family:sans-serif;"><span leaf="">📷 影像捕捉时刻</span></div><p style="margin:12px 0 0;font-size:13px;font-weight:600;color:#4B5563;font-family:Georgia,serif;letter-spacing:1px;"><span leaf="">WinCast Moment · 纪念定格</span></p></section>`,
      props: {},
    }),
  },

  // 5. SVG 跑马灯动效
  {
    id: "tpl_svg_marquee",
    type: "gallery_grid",
    mainCategory: "image",
    subCategory: "滑动图片",
    category: "gallery",
    title: "循环跑马灯动效",
    desc: "微信原生 SVG 无限水平移动展示横幅，科技感与灵动感十足",
    badge: "动效",
    iconName: "Zap",
    createNode: () => ({
      id: randId("sec_img_marquee"),
      type: "gallery_grid",
      label: "循环跑马灯",
      rawHtml: `<section style="margin:18px 0;overflow:hidden;background:#0F172A;border-radius:8px;padding:12px 0;"><svg viewBox="0 0 800 40" style="width:100%;height:32px;display:block;"><g><animateTransform attributeName="transform" type="translate" from="0 0" to="-400 0" dur="10s" repeatCount="indefinite"/><text x="20" y="26" fill="#38BDF8" font-size="14" font-weight="bold" font-family="-apple-system,sans-serif" letter-spacing="1">⚡ WINCAST CREATIVE STUDIO ｜ 微信公众号专业排版画纸 ｜ WinCast 旗舰美学组件</text><text x="420" y="26" fill="#38BDF8" font-size="14" font-weight="bold" font-family="-apple-system,sans-serif" letter-spacing="1">⚡ WINCAST CREATIVE STUDIO ｜ 微信公众号专业排版画纸 ｜ WinCast 旗舰美学组件</text></g></svg></section>`,
      props: {},
    }),
  },
];
