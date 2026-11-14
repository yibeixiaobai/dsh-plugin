import type { WechatSectionNode } from "./wechatCanvasTypes.js";

/**
 * 创建标准的微信空白正文文字段落容器
 */
export function createBlankParagraphNode(): WechatSectionNode {
  return {
    id: `sec_p_${Math.random().toString(36).slice(2, 8)}`,
    type: "p",
    label: "正文段落",
    rawHtml: `<p style="margin:0 0 14px;font-size:14px;line-height:1.8;color:#374151;text-indent:2em;"><span leaf="">请在此输入正文内容...</span></p>`,
    props: { text: "请在此输入正文内容..." },
  };
}

/**
 * 平滑滚动画布视口至目标节点中心，并在需要时聚焦打字光标
 */
export function scrollToCanvasNode(nodeId: string, focusText = false) {
  requestAnimationFrame(() => {
    setTimeout(() => {
      const el = document.getElementById(nodeId);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });

      if (focusText) {
        const editableEl = el.querySelector<HTMLDivElement>("[contenteditable='true']");
        if (editableEl) {
          editableEl.focus();
          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            range.selectNodeContents(editableEl);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      }
    }, 60);
  });
}
