import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Command, Layers } from "lucide-react";
import { WechatImageRegenerateModal } from "./WechatImageRegenerateModal.js";
import { useWechatCanvasNodeActions } from "./useWechatCanvasNodeActions.js";
import { toast } from "../../../compat/components/ui/toast.js";
import { parseHtmlToWechatNodes, compileWechatNodesToHtml, extractImagesFromHtml, replaceImagesInHtmlByOrder, } from "./wechatHtmlAstBridge.js";
import { WechatContainerGizmo } from "./WechatContainerGizmo.js";
import { WechatGapInserter } from "./WechatGapInserter.js";
import { WechatEditableNode } from "./WechatEditableNode.js";
import { WechatBatchImageReplaceModal } from "./WechatBatchImageReplaceModal.js";
import { WechatCanvasLightbox } from "./WechatCanvasLightbox.js";
import { renderBrandBanner } from "../components/SocialArticlePlatformPreview.js";
import { useWechatCanvasHistory } from "./useWechatCanvasHistory.js";
import css from "./WechatInteractiveCanvas.module.css";
export function WechatInteractiveCanvas({ article, scriptsDir, workspacePath, brandTopUrl, brandBotUrl, brandTopSpec, brandBotSpec, resolvedCoverUrl, onContentChange, onTitleChange, }) {
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const [hoveredNodeId, setHoveredNodeId] = useState(null);
    const [justAddedNodeId, setJustAddedNodeId] = useState(null);
    const [lightboxUrl, setLightboxUrl] = useState(null);
    const [batchReplaceNodeId, setBatchReplaceNodeId] = useState(null);
    // 【中文修复依据】：正文配插图原生重新生成状态
    const [regenerateNodeId, setRegenerateNodeId] = useState(null);
    const [regeneratePrompt, setRegeneratePrompt] = useState("");
    const [regenerateIntent, setRegenerateIntent] = useState("");
    const [regenerateKeywords, setRegenerateKeywords] = useState([]);
    const [regenerateSubIndex, setRegenerateSubIndex] = useState(1);
    // 插入锚点状态 (画纸缝隙位置 0..nodes.length，与左侧排版素材库联动)
    const [activeInsertAnchorIndex, setActiveInsertAnchorIndex] = useState(null);
    const handleActivateAnchor = useCallback((targetIndex) => {
        setActiveInsertAnchorIndex(targetIndex);
        // 自动唤起左侧排版素材库面板
        window.dispatchEvent(new CustomEvent("wincode:social-open-typography"));
        // 广播插入锚点位置
        window.dispatchEvent(new CustomEvent("wincode:wechat-canvas-set-insert-anchor", {
            detail: { targetIndex },
        }));
    }, []);
    const handleCancelAnchor = useCallback(() => {
        setActiveInsertAnchorIndex(null);
        window.dispatchEvent(new CustomEvent("wincode:wechat-canvas-set-insert-anchor", {
            detail: { targetIndex: null },
        }));
    }, []);
    // 监听外部取消锚点或模板应用完成
    useEffect(() => {
        const handleSetAnchorFromOutside = (e) => {
            const detail = e.detail;
            if (detail && detail.targetIndex === null) {
                setActiveInsertAnchorIndex(null);
            }
        };
        const handleTemplateApplied = () => {
            setActiveInsertAnchorIndex(null);
        };
        window.addEventListener("wincode:wechat-canvas-set-insert-anchor", handleSetAnchorFromOutside);
        window.addEventListener("wincode:wechat-canvas-apply-template", handleTemplateApplied);
        return () => {
            window.removeEventListener("wincode:wechat-canvas-set-insert-anchor", handleSetAnchorFromOutside);
            window.removeEventListener("wincode:wechat-canvas-apply-template", handleTemplateApplied);
        };
    }, []);
    // Esc 键取消激活锚点
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === "Escape" && activeInsertAnchorIndex !== null) {
                handleCancelAnchor();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [activeInsertAnchorIndex, handleCancelAnchor]);
    // 80ms 离开防抖消除交界处频闪
    const hoverTimeoutRef = useRef(null);
    const handleNodeMouseEnter = useCallback((nodeId) => { if (hoverTimeoutRef.current)
        clearTimeout(hoverTimeoutRef.current); setHoveredNodeId(nodeId); }, []);
    const handleNodeMouseLeave = useCallback((nodeId) => { if (hoverTimeoutRef.current)
        clearTimeout(hoverTimeoutRef.current); hoverTimeoutRef.current = setTimeout(() => setHoveredNodeId((curr) => (curr === nodeId ? null : curr)), 80); }, []);
    useEffect(() => () => { if (hoverTimeoutRef.current)
        clearTimeout(hoverTimeoutRef.current); }, []);
    const [nodes, setNodes] = useState(() => parseHtmlToWechatNodes(article.content || ""));
    const lastSyncContentRef = useRef(article.content);
    useEffect(() => {
        if (article.content && article.content !== lastSyncContentRef.current) {
            lastSyncContentRef.current = article.content;
            setNodes(parseHtmlToWechatNodes(article.content));
        }
    }, [article.content]);
    // 【中文修复依据】：选中容器变更时，对外广播节点详情，供侧栏联动展示同类型推荐与替换操作
    useEffect(() => {
        const selected = nodes.find((n) => n.id === selectedNodeId) || null;
        window.dispatchEvent(new CustomEvent("wincode:wechat-canvas-selected-node-changed", {
            detail: { selectedNode: selected },
        }));
    }, [selectedNodeId, nodes]);
    const updateNodesAndEmit = useCallback((newNodes) => {
        setNodes(newNodes);
        const compiled = compileWechatNodesToHtml(newNodes);
        lastSyncContentRef.current = compiled;
        onContentChange?.(compiled);
    }, [onContentChange]);
    // 【中文修复依据】：全套专业快捷键与历史撤回/重做栈初始化
    const history = useWechatCanvasHistory({
        nodes,
        selectedNodeId,
        onApplyNodes: (restored) => updateNodesAndEmit(restored),
        onSelectNode: (id) => setSelectedNodeId(id),
        onSaveRequested: () => {
            updateNodesAndEmit(nodes);
            toast("已立即保存当前画布修改 (Ctrl+S)");
        },
        onDeleteSelected: () => handleDeleteSelected(),
        onDuplicateSelected: () => handleDuplicateSelected(),
    });
    const { handleDeleteSelected, handleDuplicateSelected, handleInsertBlankParagraphAt, handleMoveNode, handleChangeNodeTheme, } = useWechatCanvasNodeActions({
        nodes,
        selectedNodeId,
        history,
        updateNodesAndEmit,
        setSelectedNodeId,
        setJustAddedNodeId,
    });
    const handleNodeContentChange = useCallback((nodeId, newHtml) => {
        setNodes((prevNodes) => {
            const next = prevNodes.map((n) => (n.id === nodeId ? { ...n, rawHtml: newHtml } : n));
            const compiled = compileWechatNodesToHtml(next);
            lastSyncContentRef.current = compiled;
            onContentChange?.(compiled);
            return next;
        });
    }, [onContentChange]);
    // 触发正文插图重新生图弹窗
    const handleTriggerRegenerateForNode = useCallback((nodeId) => {
        const targetIdx = nodes.findIndex((n) => n.id === nodeId);
        if (targetIdx === -1)
            return;
        const targetNode = nodes[targetIdx];
        // 计算当前节点在整篇正文所有插图中的序号 subIndex
        let countBefore = 0;
        for (let i = 0; i < targetIdx; i++) {
            countBefore += extractImagesFromHtml(nodes[i]?.rawHtml || "").length;
        }
        const currentSub = countBefore + 1;
        // 匹配视觉蓝图槽位
        const matchedSlot = (article.visualSlots || []).find((vs) => vs.kind === "content" && vs.sub === currentSub);
        // 从 HTML 中自愈提取图注文本
        let extractedCaption = "";
        if (targetNode.rawHtml) {
            const pMatch = targetNode.rawHtml.match(/<p[^>]*>([^<]+)<\/p>/i);
            if (pMatch?.[1])
                extractedCaption = pMatch[1].trim();
        }
        const initialPrompt = matchedSlot?.generationPrompt ||
            matchedSlot?.intentDescription ||
            (extractedCaption ? `现代化专业科技信息图表，围绕「${extractedCaption}」，结构分明，模块化对比看板，全中文排版` : "") ||
            `高信息密度学术图表，严谨工整，指标对比看板，浅色干净背景`;
        setRegenerateNodeId(nodeId);
        setRegenerateSubIndex(currentSub);
        setRegeneratePrompt(initialPrompt);
        setRegenerateIntent(matchedSlot?.intentDescription || extractedCaption || "");
        setRegenerateKeywords(matchedSlot?.searchKeywords || (extractedCaption ? [extractedCaption, article.title] : []));
    }, [nodes, article.visualSlots, article.title]);
    // 当正文插图在弹窗中重新生成成功后的回写处理
    const handleImageRegenerated = useCallback((dataUrl) => {
        if (!regenerateNodeId)
            return;
        const targetNode = nodes.find((n) => n.id === regenerateNodeId);
        if (targetNode?.rawHtml) {
            history.pushSnapshot(nodes);
            const newHtml = replaceImagesInHtmlByOrder(targetNode.rawHtml, [dataUrl], { appendIfMore: false });
            handleNodeContentChange(regenerateNodeId, newHtml);
        }
        setRegenerateNodeId(null);
    }, [regenerateNodeId, nodes, history, handleNodeContentChange]);
    const handleConfirmBatchReplace = (orderedUrls) => {
        if (!batchReplaceNodeId)
            return;
        const target = nodes.find((n) => n.id === batchReplaceNodeId);
        if (!target?.rawHtml)
            return;
        history.pushSnapshot(nodes);
        const newHtml = replaceImagesInHtmlByOrder(target.rawHtml, orderedUrls, { appendIfMore: true });
        handleNodeContentChange(batchReplaceNodeId, newHtml);
        setBatchReplaceNodeId(null);
    };
    const targetNodeForBatchReplace = useMemo(() => (batchReplaceNodeId ? nodes.find((n) => n.id === batchReplaceNodeId) || null : null), [batchReplaceNodeId, nodes]);
    const targetOriginalImages = useMemo(() => (targetNodeForBatchReplace?.rawHtml ? extractImagesFromHtml(targetNodeForBatchReplace.rawHtml) : []), [targetNodeForBatchReplace]);
    const hasTopInNodes = useMemo(() => nodes.some((n) => n.rawHtml && (n.rawHtml.includes("__BRAND_TOP__") || (brandTopUrl && n.rawHtml.includes(brandTopUrl)))), [nodes, brandTopUrl]);
    const hasBotInNodes = useMemo(() => nodes.some((n) => n.rawHtml && (n.rawHtml.includes("__BRAND_BOT__") || (brandBotUrl && n.rawHtml.includes(brandBotUrl)))), [nodes, brandBotUrl]);
    return (_jsxs("div", { className: css.container, onClick: () => {
            setSelectedNodeId(null);
            if (activeInsertAnchorIndex !== null) {
                handleCancelAnchor();
            }
        }, children: [_jsxs("div", { className: css.paperCard, onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: css.titleArea, children: [_jsx("input", { type: "text", value: article.title || "", onChange: (e) => onTitleChange?.(e.target.value), placeholder: "\u8BF7\u8F93\u5165\u5FAE\u4FE1\u516C\u4F17\u53F7\u6587\u7AE0\u6807\u9898...", className: css.titleInput }), _jsxs("div", { className: css.metaRow, children: [_jsx("span", { children: "\u5FAE\u4FE1\u516C\u4F17\u5E73\u53F0\u6392\u7248" }), _jsx("span", { className: css.metaDot, children: "\u00B7" }), _jsxs("span", { children: [nodes.length, " \u4E2A\u5185\u5BB9\u6BB5\u843D"] })] })] }), brandTopUrl && !hasTopInNodes && (_jsx("div", { style: { paddingTop: 4, paddingBottom: 8 }, children: renderBrandBanner(brandTopUrl, brandTopSpec, "header", (url) => setLightboxUrl(url)) })), _jsx(WechatGapInserter, { onInsertBlank: () => handleInsertBlankParagraphAt(0), onPickTemplate: () => handleActivateAnchor(0), isActiveAnchor: activeInsertAnchorIndex === 0, onCancelAnchor: handleCancelAnchor }), _jsx("div", { className: css.nodesList, children: nodes.map((node, idx) => {
                            const isSelected = selectedNodeId === node.id;
                            const isHovered = hoveredNodeId === node.id;
                            const isJustAdded = justAddedNodeId === node.id;
                            return (_jsxs("div", { id: node.id, "data-section-node-id": node.id, style: { position: "relative" }, children: [_jsxs("div", { onMouseEnter: () => handleNodeMouseEnter(node.id), onMouseLeave: () => handleNodeMouseLeave(node.id), onClick: (e) => { e.stopPropagation(); setSelectedNodeId(node.id); }, className: `${css.nodeItem} ${isSelected ? css.nodeItemSelected : ""} ${isJustAdded ? css.nodeItemJustAdded : ""}`, children: [isHovered && !isSelected && !isJustAdded && (_jsx("div", { className: css.nodeHoverBadge, children: node.label })), isSelected && (_jsx(WechatContainerGizmo, { label: node.label, isFirst: idx === 0, isLast: idx === nodes.length - 1, hasImages: extractImagesFromHtml(node.rawHtml || "").length > 0, onMoveUp: () => handleMoveNode(idx, -1), onMoveDown: () => handleMoveNode(idx, 1), onInsertAbove: () => handleInsertBlankParagraphAt(idx), onInsertBelow: () => handleInsertBlankParagraphAt(idx + 1), onDuplicate: handleDuplicateSelected, onDelete: handleDeleteSelected, onChangeTheme: (themeKey) => handleChangeNodeTheme(idx, themeKey), onBatchReplaceImages: () => setBatchReplaceNodeId(node.id), onRegenerateImage: () => handleTriggerRegenerateForNode(node.id) })), _jsx(WechatEditableNode, { nodeId: node.id, rawHtml: node.rawHtml || "", isSelected: isSelected, onSelect: () => setSelectedNodeId(node.id), onContentChange: handleNodeContentChange, onImageClick: (src) => setLightboxUrl(src) })] }), _jsx(WechatGapInserter, { onInsertBlank: () => handleInsertBlankParagraphAt(idx + 1), onPickTemplate: () => handleActivateAnchor(idx + 1), isActiveAnchor: activeInsertAnchorIndex === idx + 1, onCancelAnchor: handleCancelAnchor })] }, node.id));
                        }) }), brandBotUrl && !hasBotInNodes && (_jsx("div", { style: { paddingTop: 12, paddingBottom: 8 }, children: renderBrandBanner(brandBotUrl, brandBotSpec, "footer", (url) => setLightboxUrl(url)) })), _jsxs("div", { className: css.bottomActions, children: [_jsxs("button", { type: "button", onClick: () => {
                                    window.dispatchEvent(new CustomEvent("wincode:social-open-typography"));
                                }, className: css.bottomActionBtn, title: "\u4E00\u952E\u5207\u6362\u5DE6\u4FA7\u8FB9\u680F\u4E3A\u5FAE\u4FE1\u6392\u7248\u7D20\u6750\u9762\u677F", children: [_jsx(Layers, { className: css.bottomActionIcon }), _jsx("span", { children: "\u4FA7\u680F\u6392\u7248\u7D20\u6750\u5E93" })] }), _jsx("button", { type: "button", onClick: () => handleInsertBlankParagraphAt(nodes.length), className: css.bottomActionBtn, title: "\u5728\u6587\u7AE0\u672B\u5C3E\u8FFD\u52A0\u7A7A\u767D\u666E\u901A\u6B63\u6587\u6BB5\u843D", children: _jsx("span", { children: "+ \u7A7A\u767D\u6BB5\u843D" }) })] }), _jsxs("div", { className: css.shortcutsGuide, children: [_jsxs("div", { className: css.shortcutsHeader, children: [_jsx(Command, { size: 12 }), _jsx("span", { children: "\u5FEB\u6377\u952E" })] }), ["Ctrl+Z 撤回", "Ctrl+Y 重做", "Ctrl+S 保存", "Delete 删除", "Esc 取消"].map((tip) => (_jsx("span", { className: css.shortcutPill, children: tip }, tip)))] })] }), _jsx(WechatImageRegenerateModal, { isOpen: Boolean(regenerateNodeId), onClose: () => setRegenerateNodeId(null), subIndex: regenerateSubIndex, initialPrompt: regeneratePrompt, intentDescription: regenerateIntent, searchKeywords: regenerateKeywords, articleIndex: article.index || 1, accountId: article.accountId, platform: article.platform, scriptsDir: scriptsDir, workspacePath: workspacePath, onImageRegenerated: handleImageRegenerated }), _jsx(WechatBatchImageReplaceModal, { isOpen: batchReplaceNodeId !== null, onClose: () => setBatchReplaceNodeId(null), originalImageUrls: targetOriginalImages, nodeLabel: targetNodeForBatchReplace?.label, onConfirmReplace: handleConfirmBatchReplace }), _jsx(WechatCanvasLightbox, { url: lightboxUrl, onClose: () => setLightboxUrl(null) })] }));
}
//# sourceMappingURL=WechatInteractiveCanvas.js.map