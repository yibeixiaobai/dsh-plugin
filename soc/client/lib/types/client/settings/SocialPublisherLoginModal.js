import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, ShieldCheck, Globe, QrCode, RefreshCw, X, ChevronLeft, ChevronRight, ExternalLink, } from "lucide-react";
import css from "./SocialPublisherLoginModal.module.css";
import { publisherApiFetch } from "../settings/SocialPublisherTypes.js";
import { useServices } from "../compat/hooks/useServices.js";
import { useOptionalPlatform } from "../compat/hooks/usePlatform.js";
import { logger } from "../compat/logger.js";
import { getSocialPlatformLoginUrl, isSocialPlatformLoginUrl, isSocialPlatformSuccessUrl, hasSocialPlatformAuthCredentials, parseCookieString, DEFAULT_DESKTOP_CHROME_UA, } from "../compat/types.js";
import { probeXhsWebviewLogin } from "../settings/socialPublisherLoginHelper.js";
import { useSocialPublisherWebview } from "../settings/useSocialPublisherWebview.js";
const PLATFORM_NAMES = {
    gzh: "微信公众平台",
    wechat: "微信公众平台",
    zhihu: "知乎创作平台",
    xiaohongshu: "小红书创作服务平台",
    xhs: "小红书创作服务平台",
    baijiahao: "百家号平台",
    toutiao: "今日头条号平台",
};
async function extractWechatTokenAndName(url, webview) {
    const match = url.match(/token=([0-9a-zA-Z_-]+)/);
    let userName;
    try {
        const dom = (await webview
            .executeJavaScript("(() => { const el = document.querySelector('.weui-desktop-account__nickname, .account_name, .user_name'); return el ? (el.textContent || '').trim() : ''; })()")
            .catch(() => ""));
        if (dom)
            userName = dom;
    }
    catch { }
    return { token: match ? match[1] : undefined, userName };
}
export { getSocialPlatformLoginUrl as getPlatformLoginUrl };
export function SocialPublisherLoginModal({ open, onOpenChange, platform, accountId, accountName, onLoginSuccess, }) {
    const services = useServices();
    const socialPublisherRpc = services?.socialPublisherService ?? services?.socialPublisherRpc ?? null;
    const platformService = useOptionalPlatform();
    const mountTimeRef = useRef(Date.now());
    const [savingSession, setSavingSession] = useState(false);
    const [loginSucceeded, setLoginSucceeded] = useState(false);
    const [statusText, setStatusText] = useState("正在载入登录页，请稍候...");
    const platformDisplayName = PLATFORM_NAMES[platform.toLowerCase()] || platform;
    const loginUrl = getSocialPlatformLoginUrl(platform);
    const partitionKey = `persist:social_${platform.toLowerCase()}_${(accountId || "default").trim()}`;
    const handleClose = useCallback(() => {
        onOpenChange(false);
        setLoginSucceeded(false);
        setSavingSession(false);
    }, [onOpenChange]);
    const commitLoginSession = useCallback(async (cookies, token, userName) => {
        if (savingSession || loginSucceeded)
            return;
        setSavingSession(true);
        setStatusText("正在持久化保存已授权的会话凭据...");
        try {
            const platRoute = platform
                .toLowerCase()
                .replace("xiaohongshu", "xhs")
                .replace("gzh", "wechat");
            const res = await publisherApiFetch(`/api/gzh-publisher/login/${platRoute}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    account_id: accountId,
                    action: "save_session",
                    cookies,
                    token,
                    user_name: userName,
                }),
            }, socialPublisherRpc);
            const data = await res.json().catch(() => ({}));
            if (data.ok) {
                setLoginSucceeded(true);
                setStatusText(`授权成功！账号 [${accountId}] 登录态已建立并在专属会话分区中持久化。`);
                window.dispatchEvent(new CustomEvent("wincode:social-account-login-synced", {
                    detail: { accountId, userName },
                }));
                setTimeout(() => {
                    onLoginSuccess();
                    handleClose();
                }, 1200);
            }
            else {
                setStatusText(`保存凭据未通过: ${data.error || "服务端拒绝保存该凭据"}`);
            }
        }
        catch (err) {
            logger.error("[SocialLoginModal] 保存登录凭据失败:", err);
            setStatusText(`保存凭据异常: ${err.message || String(err)}`);
        }
        finally {
            setSavingSession(false);
        }
    }, [
        accountId,
        handleClose,
        loginSucceeded,
        onLoginSuccess,
        platform,
        savingSession,
        socialPublisherRpc,
    ]);
    const extractSessionCookies = useCallback(async (fallbackUrl) => {
        // 优先通过主进程专属 IPC 获取分区持久化 Cookie（包含 HttpOnly 凭据）
        if (typeof window !== "undefined" && window.dshDesktop?.getPartitionCookies) {
            try {
                const partitionCookies = await window.dshDesktop.getPartitionCookies(partitionKey);
                if (Array.isArray(partitionCookies) && partitionCookies.length > 0)
                    return partitionCookies;
            }
            catch (err) {
                logger.warn("[SocialLoginModal] 提取 Desktop Partition Cookie 失败:", err);
            }
        }
        if (platformService?.getPartitionCookies) {
            try {
                const partitionCookies = await platformService.getPartitionCookies(partitionKey);
                if (Array.isArray(partitionCookies) && partitionCookies.length > 0)
                    return partitionCookies;
            }
            catch (err) {
                logger.warn("[SocialLoginModal] 提取 Partition Cookie 失败，降级读取 DOM:", err);
            }
        }
        const webview = webviewRef.current;
        if (webview) {
            const cookieStr = (await webview
                .executeJavaScript("document.cookie")
                .catch(() => ""));
            if (cookieStr) {
                const targetUrl = fallbackUrl || loginUrl;
                try {
                    const domainHost = "." + new URL(targetUrl).hostname.split(".").slice(-2).join(".");
                    return parseCookieString(cookieStr, domainHost);
                }
                catch {
                    return parseCookieString(cookieStr, "");
                }
            }
        }
        return [];
    }, [loginUrl, partitionKey, platformService]);
    const checkWebviewLoginState = useCallback(async (url) => {
        const webview = webviewRef.current;
        if (!webview || !open || loginSucceeded || savingSession)
            return;
        // 1. 挂载前 2.5 秒防抖，避免首屏未完成重定向时的瞬间误判
        if (Date.now() - mountTimeRef.current < 2500)
            return;
        // 2. URL 判定：若处于登录/认证页或未到达成功页，绝不判定成功
        if (isSocialPlatformLoginUrl(platform, url) || !isSocialPlatformSuccessUrl(platform, url))
            return;
        // 3. 页面 DOM 检查：若可见登录表单或二维码存在，绝不自动判定（严格限定在登录容器内）
        const hasControls = await webview
            .executeJavaScript(`
        (() => {
          const loginContainer = document.querySelector('.login__type__container, .login_frame, #login_container, .login-box, .login-container');
          const qrcode = loginContainer ? loginContainer.querySelector('.qrcode, [class*="qrcode"], canvas, img') : null;
          const loginBtn = document.querySelector('.login-form button[type="submit"], form[action*="login"] button, button.btn_login, .login-btn, input[type="password"]');
          return Boolean((qrcode && qrcode.offsetParent !== null) || (loginBtn && loginBtn.offsetParent !== null));
        })()
      `)
            .catch(() => false);
        if (hasControls)
            return;
        const p = platform.toLowerCase();
        const isXhs = p === "xhs" || p === "xiaohongshu";
        let extractedUserName;
        // 4. 小红书专属内嵌同源接口与 LocalStorage 双探针强校验
        if (isXhs) {
            const xhsProbe = await probeXhsWebviewLogin(webview);
            if (!xhsProbe.ok)
                return;
            if (xhsProbe.userName)
                extractedUserName = xhsProbe.userName;
        }
        // 5. 提取 token 与核心鉴权 Cookie 强校验
        let token;
        if (p === "gzh" || p === "wechat") {
            const wx = await extractWechatTokenAndName(url, webview);
            token = wx.token;
            if (!extractedUserName && wx.userName)
                extractedUserName = wx.userName;
        }
        const cookies = await extractSessionCookies(url);
        const credCheck = hasSocialPlatformAuthCredentials(platform, cookies, token);
        if (!credCheck.valid)
            return;
        await commitLoginSession(cookies, token, extractedUserName);
    }, [commitLoginSession, extractSessionCookies, loginSucceeded, open, platform, savingSession]);
    const { webviewRef, loading, canGoBack, canGoForward, currentUrl, } = useSocialPublisherWebview({
        open,
        platform,
        onCheckLoginState: checkWebviewLoginState,
    });
    const handleManualSync = async () => {
        const webview = webviewRef.current;
        if (!webview)
            return;
        setStatusText("正在从内置浏览器中提取授权会话并核验...");
        try {
            const url = webview.getURL?.() || currentUrl;
            const p = platform.toLowerCase();
            const isXhs = p === "xhs" || p === "xiaohongshu";
            let extractedUserName;
            if (isXhs) {
                const xhsProbe = await probeXhsWebviewLogin(webview);
                if (!xhsProbe.ok) {
                    setStatusText("小红书创作者服务平台尚未检测到有效登录态，请在页面中完成扫码登录后再试");
                    return;
                }
                if (xhsProbe.userName)
                    extractedUserName = xhsProbe.userName;
            }
            const cookies = await extractSessionCookies(url);
            let token;
            if (p === "gzh" || p === "wechat") {
                const wx = await extractWechatTokenAndName(url, webview);
                token = wx.token;
                if (!extractedUserName && wx.userName)
                    extractedUserName = wx.userName;
            }
            const credCheck = hasSocialPlatformAuthCredentials(platform, cookies, token);
            if (!credCheck.valid) {
                setStatusText(credCheck.reason || "当前尚未检测到有效登录态凭据，请确保已在页面完成扫码登录");
                return;
            }
            await commitLoginSession(cookies, token, extractedUserName);
        }
        catch (err) {
            setStatusText(`提取会话失败: ${err.message || String(err)}`);
        }
    };
    const handleOpenExternal = () => {
        const url = currentUrl || loginUrl;
        if (platformService?.openExternal) {
            platformService.openExternal(url);
        }
        else if (typeof window !== "undefined") {
            window.open(url, "_blank");
        }
    };
    // 快捷键 Esc 关闭监听
    useEffect(() => {
        if (!open)
            return;
        const handleKeyDown = (e) => {
            if (e.key === "Escape") {
                handleClose();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [handleClose, open]);
    useEffect(() => {
        if (!open)
            return;
        mountTimeRef.current = Date.now();
        setLoginSucceeded(false);
        setSavingSession(false);
        setStatusText("请在下方内置浏览器中完成扫码或登录授权...");
    }, [open]);
    if (!open || typeof document === "undefined")
        return null;
    return createPortal(_jsx("div", { className: css.modalRoot, "data-testid": "social-publisher-login-modal", onClick: (e) => {
            if (e.target === e.currentTarget)
                handleClose();
        }, children: _jsxs("div", { className: css.modalContainer, onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: css.header, children: [_jsxs("div", { className: css.headerTop, children: [_jsxs("div", { className: css.headerNavGroup, children: [_jsx("button", { type: "button", className: css.headerNavBtn, title: "\u540E\u9000", disabled: !canGoBack, onClick: () => webviewRef.current?.goBack?.(), children: _jsx(ChevronLeft, { className: "size-4" }) }), _jsx("button", { type: "button", className: css.headerNavBtn, title: "\u524D\u8FDB", disabled: !canGoForward, onClick: () => webviewRef.current?.goForward?.(), children: _jsx(ChevronRight, { className: "size-4" }) }), _jsx("button", { type: "button", className: css.headerNavBtn, title: "\u91CD\u65B0\u8F7D\u5165\u9875\u9762", onClick: () => webviewRef.current?.reload?.(), children: _jsx(RefreshCw, { className: `size-3.5 ${loading ? "animate-spin" : ""}` }) }), _jsxs("div", { className: css.headerTitle, children: [_jsx(ShieldCheck, { className: "size-4 text-emerald-500" }), _jsxs("span", { children: [platformDisplayName, " \u00B7 \u626B\u7801\u767B\u5F55\u6388\u6743 [", accountName || accountId, "]"] })] })] }), _jsxs("div", { className: css.headerActions, children: [_jsxs("button", { type: "button", className: css.externalLinkBtn, onClick: handleOpenExternal, title: "\u5728\u5916\u90E8\u7CFB\u7EDF\u6D4F\u89C8\u5668\u4E2D\u6253\u5F00\u6B64\u767B\u5F55\u9875\u9762", children: [_jsx(ExternalLink, { className: "size-3.5" }), _jsx("span", { children: "\u5728\u5916\u90E8\u6D4F\u89C8\u5668\u6253\u5F00" })] }), _jsx("button", { type: "button", className: css.closeBtn, onClick: handleClose, title: "\u5173\u95ED\u5185\u7F6E\u767B\u5F55\u7A97\u53E3 (Esc)", children: _jsx(X, { className: "size-4" }) })] })] }), _jsxs("div", { className: css.headerSub, children: [_jsxs("div", { className: css.partitionBadge, children: [_jsx(ShieldCheck, { className: "size-3.5" }), _jsxs("span", { children: ["\u591A\u5F00\u9694\u79BB\u4E13\u5C5E\u5206\u533A: ", partitionKey] })] }), _jsxs("div", { className: css.urlText, children: [_jsx(Globe, { className: "size-3.5 shrink-0" }), _jsx("span", { title: currentUrl || loginUrl, children: currentUrl || loginUrl })] })] })] }), _jsxs("div", { className: css.webviewWrapper, children: [_jsx("webview", { ref: webviewRef, src: loginUrl, partition: partitionKey, useragent: DEFAULT_DESKTOP_CHROME_UA, allowpopups: "", ...{ nodeintegrationinsubframes: "true" }, className: css.webviewTag }), loginSucceeded && (_jsxs("div", { className: css.successOverlay, children: [_jsx(CheckCircle2, { className: "size-16 text-emerald-500" }), _jsx("h3", { className: css.successTitle, children: "\u767B\u5F55\u6388\u6743\u6210\u529F\uFF01" }), _jsx("p", { className: css.successSubtitle, children: "\u5DF2\u6210\u529F\u6293\u53D6\u6700\u65B0\u4F1A\u8BDD\u51ED\u636E\u5E76\u540C\u6B65\u81F3\u4E13\u5C5E\u9694\u79BB\u5B58\u50A8\uFF0C\u7A97\u53E3\u5373\u5C06\u81EA\u52A8\u5173\u95ED..." })] }))] }), _jsxs("div", { className: css.footer, children: [_jsxs("div", { className: css.statusContainer, children: [_jsx(QrCode, { className: `size-4 ${css.statusIcon}` }), _jsx("span", { className: css.statusMessage, children: statusText })] }), _jsxs("div", { className: css.footerActions, children: [_jsxs("button", { type: "button", className: css.syncBtn, onClick: handleManualSync, disabled: savingSession || loginSucceeded, children: [_jsx(RefreshCw, { className: `size-3.5 ${savingSession ? "animate-spin" : ""}` }), _jsx("span", { children: savingSession ? "同步核验中..." : "我已完成扫码，手动同步凭据" })] }), _jsx("button", { type: "button", className: css.cancelBtn, onClick: handleClose, children: "\u5173\u95ED" })] })] })] }) }), document.body);
}
//# sourceMappingURL=SocialPublisherLoginModal.js.map