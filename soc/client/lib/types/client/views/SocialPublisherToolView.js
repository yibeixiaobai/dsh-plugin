import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useMemo } from 'react';
import { Share2 } from 'lucide-react';
import { DisclosureRow } from '@winkoo/client-ui-primitives';
import css from './SocialPublisherToolView.module.css';
const PHASE_LABELS = {
    preflight: {
        running: '预检平台账号登录态...',
        completed: '平台账号登录态正常',
    },
    topics: {
        running: '全网热点分析与查重评估...',
        completed: '选题策划与查重通过',
    },
    writing: {
        running: '平台图文智能排版与生成...',
        completed: '图文规范排版完成',
    },
    images: {
        running: '定制视觉蓝图与 AI 插图绘制...',
        completed: 'AI 封面与插图绘制完成',
    },
    validating: {
        running: '排版与合规机器硬性校验...',
        completed: '机器合规校验通过',
    },
    publishing: {
        running: '同步推送官方草稿箱...',
        completed: '已同步至官方草稿箱',
    },
    ready: {
        running: '社媒矩阵流水线执行中...',
        completed: '社媒内容矩阵创作就绪（可在右侧或中央审校）',
    },
};
function resolvePhaseFromArgs(raw) {
    if (!raw)
        return 'writing';
    try {
        const parsed = JSON.parse(raw);
        const action = String(parsed['action'] || parsed['mode'] || '').toLowerCase();
        if (action === 'publish' || action.includes('publish'))
            return 'publishing';
        if (action === 'validate')
            return 'validating';
        if (action === 'image' || action.includes('image') || action.includes('pic'))
            return 'images';
        if (action === 'topic' || action.includes('topic') || action.includes('discover'))
            return 'topics';
        if (action === 'preflight' || action.includes('login'))
            return 'preflight';
        if (action === 'produce' || action.includes('write') || action.includes('build'))
            return 'writing';
    }
    catch {
        const lower = raw.toLowerCase();
        if (lower.includes('publish'))
            return 'publishing';
        if (lower.includes('validate'))
            return 'validating';
        if (lower.includes('image'))
            return 'images';
        if (lower.includes('topic'))
            return 'topics';
        if (lower.includes('login') || lower.includes('preflight'))
            return 'preflight';
    }
    return 'writing';
}
/* v8 ignore next -- Non-expandable rows never invoke DisclosureRow's required toggle callback. */
const noop = () => undefined;
/**
 * Streamlined presentation component for `social_publisher` tool calls.
 * Replaces noisy, raw escaped JSON dumps with a compact, phase-based
 * native `DisclosureRow` with clean status indicators.
 *
 * @param props - Composed toolview slot props.
 * @returns Status row with expandable details.
 */
export function SocialPublisherToolView(props) {
    return props.phase === 'preparing'
        ? _jsx(PreparingSocialPublisherRow, { ...props })
        : _jsx(StartedSocialPublisherRow, { ...props });
}
function PreparingSocialPublisherRow({ toolName }) {
    return (_jsx("div", { "data-tool": toolName, "data-state": "preparing", "aria-label": "\u51C6\u5907\u793E\u5A92\u53D1\u5E03\u4EFB\u52A1...", children: _jsx(DisclosureRow, { title: "\u521D\u59CB\u5316\u793E\u5A92\u77E9\u9635\u5185\u5BB9\u751F\u4EA7\u6D41\u6C34\u7EBF...", icon: _jsx(Share2, { size: 14, style: { color: '#10b981' } }), open: false, expandable: false, onToggle: noop, running: true }) }));
}
function StartedSocialPublisherRow({ block, inspect, toolName, }) {
    const settled = 'kind' in block;
    const state = !settled ? 'running' : block.error?.code === 'interrupted' ? 'stopped' : block.isError ? 'error' : 'ok';
    const args = (settled ? block.call?.argsRaw : block.argsRaw) ?? '';
    const output = settled
        ? block.content.map(item => (item.type === 'text' ? item.text : JSON.stringify(item))).join('\n')
        : '';
    const details = output || (settled && block.error ? `${block.error.name}: ${block.error.code}` : '');
    const [expanded, setExpanded] = useState(false);
    const phase = useMemo(() => resolvePhaseFromArgs(args), [args]);
    const title = useMemo(() => {
        if (state === 'running') {
            return PHASE_LABELS[phase]?.running ?? '社媒矩阵流水线执行中...';
        }
        if (state === 'error') {
            return '社媒发布流水线异常';
        }
        if (state === 'stopped') {
            return '社媒发布流水线已中断';
        }
        return PHASE_LABELS[phase]?.completed ?? '社媒内容矩阵创作就绪';
    }, [phase, state]);
    return (_jsx("div", { "data-tool": toolName, "data-state": state, children: _jsxs(DisclosureRow, { title: title, icon: _jsx(Share2, { size: 14, style: { color: state === 'error' ? '#ef4444' : '#10b981' } }), open: expanded && details !== '', expandable: details !== '', expandOnRowClick: true, keepContentWhenOpen: true, running: state === 'running', onToggle: () => setExpanded(prev => !prev), collapsedContent: _jsx("span", { className: css.summary, children: _jsx("span", { className: css.phaseBadge, children: phase }) }), children: [_jsx("pre", { className: css.output, children: details }), inspect && (_jsx("button", { type: "button", className: css.inspectBtn, onClick: inspect, children: "\u67E5\u770B\u8F68\u8FF9\u8BE6\u60C5" }))] }) }));
}
//# sourceMappingURL=SocialPublisherToolView.js.map