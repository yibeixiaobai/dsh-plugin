import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Plus, Sparkles, X, MapPin } from "lucide-react";
import css from "./WechatGapInserter.module.css";
/**
 * 微信公众号专业排版画布 - 缝隙插入触发器
 * 支持两路分流：直接就地插入空白正文段落，或激活发丝级位置锚点并在左侧展开版式素材库
 */
export function WechatGapInserter({ onInsertBlank, onPickTemplate, isActiveAnchor = false, onCancelAnchor, }) {
    if (isActiveAnchor) {
        return (_jsx("div", { className: `${css.gapRoot} ${css.gapRootActive}`, children: _jsxs("div", { className: css.activeAnchorContainer, children: [_jsx("div", { className: css.anchorLine }), _jsxs("div", { className: css.anchorBadge, children: [_jsx(MapPin, { className: css.anchorPinIcon }), _jsx("span", { className: css.anchorLabel, children: "\u6B63\u5728\u5411\u6B64\u4F4D\u7F6E\u63D2\u5165\u7EC4\u4EF6 (\u5DF2\u8054\u52A8\u5DE6\u4FA7\u7D20\u6750\u5E93)" }), onCancelAnchor && (_jsxs("button", { type: "button", className: css.cancelAnchorBtn, onClick: (e) => {
                                    e.stopPropagation();
                                    onCancelAnchor();
                                }, title: "\u53D6\u6D88\u6B64\u63D2\u5165\u4F4D\u7F6E\u951A\u70B9", children: [_jsx(X, { className: css.cancelIcon }), _jsx("span", { children: "\u53D6\u6D88" })] }))] }), _jsx("div", { className: css.anchorLine })] }) }));
    }
    return (_jsx("div", { className: css.gapRoot, children: _jsxs("div", { className: css.hoverTrigger, children: [_jsx("div", { className: css.gapLine }), _jsxs("div", { className: css.actionsGroup, children: [_jsxs("button", { type: "button", className: `${css.actionButton} ${css.blankBtn}`, onClick: (e) => {
                                e.stopPropagation();
                                onInsertBlank();
                            }, title: "\u5728\u6B64\u5904\u76F4\u63A5\u63D2\u5165\u7A7A\u767D\u6B63\u6587\u6BB5\u843D\uFF0C\u6253\u5B57\u66F4\u5FEB\u6377", children: [_jsx(Plus, { className: css.plusIcon }), _jsx("span", { children: "\u7A7A\u767D\u6BB5\u843D" })] }), _jsxs("button", { type: "button", className: `${css.actionButton} ${css.templateBtn}`, onClick: (e) => {
                                e.stopPropagation();
                                onPickTemplate();
                            }, title: "\u4E3A\u6B64\u4F4D\u7F6E\u8BBE\u5B9A\u951A\u70B9\u5E76\u5524\u8D77\u5DE6\u4FA7\u6392\u7248\u7D20\u6750\u5E93", children: [_jsx(Sparkles, { className: css.sparkleIcon }), _jsx("span", { children: "\u6311\u9009\u7D20\u6750" })] })] }), _jsx("div", { className: css.gapLine })] }) }));
}
//# sourceMappingURL=WechatGapInserter.js.map