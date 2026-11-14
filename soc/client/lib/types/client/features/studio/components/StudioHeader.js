import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { LayoutPanelLeft, Loader2, Check } from "lucide-react";
import css from "./StudioHeader.module.css";
const DEFAULT_STAGE = { text: "准备就绪", dotClass: css.dotIdle };
/**
 * 阶段状态克制映射
 * 【中文修复依据】：依循极简出版画纸规范，提供低噪点微标与稳定状态指示
 */
const STAGE_LABELS = {
    idle: DEFAULT_STAGE,
    topics: { text: "选题构思", dotClass: css.dotAmber },
    generating: { text: "正文排版构建中", dotClass: css.dotPulsePrimary },
    review: { text: "待审校确认", dotClass: css.dotAmber },
    publishing: { text: "发布中", dotClass: css.dotPulsePrimary },
    published: { text: "已完成发布", dotClass: css.dotSuccess },
};
/**
 * 顶部标题栏（工作台标识、阶段微指示器、正式/演练模式、落盘同步状态）
 */
export function StudioHeader({ workflow, physicalSaveStatus = "idle" }) {
    const stage = (workflow.stage ? STAGE_LABELS[workflow.stage] : undefined) ?? DEFAULT_STAGE;
    const isDryRun = Boolean(workflow.isDryRun);
    const showModeBadge = workflow.stage === "review" || workflow.stage === "publishing" || workflow.stage === "published";
    return (_jsxs("div", { "data-testid": "studio-header", className: css.header, children: [_jsxs("div", { className: css.left, children: [_jsxs("div", { className: css.brand, children: [_jsx(LayoutPanelLeft, { className: css.brandIcon }), _jsx("span", { children: "\u793E\u5A92\u53D1\u5E03\u5DE5\u4F5C\u53F0" })] }), _jsx("span", { className: css.divider }), _jsxs("div", { className: css.stage, children: [_jsx("span", { className: `${css.dot} ${stage.dotClass}` }), _jsx("span", { children: stage.text })] }), showModeBadge && (isDryRun ? (_jsx("span", { className: `${css.modeBadge} ${css.modeDryRun}`, title: "\u5F53\u524D\u5904\u4E8E\u79BB\u7EBF\u6F14\u7EC3\u6A21\u5F0F\uFF0C\u4EC5\u751F\u6210\u6A21\u62DF\u56DE\u6267\uFF0C\u4E0D\u8C03\u7528\u771F\u5B9E\u6D4F\u89C8\u5668\u5411\u7EBF\u4E0A\u5E73\u53F0\u53D1\u5E03", children: "\u79BB\u7EBF\u6F14\u7EC3" })) : (_jsx("span", { className: `${css.modeBadge} ${css.modeOfficial}`, title: "\u5F53\u524D\u5904\u4E8E\u771F\u5B9E\u7EBF\u4E0A\u53D1\u5E03\u6A21\u5F0F\uFF0C\u786E\u8BA4\u540E\u5C06\u76F4\u63A5\u63A8\u9001\u5230\u5BF9\u5E94\u5E73\u53F0\u5B98\u65B9\u540E\u53F0", children: "\u6B63\u5F0F\u53D1\u5E03" })))] }), _jsxs("div", { className: css.right, children: [physicalSaveStatus === "saving" && (_jsxs("div", { className: `${css.syncState} ${css.syncLoading}`, children: [_jsx(Loader2, { className: `${css.syncIcon} ${css.syncSpin}` }), _jsx("span", { children: "\u6C99\u7BB1\u7269\u7406\u540C\u6B65\u4E2D" })] })), physicalSaveStatus === "synced" && (_jsxs("div", { className: `${css.syncState} ${css.syncSuccess}`, children: [_jsx(Check, { className: css.syncIcon }), _jsx("span", { children: "\u6C99\u7BB1\u7269\u7406\u5DF2\u540C\u6B65" })] })), physicalSaveStatus === "error" && (_jsx("span", { className: css.syncError, children: "\u7269\u7406\u843D\u76D8\u5931\u8D25" }))] })] }));
}
//# sourceMappingURL=StudioHeader.js.map