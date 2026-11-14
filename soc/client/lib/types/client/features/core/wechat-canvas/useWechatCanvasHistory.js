import { useState, useRef, useCallback, useEffect } from "react";
const MAX_HISTORY_STEPS = 30;
/**
 * 微信公众号专业排版画布 - 历史快照栈与全局快捷键 Hook
 * 支持：Ctrl+Z (撤回)、Ctrl+Y / Ctrl+Shift+Z (重做)、Ctrl+S (立即保存)、Delete (删除容器)、Esc (取消选中)、Ctrl+D (复制副本)
 */
export function useWechatCanvasHistory({ nodes, selectedNodeId, onApplyNodes, onSelectNode, onSaveRequested, onDeleteSelected, onDuplicateSelected, }) {
    const [past, setPast] = useState([]);
    const [future, setFuture] = useState([]);
    const currentNodesRef = useRef(nodes);
    currentNodesRef.current = nodes;
    // 压入新历史快照
    const pushSnapshot = useCallback((_newNodes) => {
        setPast((prev) => [...prev.slice(-MAX_HISTORY_STEPS + 1), currentNodesRef.current]);
        setFuture([]); // 新操作清除重做栈
    }, []);
    // 撤回操作 (Undo)
    const undo = useCallback(() => {
        if (past.length === 0)
            return false;
        const previous = past[past.length - 1];
        const newPast = past.slice(0, past.length - 1);
        setFuture((prev) => [currentNodesRef.current, ...prev]);
        setPast(newPast);
        onApplyNodes(previous);
        return true;
    }, [past, onApplyNodes]);
    // 重做操作 (Redo)
    const redo = useCallback(() => {
        if (future.length === 0)
            return false;
        const next = future[0];
        const newFuture = future.slice(1);
        setPast((prev) => [...prev, currentNodesRef.current]);
        setFuture(newFuture);
        onApplyNodes(next);
        return true;
    }, [future, onApplyNodes]);
    // 全局快捷键监听
    useEffect(() => {
        function handleKeyDown(e) {
            const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
            const mod = isMac ? e.metaKey : e.ctrlKey;
            const target = e.target;
            const isTyping = target.isContentEditable ||
                target.tagName === "INPUT" ||
                target.tagName === "TEXTAREA";
            // 1. Ctrl+S / Cmd+S：无论是否在打字，立即拦截浏览器保存并强制保存
            if (mod && (e.key === "s" || e.key === "S")) {
                e.preventDefault();
                onSaveRequested();
                return;
            }
            // 2. Ctrl+Z / Cmd+Z：撤回（仅在非文本打字时拦截画布级撤回）
            if (mod && !e.shiftKey && (e.key === "z" || e.key === "Z")) {
                if (!isTyping) {
                    e.preventDefault();
                    undo();
                }
                return;
            }
            // 3. Ctrl+Y 或 Ctrl+Shift+Z：重做
            if ((mod && (e.key === "y" || e.key === "Y")) || (mod && e.shiftKey && (e.key === "z" || e.key === "Z"))) {
                if (!isTyping) {
                    e.preventDefault();
                    redo();
                }
                return;
            }
            // 4. Ctrl+D / Cmd+D：复制当前选中容器
            if (mod && (e.key === "d" || e.key === "D")) {
                if (selectedNodeId && !isTyping) {
                    e.preventDefault();
                    onDuplicateSelected();
                }
                return;
            }
            // 5. Escape：取消容器选中
            if (e.key === "Escape") {
                if (selectedNodeId) {
                    e.preventDefault();
                    onSelectNode(null);
                }
                return;
            }
            // 6. Delete / Backspace：删除当前选中的容器（严禁在打字时误删）
            if ((e.key === "Delete" || e.key === "Backspace") && selectedNodeId && !isTyping) {
                e.preventDefault();
                onDeleteSelected();
            }
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [undo, redo, onSaveRequested, selectedNodeId, onSelectNode, onDeleteSelected, onDuplicateSelected]);
    return {
        pushSnapshot,
        undo,
        redo,
        canUndo: past.length > 0,
        canRedo: future.length > 0,
    };
}
//# sourceMappingURL=useWechatCanvasHistory.js.map