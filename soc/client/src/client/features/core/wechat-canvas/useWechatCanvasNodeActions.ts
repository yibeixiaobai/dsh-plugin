import { useEffect, useCallback } from "react";
import { toast } from "../../../compat/components/ui/toast.js";
import type { WechatSectionNode } from "./wechatCanvasTypes.js";
import { applyThemeToNodeHtml } from "./wechatHtmlAstBridge.js";
import { createBlankParagraphNode, scrollToCanvasNode } from "./wechatCanvasScrollUtils.js";
import { preserveNodeContent } from "./wechatContentPreserver.js";

export interface UseWechatCanvasNodeActionsOptions {
  nodes: WechatSectionNode[];
  selectedNodeId: string | null;
  history: any;
  updateNodesAndEmit: (newNodes: WechatSectionNode[]) => void;
  setSelectedNodeId: (id: string | null) => void;
  setJustAddedNodeId: (id: string | null) => void;
}

/**
 * 微信公众号专业排版画纸 - 节点增删改移与模板交互核心 Hook
 * 【中文依据】：将容器移动、主题切换、复制删除及素材库监听抽离为独立模块，保持画纸主组件在 400 行以内
 */
export function useWechatCanvasNodeActions({
  nodes,
  selectedNodeId,
  history,
  updateNodesAndEmit,
  setSelectedNodeId,
  setJustAddedNodeId,
}: UseWechatCanvasNodeActionsOptions) {
  const handleDeleteSelected = useCallback(() => {
    if (!selectedNodeId) return;
    const next = nodes.filter((n) => n.id !== selectedNodeId);
    updateNodesAndEmit(next);
    setSelectedNodeId(null);
    toast("已删除选中容器");
  }, [selectedNodeId, nodes, updateNodesAndEmit, setSelectedNodeId]);

  const handleDuplicateSelected = useCallback(() => {
    if (!selectedNodeId) return;
    const targetIdx = nodes.findIndex((n) => n.id === selectedNodeId);
    if (targetIdx === -1) return;
    const target = nodes[targetIdx]!;
    const dup: WechatSectionNode = { ...target, id: `${target.id}_copy_${Date.now().toString(36)}` };
    const next = [...nodes];
    next.splice(targetIdx + 1, 0, dup);
    updateNodesAndEmit(next);
    setSelectedNodeId(dup.id);
    setJustAddedNodeId(dup.id);
    setTimeout(() => {
      setJustAddedNodeId(null);
    }, 1200);
    scrollToCanvasNode(dup.id, false);
    toast("已复制容器副本 (Ctrl+D)");
  }, [selectedNodeId, nodes, updateNodesAndEmit, setSelectedNodeId, setJustAddedNodeId]);

  const handleInsertBlankParagraphAt = useCallback((targetIndex: number) => {
    const blankNode = createBlankParagraphNode();
    history.pushSnapshot(nodes);
    const next = [...nodes];
    next.splice(targetIndex, 0, blankNode);
    updateNodesAndEmit(next);

    setSelectedNodeId(blankNode.id);
    setJustAddedNodeId(blankNode.id);
    setTimeout(() => {
      setJustAddedNodeId(null);
    }, 1200);

    toast("已插入空白正文段落");
    scrollToCanvasNode(blankNode.id, true);
  }, [nodes, history, updateNodesAndEmit, setSelectedNodeId, setJustAddedNodeId]);

  const handleMoveNode = useCallback((index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= nodes.length) return;
    history.pushSnapshot(nodes);
    const next = [...nodes];
    const temp = next[target]!;
    next[target] = next[index]!;
    next[index] = temp;
    updateNodesAndEmit(next);
    scrollToCanvasNode(next[target]!.id, false);
  }, [nodes, history, updateNodesAndEmit]);

  const handleChangeNodeTheme = useCallback((index: number, themeKey: string) => {
    const target = nodes[index];
    if (!target?.rawHtml) return;
    history.pushSnapshot(nodes);
    const next = [...nodes];
    next[index] = { ...target, rawHtml: applyThemeToNodeHtml(target.rawHtml, themeKey) };
    updateNodesAndEmit(next);
  }, [nodes, history, updateNodesAndEmit]);

  // 监听左侧素材库应用事件
  useEffect(() => {
    const handleApplyFromSidebar = (e: Event) => {
      const customEvent = e as CustomEvent<{
        mode?: "replace" | "insert" | "insert_below" | "insert_above";
        targetNodeId?: string;
        targetIndex?: number;
        insertPosition?: "above" | "below";
        node: WechatSectionNode;
        title?: string;
      }>;
      const { mode, targetNodeId, targetIndex, insertPosition, node: newNode, title } = customEvent.detail || {};
      if (!newNode) return;

      history.pushSnapshot(nodes);

      // 1. 无损替换模式 (replace)
      if (mode === "replace" && targetNodeId) {
        const targetIdx = nodes.findIndex((n) => n.id === targetNodeId);
        if (targetIdx !== -1) {
          const oldNode = nodes[targetIdx]!;
          const preservedNode = preserveNodeContent(oldNode, newNode);
          const next = [...nodes];
          next[targetIdx] = preservedNode;

          updateNodesAndEmit(next);
          setSelectedNodeId(preservedNode.id);
          setJustAddedNodeId(preservedNode.id);
          setTimeout(() => {
            setJustAddedNodeId(null);
          }, 1200);

          toast(`已将当前容器替换为【${title || "新样式"}】（已保留原文内容）`);
          scrollToCanvasNode(preservedNode.id, preservedNode.type === "p");
          return;
        }
      }

      // 2. 相对节点插入模式 (insert_below / insert_above 或携带 insertPosition)
      if ((mode === "insert_below" || mode === "insert_above" || insertPosition) && targetNodeId) {
        const targetIdx = nodes.findIndex((n) => n.id === targetNodeId);
        if (targetIdx !== -1) {
          const isAbove = mode === "insert_above" || insertPosition === "above";
          const actualIndex = isAbove ? targetIdx : targetIdx + 1;
          const next = [...nodes];
          next.splice(actualIndex, 0, newNode);

          updateNodesAndEmit(next);
          setSelectedNodeId(newNode.id);
          setJustAddedNodeId(newNode.id);
          setTimeout(() => {
            setJustAddedNodeId(null);
          }, 1200);

          const posText = isAbove ? "上方" : "下方";
          toast(`已在当前容器${posText}插入【${title || "版式组件"}】`);
          scrollToCanvasNode(newNode.id, newNode.type === "p");
          return;
        }
      }

      // 3. 显式缝隙索引插入模式 (explicit targetIndex)
      if (typeof targetIndex === "number" && targetIndex >= 0 && targetIndex <= nodes.length) {
        const next = [...nodes];
        next.splice(targetIndex, 0, newNode);

        updateNodesAndEmit(next);
        setSelectedNodeId(newNode.id);
        setJustAddedNodeId(newNode.id);
        setTimeout(() => {
          setJustAddedNodeId(null);
        }, 1200);

        const posDesc = targetIndex === 0 ? "正文最开头" : `第 ${targetIndex} 节下方`;
        toast(`已在${posDesc}插入【${title || "版式组件"}】`);
        scrollToCanvasNode(newNode.id, newNode.type === "p");
        return;
      }

      // 4. 默认末尾追加模式 (若最后项为版权/底栏 colophon，则插入在 colophon 之前)
      let insertIndex = nodes.length;
      if (nodes.length > 0 && nodes[nodes.length - 1]?.type === "colophon") {
        insertIndex = nodes.length - 1;
      }
      const next = [...nodes];
      next.splice(insertIndex, 0, newNode);
      updateNodesAndEmit(next);

      setSelectedNodeId(newNode.id);
      setJustAddedNodeId(newNode.id);
      setTimeout(() => {
        setJustAddedNodeId(null);
      }, 1200);

      toast(`已插入【${title || "版式组件"}】至文章结尾`);
      scrollToCanvasNode(newNode.id, newNode.type === "p");
    };

    window.addEventListener("wincode:wechat-canvas-apply-template", handleApplyFromSidebar);
    window.addEventListener("wincode:wechat-canvas-insert-template", handleApplyFromSidebar);
    return () => {
      window.removeEventListener("wincode:wechat-canvas-apply-template", handleApplyFromSidebar);
      window.removeEventListener("wincode:wechat-canvas-insert-template", handleApplyFromSidebar);
    };
  }, [nodes, history, updateNodesAndEmit, setSelectedNodeId, setJustAddedNodeId]);

  return {
    handleDeleteSelected,
    handleDuplicateSelected,
    handleInsertBlankParagraphAt,
    handleMoveNode,
    handleChangeNodeTheme,
  };
}
