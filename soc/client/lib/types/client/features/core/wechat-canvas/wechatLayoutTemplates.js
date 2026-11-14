function randId(p) {
    return `${p}_${Math.random().toString(36).slice(2, 8)}`;
}
export const WECHAT_LAYOUT_TEMPLATES = [
    // 1. 步骤流程彩带卡 (图 5 秀米步骤/阶段演进)
    {
        id: "tpl_sequence_ribbon_steps",
        type: "sequence_steps",
        mainCategory: "layout",
        subCategory: "基础布局",
        category: "sequence",
        title: "步骤流程彩带卡",
        desc: "STEP.01 彩色高光微圆标，标题加粗，点状微基线自然衔接",
        badge: "步骤",
        iconName: "GitCommit",
        createNode: () => ({
            id: randId("sec_layout_step"),
            type: "sequence_steps",
            label: "步骤流程卡",
            rawHtml: `<section style="margin:16px 0;padding:0;"><div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;"><span style="font-size:11px;font-weight:900;background:linear-gradient(90deg,#3B82F6,#6366F1);color:#FFFFFF;padding:2px 8px;border-radius:12px;font-family:sans-serif;letter-spacing:0.5px;"><span leaf="">STEP 01</span></span><span style="font-size:15px;font-weight:900;color:#111827;letter-spacing:0.3px;"><span leaf="">确立单一事实来源与领域模型</span></span></div><div style="margin-left:36px;border-left:2px dashed #E5E7EB;padding-left:14px;padding-bottom:10px;"><p style="margin:0;font-size:13px;line-height:22px;color:#4B5563;"><span leaf="">通过集中收敛状态所有权，规避跨模块多路写入，确保排版画纸渲染生命周期一致。</span></p></div></section>`,
            props: {},
        }),
    },
    // 2. 左右双栏对称对比 (图 5 秀米左右图文/对比)
    {
        id: "tpl_symmetric_discourse",
        type: "double_column",
        mainCategory: "layout",
        subCategory: "左右图文",
        category: "discourse",
        title: "左右双栏对称对比",
        desc: "中置 1px 发丝垂直线，左右对称思辨，告别幼稚红绿小卡片",
        badge: "对比",
        iconName: "SplitSquareVertical",
        createNode: () => ({
            id: randId("sec_layout_discourse"),
            type: "double_column",
            label: "左右双栏对比",
            rawHtml: `<section style="margin:18px 0;display:flex;align-items:stretch;gap:16px;padding:4px 0;"><section style="flex:1;"><p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#6B7280;letter-spacing:0.5px;"><span leaf="">01 / 传统惯性路径</span></p><p style="margin:0;font-size:13px;line-height:22px;color:#4B5563;"><span leaf="">盲目堆砌第三方不可控样式，频繁遭遇样式被微信净化器重置的困扰。</span></p></section><div style="width:1px;background:#E5E7EB;margin:2px 0;"></div><section style="flex:1;"><p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#2563EB;letter-spacing:0.5px;"><span leaf="">02 / WinCast 架构重构</span></p><p style="margin:0;font-size:13px;line-height:22px;color:#111827;font-weight:500;"><span leaf="">全量原子行内样式结合单行 leaf 保护，实现像素级跨平台完美还原。</span></p></section></section>`,
            props: {},
        }),
    },
    // 3. 核心数据战报看板 (图 5 秀米数据指标)
    {
        id: "tpl_metrics_dashboard",
        type: "swiss_metrics",
        mainCategory: "layout",
        subCategory: "基础布局",
        category: "metrics",
        title: "核心数据战报看板",
        desc: "44px 纯黑/深石墨纯数字张力，微米级基线，工业理性美学",
        badge: "指标",
        iconName: "BarChart3",
        createNode: () => ({
            id: randId("sec_layout_metrics"),
            type: "swiss_metrics",
            label: "数据战报看板",
            rawHtml: `<section style="margin:20px 0;display:flex;align-items:baseline;justify-content:space-between;padding:12px 6px;border-top:1px solid #111827;border-bottom:1px solid #E5E7EB;"><div style="text-align:left;"><span style="font-size:44px;font-weight:900;line-height:1;color:#111827;font-family:-apple-system,sans-serif;letter-spacing:-1px;"><span leaf="">99.8%</span></span><p style="margin:6px 0 0;font-size:11px;font-weight:700;color:#6B7280;letter-spacing:1px;text-transform:uppercase;"><span leaf="">微信排版零变形率</span></p></div><div style="text-align:right;"><span style="font-size:44px;font-weight:900;line-height:1;color:#2563EB;font-family:-apple-system,sans-serif;letter-spacing:-1px;"><span leaf="">&lt; 50ms</span></span><p style="margin:6px 0 0;font-size:11px;font-weight:700;color:#6B7280;letter-spacing:1px;text-transform:uppercase;"><span leaf="">画布瞬时响应</span></p></div></section>`,
            props: {},
        }),
    },
    // 4. 剪影飞鸟双细线落款 (图 5 秀米落款/尾页致谢)
    {
        id: "tpl_colophon_signoff",
        type: "colophon",
        mainCategory: "layout",
        subCategory: "基础布局",
        category: "colophon",
        title: "剪影飞鸟双细线落款",
        desc: "版权页古典极简装帧风格，双横细线，告别大拇指三连按钮",
        badge: "落款",
        iconName: "Send",
        createNode: () => ({
            id: randId("sec_layout_colophon"),
            type: "colophon",
            label: "飞鸟双线落款",
            rawHtml: `<section style="margin:28px 0 16px;text-align:center;"><div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:10px;"><div style="width:40px;height:1px;background:#D1D5DB;"></div><span style="font-size:14px;color:#9CA3AF;">🕊️</span><div style="width:40px;height:1px;background:#D1D5DB;"></div></div><p style="margin:0 0 4px;font-size:12px;color:#6B7280;letter-spacing:1px;"><span leaf="">本文由 WinCast 视觉工坊排版生成</span></p><p style="margin:0;font-size:10px;color:#9CA3AF;letter-spacing:1.5px;text-transform:uppercase;"><span leaf="">WINCAST EDITORIAL LAB · ALL RIGHTS RESERVED</span></p></section>`,
            props: {},
        }),
    },
];
//# sourceMappingURL=wechatLayoutTemplates.js.map