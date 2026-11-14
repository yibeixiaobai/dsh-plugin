import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useMemo } from 'react';
import { CheckCircle2, ExternalLink, Clock, Copy, Calendar, ShieldCheck, Camera, Maximize2, X, } from 'lucide-react';
import { Button } from '../../../compat/components/ui/button.js';
import { toast } from '../../../compat/components/ui/toast.js';
import { cn } from '../../../compat/components/lib/utils.js';
const PLATFORM_OFFICIAL_URLS = {
    gzh: {
        name: '微信公众平台',
        url: 'https://mp.weixin.qq.com/',
        color: 'text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
    },
    wechat: {
        name: '微信公众平台',
        url: 'https://mp.weixin.qq.com/',
        color: 'text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
    },
    xiaohongshu: {
        name: '小红书创作服务平台',
        url: 'https://creator.xiaohongshu.com/publish/publish',
        color: 'text-rose-600 dark:text-rose-400 border-rose-500/30 bg-rose-500/10',
    },
    xhs: {
        name: '小红书创作服务平台',
        url: 'https://creator.xiaohongshu.com/publish/publish',
        color: 'text-rose-600 dark:text-rose-400 border-rose-500/30 bg-rose-500/10',
    },
    zhihu: {
        name: '知乎创作平台',
        url: 'https://www.zhihu.com/creator/manage/creation/article',
        color: 'text-blue-600 dark:text-blue-400 border-blue-500/30 bg-blue-500/10',
    },
    baijiahao: {
        name: '百家号内容管理',
        url: 'https://baijiahao.baidu.com/builder/rc/home',
        color: 'text-indigo-600 dark:text-indigo-400 border-indigo-500/30 bg-indigo-500/10',
    },
    toutiao: {
        name: '今日头条创作者中心',
        url: 'https://mp.toutiao.com/profile_v4/graphic/articles',
        color: 'text-red-600 dark:text-red-400 border-red-500/30 bg-red-500/10',
    },
};
export function SocialPublishReceiptCard({ receipt, className }) {
    const [showScreenshotModal, setShowScreenshotModal] = useState(false);
    const meta = PLATFORM_OFFICIAL_URLS[receipt.platform] || {
        name: receipt.platformName || receipt.platform,
        url: 'https://mp.weixin.qq.com/',
        color: 'text-primary border-primary/30 bg-primary/10',
    };
    const actionText = useMemo(() => {
        if (receipt.publishAction === 'schedule')
            return '已成功排期托管';
        if (receipt.publishAction === 'publish_now')
            return '已正式发布';
        return '已安全存入草稿箱';
    }, [receipt.publishAction]);
    const targetLink = receipt.draftUrl || meta.url;
    const handleCopyLink = () => {
        navigator.clipboard.writeText(targetLink);
        toast('已复制平台后台链接到剪贴板');
    };
    return (_jsxs("div", { className: cn('my-3 flex flex-col gap-3 rounded-2xl border border-emerald-500/35 bg-card/90 p-4 shadow-sm backdrop-blur-sm', className), "data-testid": "social-publish-receipt-card", children: [_jsxs("div", { className: "flex items-center justify-between border-b border-border/40 pb-2.5", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "flex size-7 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shadow-2xs", children: _jsx(CheckCircle2, { className: "size-4" }) }), _jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-ui-sm font-bold text-foreground", children: "\u53D1\u5E03\u5B98\u65B9\u56DE\u6267\u51ED\u8BC1" }), _jsx("span", { className: cn('rounded-md px-1.5 py-0.5 text-[10px] font-semibold border', meta.color), children: meta.name }), _jsx("span", { className: "rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300", children: actionText })] }), _jsxs("p", { className: "text-ui-2xs text-foreground-subtle mt-0.5", children: ["\u76EE\u6807\u8D26\u53F7\uFF1A", receipt.accountName, " (ID: ", receipt.accountId, ")"] })] })] }), _jsxs("div", { className: "flex items-center gap-1.5", children: [_jsxs(Button, { type: "button", variant: "ghost", size: "xs", onClick: handleCopyLink, className: "h-7 gap-1 px-2 text-ui-2xs text-foreground-muted hover:text-primary cursor-pointer", title: "\u590D\u5236\u540E\u53F0\u94FE\u63A5", children: [_jsx(Copy, { className: "size-3" }), _jsx("span", { children: "\u590D\u5236\u94FE\u63A5" })] }), _jsxs(Button, { type: "button", variant: "outline", size: "xs", onClick: () => window.open(targetLink, '_blank'), className: "h-7 gap-1 px-2.5 text-ui-2xs font-semibold text-primary hover:bg-primary/10 cursor-pointer", title: "\u5728\u6D4F\u89C8\u5668\u4E2D\u76F4\u63A5\u6253\u5F00\u521B\u4F5C\u8005\u540E\u53F0\u67E5\u770B", children: [_jsx(ExternalLink, { className: "size-3" }), _jsx("span", { children: "\u76F4\u8FBE\u521B\u4F5C\u8005\u540E\u53F0" })] })] })] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-2 text-ui-xs bg-surface/30 p-2.5 rounded-xl border border-border/30", children: [_jsxs("div", { className: "flex flex-col gap-1 min-w-0", children: [_jsx("span", { className: "text-[10px] text-foreground-subtle", children: "\u6587\u7AE0\u6807\u9898" }), _jsxs("p", { className: "font-semibold text-foreground truncate", title: receipt.title, children: ["\u300A", receipt.title, "\u300B"] })] }), receipt.mediaId && (_jsxs("div", { className: "flex flex-col gap-1 min-w-0", children: [_jsx("span", { className: "text-[10px] text-foreground-subtle", children: "\u5E73\u53F0\u8349\u7A3F / \u5A92\u4F53\u51ED\u8BC1 ID" }), _jsx("p", { className: "font-mono text-ui-2xs text-primary truncate", title: receipt.mediaId, children: receipt.mediaId })] })), receipt.scheduledTime && (_jsxs("div", { className: "flex items-center gap-1.5 text-foreground-muted text-[11px]", children: [_jsx(Calendar, { className: "size-3 text-primary" }), _jsxs("span", { children: ["\u9884\u8BBE\u6392\u671F\u65F6\u95F4\uFF1A", _jsx("strong", { children: receipt.scheduledTime })] })] })), receipt.durationSeconds && (_jsxs("div", { className: "flex items-center gap-1.5 text-foreground-muted text-[11px]", children: [_jsx(Clock, { className: "size-3 text-emerald-500" }), _jsxs("span", { children: ["\u5168\u6D41\u7A0B\u603B\u8017\u65F6\uFF1A", _jsxs("strong", { children: [receipt.durationSeconds, " \u79D2"] })] })] }))] }), receipt.screenshotUrl && (_jsxs("div", { className: "flex flex-col gap-2 bg-surface/40 p-3 rounded-xl border border-border/40", children: [_jsxs("div", { className: "flex items-center justify-between text-ui-xs", children: [_jsxs("span", { className: "font-semibold text-foreground flex items-center gap-1.5", children: [_jsx(Camera, { className: "size-3.5 text-emerald-600 dark:text-emerald-400" }), _jsx("span", { children: "\u5B98\u65B9\u540E\u53F0\u771F\u5B9E\u6392\u671F\u4E0E\u53D1\u8868\u51ED\u8BC1\u622A\u56FE" })] }), _jsx("span", { className: "text-[10px] text-foreground-muted", children: "\u70B9\u51FB\u53EF\u653E\u5927\u67E5\u9A8C\u5FAE\u4FE1\u540E\u53F0\u65F6\u6BB5\u4E0E\u6279\u6B21" })] }), _jsxs("div", { className: "relative w-full max-h-52 overflow-hidden rounded-lg border border-border/60 bg-black/5 dark:bg-black/20 cursor-zoom-in group shadow-2xs transition-transform hover:border-emerald-500/50", onClick: () => setShowScreenshotModal(true), title: "\u70B9\u51FB\u67E5\u770B\u5B98\u65B9\u51ED\u8BC1\u5927\u56FE", children: [_jsx("img", { src: receipt.screenshotUrl, alt: "\u5B98\u65B9\u540E\u53F0\u53D1\u5E03\u51ED\u8BC1\u622A\u56FE", className: "w-full h-auto object-cover object-top max-h-52 group-hover:scale-[1.01] transition-transform", onError: (e) => {
                                    e.target.style.display = 'none';
                                } }), _jsxs("div", { className: "absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-ui-xs font-semibold backdrop-blur-2xs", children: [_jsx(Maximize2, { className: "size-4" }), _jsx("span", { children: "\u70B9\u51FB\u67E5\u770B\u5B8C\u6574\u540E\u53F0\u51ED\u8BC1\u5927\u56FE" })] })] })] })), showScreenshotModal && receipt.screenshotUrl && (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200", onClick: () => setShowScreenshotModal(false), children: _jsxs("div", { className: "relative max-w-4xl max-h-[90vh] bg-card rounded-2xl overflow-hidden border border-border shadow-2xl flex flex-col", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "flex items-center justify-between px-4 py-2.5 bg-surface border-b border-border", children: [_jsxs("span", { className: "text-ui-sm font-bold text-foreground flex items-center gap-2", children: [_jsx(Camera, { className: "size-4 text-emerald-500" }), _jsx("span", { children: "\u5B98\u65B9\u540E\u53F0\u53D1\u5E03\u4E0E\u5B9A\u65F6\u6392\u671F\u6838\u9A8C\u5927\u56FE" })] }), _jsx("button", { type: "button", onClick: () => setShowScreenshotModal(false), className: "size-7 rounded-lg hover:bg-surface-hover flex items-center justify-center text-foreground-muted hover:text-foreground cursor-pointer", children: _jsx(X, { className: "size-4" }) })] }), _jsx("div", { className: "overflow-auto p-2 bg-surface/50 max-h-[calc(90vh-50px)]", children: _jsx("img", { src: receipt.screenshotUrl, alt: "\u5B98\u65B9\u51ED\u8BC1\u653E\u5927\u56FE", className: "w-full h-auto rounded-lg shadow-sm" }) })] }) })), _jsxs("div", { className: "flex items-center justify-between text-ui-2xs text-foreground-subtlest pt-0.5", children: [receipt.traceId && (_jsxs("span", { className: "font-mono text-[10px] text-foreground-subtle", title: `Trace ID: ${receipt.traceId}`, children: ["Trace: ", receipt.traceId] })), _jsxs("div", { className: "flex items-center gap-1", children: [_jsx(ShieldCheck, { className: "size-3 text-emerald-500" }), _jsx("span", { children: "\u56FE\u6587\u6392\u7248\u3001Markdown \u53CA AI \u9AD8\u6E05\u914D\u56FE\u5FEB\u7167\u5DF2\u5B89\u5168\u5F52\u6863\u81F3\u672C\u5730\u4FDD\u9669\u7BB1" })] }), _jsx("span", { children: "\u5B98\u65B9 API / \u514D\u5BC6\u81EA\u52A8\u5316\u56DE\u6267\u6838\u9A8C\u5B8C\u6BD5" })] })] }));
}
//# sourceMappingURL=SocialPublishReceiptCard.js.map