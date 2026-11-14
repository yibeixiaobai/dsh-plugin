/**
 * 微信公众号专业排版 - 现代秀米风格高颜值爆款图文卡片组件库
 * 包含：玉米美食图文大卡、蘑菇下午茶卡片、运动赛程卡、防诈案例拆解卡、节气物候图文卡
 * 严格遵从单行零换行、行内样式与 <span leaf=""> 微信渲染规范
 */
export const WECHAT_MODERN_CARD_TEMPLATES = [
    // ---------------- 图 6/7 同款：玉米轻食图文一体卡片 ----------------
    {
        id: "card-corn-food-gallery",
        type: "image_card",
        mainCategory: "card",
        subCategory: "图文卡片",
        category: "gallery",
        title: "图文大卡 · 玉米轻食美图衬底",
        desc: "玉米气泡标题与圆角实拍美食大图浅绿柔光衬底",
        badge: "图文卡片",
        iconName: "SlidersHorizontal",
        createNode: () => ({
            id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            type: "image_card",
            label: "玉米轻食美图衬底",
            rawHtml: `<section style="margin:24px 0;padding:16px;border-radius:16px;background:#f4fbf0;border:1px solid #dcf2d4;box-shadow:0 4px 14px rgba(93,168,70,0.08);"><section style="display:flex;align-items:center;margin-bottom:12px;"><section style="display:inline-flex;align-items:center;background:#e9f4e2;border-radius:20px;padding:4px 14px 4px 8px;"><span style="font-size:18px;margin-right:6px;">🌽</span><span leaf="" style="font-size:14px;font-weight:700;color:#2e4425;">一日三餐 · 均衡饮食</span><span style="margin-left:4px;font-size:12px;color:#e88f28;font-weight:bold;">!</span></section></section><section style="width:100%;border-radius:12px;overflow:hidden;background:#e2eedb;line-height:0;"><img src="https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=900&auto=format&fit=crop&q=80" style="width:100%;height:auto;display:block;border-radius:12px;object-fit:cover;" /></section><section style="margin-top:10px;text-align:center;"><p leaf="" style="margin:0;font-size:12px;color:#5a7350;letter-spacing:0.5px;">新鲜时蔬与均衡蛋白，唤醒每日轻盈元气</p></section></section>`,
            props: { kicker: "轻食料理", caption: "新鲜时蔬与均衡蛋白" },
        }),
    },
    // ---------------- 图 6/7 同款：麦香下午茶图文一体卡片 ----------------
    {
        id: "card-mushroom-food-gallery",
        type: "image_card",
        mainCategory: "card",
        subCategory: "图文卡片",
        category: "gallery",
        title: "图文大卡 · 麦香下午茶暖黄双衬底",
        desc: "蘑菇气泡标题与暖黄下午茶实拍大图多重卡片衬底",
        badge: "图文卡片",
        iconName: "SlidersHorizontal",
        createNode: () => ({
            id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            type: "image_card",
            label: "麦香下午茶暖黄双衬底",
            rawHtml: `<section style="margin:24px 0;padding:16px;border-radius:16px;background:#fefbf3;border:1px solid #faeedb;box-shadow:0 4px 14px rgba(217,119,6,0.08);"><section style="display:flex;align-items:center;margin-bottom:12px;"><section style="display:inline-flex;align-items:center;background:#faeedb;border-radius:20px;padding:4px 14px 4px 8px;"><span style="font-size:18px;margin-right:6px;">🍄</span><span leaf="" style="font-size:14px;font-weight:700;color:#6b4028;">一日三餐 · 慢调生活</span><span style="margin-left:4px;font-size:12px;color:#d97706;font-weight:bold;">!</span></section></section><section style="width:100%;border-radius:12px;overflow:hidden;background:#fbf3e6;line-height:0;"><img src="https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=900&auto=format&fit=crop&q=80" style="width:100%;height:auto;display:block;border-radius:12px;object-fit:cover;" /></section><section style="margin-top:10px;text-align:center;"><p leaf="" style="margin:0;font-size:12px;color:#8c694a;letter-spacing:0.5px;">一杯热茶配松软点心，在慢时光中抚平浮躁</p></section></section>`,
            props: { kicker: "慢调生活", caption: "慢时光甜点下午茶" },
        }),
    },
    // ---------------- 荧光运动赛程日程卡 ----------------
    {
        id: "card-sports-fixture",
        type: "checklist_box",
        mainCategory: "card",
        subCategory: "底色卡片",
        category: "sequence",
        title: "多巴胺卡 · 今日赛事与训练日程",
        desc: "荧光黄绿色块阴影与清单式赛程打卡排版",
        badge: "多巴胺活力",
        iconName: "Bookmark",
        createNode: () => ({
            id: `box_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            type: "checklist_box",
            label: "今日赛事与训练日程",
            rawHtml: `<section style="margin:24px 0;padding:18px;border-radius:12px;background:#f7fee7;border:2px solid #bef264;box-shadow:3px 3px 0 #15803d;"><section style="display:flex;align-items:center;justify-content:space-between;border-bottom:1.5px dashed #a3e635;padding-bottom:10px;margin-bottom:12px;"><span leaf="" style="font-size:15px;font-weight:900;color:#14532d;">⚡ 今日运动能量看板</span><span style="font-size:11px;font-weight:800;color:#4d7c0f;background:#d9f99d;padding:2px 8px;border-radius:10px;">STAGE 1</span></section><section style="display:flex;flex-direction:column;gap:8px;"><section style="display:flex;align-items:center;gap:8px;font-size:13px;color:#166534;"><span style="width:16px;height:16px;border-radius:4px;background:#84cc16;color:#ffffff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;">✓</span><span leaf="">07:30 晨光慢跑 5 公里（心率区间保持在燃脂档）</span></section><section style="display:flex;align-items:center;gap:8px;font-size:13px;color:#166534;"><span style="width:16px;height:16px;border-radius:4px;background:#84cc16;color:#ffffff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;">✓</span><span leaf="">18:30 核心力量高强度间歇训练（HIIT 30分钟）</span></section><section style="display:flex;align-items:center;gap:8px;font-size:13px;color:#166534;"><span style="width:16px;height:16px;border-radius:4px;background:#bef264;color:#365314;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;">○</span><span leaf="">21:00 深度筋膜拉伸与运动后水分电解质补充</span></section></section></section>`,
            props: { title: "今日运动能量看板" },
        }),
    },
    // ---------------- 防诈骗套路拆解警示卡片 ----------------
    {
        id: "card-fraud-case-study",
        type: "checklist_box",
        mainCategory: "card",
        subCategory: "框线卡片",
        category: "sequence",
        title: "安全科普 · 常见电诈套路拆解卡",
        desc: "深蓝警示细边框与三步拆解关键防范法则",
        badge: "防诈小贴士",
        iconName: "Bookmark",
        createNode: () => ({
            id: `box_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            type: "checklist_box",
            label: "常见电诈套路拆解卡",
            rawHtml: `<section style="margin:24px 0;padding:18px;border-radius:12px;background:#f0f9ff;border:1.5px solid #bae6fd;box-shadow:0 3px 10px rgba(2,132,199,0.06);"><section style="display:flex;align-items:center;gap:8px;margin-bottom:12px;"><span style="font-size:18px;">🛡️</span><span leaf="" style="font-size:15px;font-weight:900;color:#0369a1;">防诈必记：不听 · 不信 · 不转账</span></section><section style="display:flex;flex-direction:column;gap:8px;"><section style="background:#ffffff;padding:10px 12px;border-radius:8px;border-left:3px solid #0284c7;"><span leaf="" style="font-size:13px;font-weight:bold;color:#0c4a6e;">1. 冒充客服退款：</span><span leaf="" style="font-size:12.5px;color:#475569;">凡称订单异常需索要银行卡密码或验证码的，统统是骗局。</span></section><section style="background:#ffffff;padding:10px 12px;border-radius:8px;border-left:3px solid #0284c7;"><span leaf="" style="font-size:13px;font-weight:bold;color:#0c4a6e;">2. 刷单返利陷阱：</span><span leaf="" style="font-size:12.5px;color:#475569;">所有宣称“足不出户、日入百千”的垫资刷单，前期蝇头小利只为引诱本金。</span></section><section style="background:#ffffff;padding:10px 12px;border-radius:8px;border-left:3px solid #0284c7;"><span leaf="" style="font-size:13px;font-weight:bold;color:#0c4a6e;">3. 虚假投资理财：</span><span leaf="" style="font-size:12.5px;color:#475569;">所谓内幕消息大师带单，高额返利平台皆可随意后台操控，务必保持清醒。</span></section></section></section>`,
            props: { title: "防诈必记：不听 · 不信 · 不转账" },
        }),
    },
    // ---------------- 传统霜降物候图文双栏卡片 ----------------
    {
        id: "card-frost-almanac",
        type: "double_column",
        mainCategory: "card",
        subCategory: "图文卡片",
        category: "discourse",
        title: "传统节气 · 霜降三候物候卡",
        desc: "古典水墨青色调呈现豺乃祭兽、草木黄落、蛰虫咸俯",
        badge: "二十四节气",
        iconName: "Columns",
        createNode: () => ({
            id: `col_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            type: "double_column",
            label: "霜降三候物候卡",
            rawHtml: `<section style="margin:24px 0;padding:18px;border-radius:12px;background:#f0fdfa;border:1px solid #ccfbf1;"><section style="text-align:center;margin-bottom:12px;"><span leaf="" style="font-size:15px;font-weight:800;color:#115e59;letter-spacing:1px;">· 霜降有三候 ·</span></section><section style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center;"><section style="background:#ffffff;padding:10px 6px;border-radius:8px;border:1px solid #e6fffa;"><span leaf="" style="font-size:13px;font-weight:bold;color:#0f766e;display:block;margin-bottom:4px;">初候 · 豺祭</span><span leaf="" style="font-size:11px;color:#64748b;line-height:1.4;display:block;">捕兽以祭天，感知天时肃杀</span></section><section style="background:#ffffff;padding:10px 6px;border-radius:8px;border:1px solid #e6fffa;"><span leaf="" style="font-size:13px;font-weight:bold;color:#0f766e;display:block;margin-bottom:4px;">二候 · 草黄</span><span leaf="" style="font-size:11px;color:#64748b;line-height:1.4;display:block;">秋风扫落叶，木叶尽归根土</span></section><section style="background:#ffffff;padding:10px 6px;border-radius:8px;border:1px solid #e6fffa;"><span leaf="" style="font-size:13px;font-weight:bold;color:#0f766e;display:block;margin-bottom:4px;">三候 · 虫伏</span><span leaf="" style="font-size:11px;color:#64748b;line-height:1.4;display:block;">蛰虫藏入穴，垂头闭户冬眠</span></section></section></section>`,
            props: { title: "霜降三候物候卡" },
        }),
    },
];
//# sourceMappingURL=wechatModernCardTemplates.js.map