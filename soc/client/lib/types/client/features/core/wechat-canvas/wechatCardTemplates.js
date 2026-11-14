function randId(p) {
    return `${p}_${Math.random().toString(36).slice(2, 8)}`;
}
export const WECHAT_CARD_TEMPLATES = [
    // 1. 盾牌安全提示卡 (图 1 防诈骗/小贴士灵感)
    {
        id: "tpl_shield_security_card",
        type: "editor_note",
        mainCategory: "card",
        subCategory: "安全提示",
        category: "editorial",
        title: "盾牌安全提示卡",
        desc: "立体金属质感微盾牌，亮蓝与淡蓝柔和底框，适合重点规则声明与安全贴士",
        badge: "提示",
        iconName: "BookmarkCheck",
        createNode: () => ({
            id: randId("sec_card_shield"),
            type: "editor_note",
            label: "安全提示卡",
            rawHtml: `<section style="margin:18px 0;background:linear-gradient(135deg,#EFF6FF 0%,#DBEAFE 100%);border:1px solid #93C5FD;border-radius:12px;padding:16px 18px;box-shadow:0 3px 12px rgba(59,130,246,0.1);"><div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;"><div style="width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,#2563EB,#1D4ED8);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(37,99,235,0.3);flex-shrink:0;"><span style="font-size:16px;line-height:1;">🛡️</span></div><div><p style="margin:0;font-size:15px;font-weight:900;color:#1E3A8A;letter-spacing:0.5px;"><span leaf="">WinCast 视觉安全与合规备忘</span></p><p style="margin:0;font-size:11px;font-weight:700;color:#3B82F6;letter-spacing:1px;text-transform:uppercase;"><span leaf="">SECURITY &amp; COMPLIANCE NOTICE</span></p></div></div><p style="margin:0;font-size:13.5px;line-height:23px;color:#1E40AF;"><span leaf="">在发布全网分发图文前，请务必核实涉及版权授权的素材出处与合规商用凭证，遵循 WinCast 内容规范与平台指引。</span></p></section>`,
            props: {},
        }),
    },
    // 2. 经典大双引号金句卡
    {
        id: "tpl_grand_quote_card",
        type: "editor_note",
        mainCategory: "card",
        subCategory: "引用金句",
        category: "editorial",
        title: "大双引号金句卡",
        desc: "优雅超大雅致衬线引号，极轻微灰度卡片，适合突出核心金句与作者观点",
        badge: "金句",
        iconName: "Quote",
        createNode: () => ({
            id: randId("sec_card_quote"),
            type: "editor_note",
            label: "大双引号金句卡",
            rawHtml: `<section style="margin:18px 0;background:#F9FAFB;border-radius:10px;padding:20px 22px;border-left:4px solid #111827;position:relative;"><div style="font-size:42px;line-height:24px;color:#9CA3AF;font-family:Georgia,serif;font-weight:bold;margin-bottom:6px;"><span leaf="">“</span></div><p style="margin:0 0 10px;font-size:15px;font-weight:700;line-height:25px;color:#111827;letter-spacing:0.3px;"><span leaf="">真正的美学从不依赖繁复修饰，而是在克制的骨架中展现文字本身的张力与尊严。</span></p><div style="text-align:right;"><span style="font-size:12px;font-weight:600;color:#6B7280;letter-spacing:1px;"><span leaf="">—— WinCast 视觉美学工作室</span></span></div></section>`,
            props: {},
        }),
    },
    // 3. Q&A 问答对话气泡
    {
        id: "tpl_qa_dialogue_bubbles",
        type: "qa_bubble",
        mainCategory: "card",
        subCategory: "问答对话",
        category: "editorial",
        title: "Q&A 问答对话气泡",
        desc: "问答对话双气泡结构，Q 蓝灰优雅提问，A 暖色醒目详析，生动易读",
        badge: "问答",
        iconName: "MessageSquareText",
        createNode: () => ({
            id: randId("sec_card_qa"),
            type: "qa_bubble",
            label: "问答对话气泡",
            rawHtml: `<section style="margin:18px 0;display:flex;flex-direction:column;gap:12px;"><div style="background:#F1F5F9;border-radius:12px 12px 12px 2px;padding:12px 16px;border-left:3.5px solid #64748B;"><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;"><span style="font-size:12px;font-weight:900;color:#475569;background:#E2E8F0;padding:1px 6px;border-radius:4px;"><span leaf="">Q</span></span><span style="font-size:14px;font-weight:800;color:#1E293B;"><span leaf="">微信排版中如何避免复制到后台样式变形？</span></span></div></div><div style="background:#FFFBEB;border-radius:12px 12px 2px 12px;padding:12px 16px;border-left:3.5px solid #F59E0B;"><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;"><span style="font-size:12px;font-weight:900;color:#D97706;background:#FEF3C7;padding:1px 6px;border-radius:4px;"><span leaf="">A</span></span><span style="font-size:14px;font-weight:800;color:#92400E;"><span leaf="">采用 WinCast 行内样式与纯文本 Leaf 保护层</span></span></div><p style="margin:0;font-size:13px;line-height:22px;color:#78350F;"><span leaf="">WinCast 所有组件坚持零换行行内封装，粘贴至微信公众平台直接还原，不会被微信官方净化器滤除样式。</span></p></div></section>`,
            props: {},
        }),
    },
    // 4. 备忘勾选清单卡
    {
        id: "tpl_todo_checkbox_card",
        type: "checklist_box",
        mainCategory: "card",
        subCategory: "清单备忘",
        category: "editorial",
        title: "备忘勾选清单卡",
        desc: "优雅打勾复选框列表，带微圆角浅底与虚线分界，适合干货要点与操作检查项",
        badge: "清单",
        iconName: "CheckSquare",
        createNode: () => ({
            id: randId("sec_card_checklist"),
            type: "checklist_box",
            label: "备忘勾选清单",
            rawHtml: `<section style="margin:18px 0;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:16px 20px;"><div style="font-size:14px;font-weight:900;color:#0F172A;margin-bottom:12px;display:flex;align-items:center;gap:6px;"><span style="color:#0284C7;font-size:16px;">☑️</span><span leaf="">WinCast 重点检查清单</span></div><div style="display:flex;flex-direction:column;gap:8px;"><div style="display:flex;align-items:flex-start;gap:8px;font-size:13px;line-height:21px;color:#334155;"><span style="color:#10B981;font-weight:bold;">✓</span><span leaf="">检查标题层级是否统一，无多余大号黑体堆砌</span></div><div style="display:flex;align-items:flex-start;gap:8px;font-size:13px;line-height:21px;color:#334155;"><span style="color:#10B981;font-weight:bold;">✓</span><span leaf="">插图与封面图已全部分辨率适配且具备清晰版权</span></div><div style="display:flex;align-items:flex-start;gap:8px;font-size:13px;line-height:21px;color:#334155;"><span style="color:#10B981;font-weight:bold;">✓</span><span leaf="">尾页致谢与互动引导已就绪，保持阅读节奏连贯</span></div></div></section>`,
            props: {},
        }),
    },
];
//# sourceMappingURL=wechatCardTemplates.js.map