import { jsx as _jsx } from "react/jsx-runtime";
import { useRef, useEffect, useCallback } from "react";
import { cleanAndUnescapeHtmlContent } from "../socialPublisherWorkflowExtractor.js";
import css from "./WechatEditableNode.module.css";
/**
 * 微信公众号专业排版画布 - 原位可编辑节点容器
 * 支持所见即所得光标打字、实时单行清洗、纯文本粘贴，彻底避免输入时光标跳动
 */
export function WechatEditableNode({ nodeId, rawHtml, isSelected, onContentChange, onSelect, onImageClick, }) {
    const containerRef = useRef(null);
    const isComposingRef = useRef(false);
    const isFocusedRef = useRef(false);
    const lastHtmlRef = useRef(rawHtml);
    // 初始化与非聚焦状态下的外部内容单向同步
    useEffect(() => {
        if (!containerRef.current)
            return;
        // 当用户正在当前容器内打字聚焦时，绝不从外部覆盖 innerHTML，防止光标跳动丢失
        if (isFocusedRef.current)
            return;
        const cleaned = cleanAndUnescapeHtmlContent(rawHtml || "");
        if (containerRef.current.innerHTML !== cleaned) {
            containerRef.current.innerHTML = cleaned;
            lastHtmlRef.current = rawHtml;
        }
    }, [rawHtml, nodeId]);
    // 处理输入事件：实时提取并清理 HTML
    const handleInput = useCallback(() => {
        if (!containerRef.current)
            return;
        // 中文输入法拼写过程中暂缓向上同步
        if (isComposingRef.current)
            return;
        const currentHtml = containerRef.current.innerHTML;
        // 微信排版铁律：清除换行符，保持单行
        const cleanedHtml = currentHtml.replace(/\r?\n/g, "").trim();
        if (cleanedHtml !== lastHtmlRef.current) {
            lastHtmlRef.current = cleanedHtml;
            onContentChange(nodeId, cleanedHtml);
        }
    }, [nodeId, onContentChange]);
    // 纯文本智能粘贴：避免外部网页富文本污染出版物排版
    const handlePaste = useCallback((e) => {
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain");
        if (!text)
            return;
        // 使用现代选区 API 插入纯文本，保持周围 span 与 inline-style 完整性
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0)
            return;
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const textNode = document.createTextNode(text);
        range.insertNode(textNode);
        // 移动光标至插入文字末尾
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
        selection.removeAllRanges();
        selection.addRange(range);
        handleInput();
    }, [handleInput]);
    return (_jsx("div", { ref: containerRef, contentEditable: true, suppressContentEditableWarning: true, onFocus: () => {
            isFocusedRef.current = true;
            onSelect();
        }, onBlur: () => {
            isFocusedRef.current = false;
            handleInput();
        }, onCompositionStart: () => {
            isComposingRef.current = true;
        }, onCompositionEnd: () => {
            isComposingRef.current = false;
            handleInput();
        }, onInput: handleInput, onPaste: handlePaste, onClick: (e) => {
            const target = e.target;
            if (target && target.tagName && target.tagName.toLowerCase() === "img") {
                const src = target.src;
                if (src) {
                    onImageClick?.(src);
                    return;
                }
            }
            onSelect();
        }, className: `${css.editableNode} ${isSelected ? css.cursorText : css.cursorPointer}` }));
}
//# sourceMappingURL=WechatEditableNode.js.map