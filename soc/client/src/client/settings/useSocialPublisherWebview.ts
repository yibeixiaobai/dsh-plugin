import { useEffect, useRef, useState } from "react";
import {
  injectWechatPermissionsShield,
  ensureWechatQrCodeLogin,
} from "./socialPublisherLoginHelper.js";

interface UseSocialPublisherWebviewOptions {
  open: boolean;
  platform: string;
  onCheckLoginState: (url: string) => void;
}

/**
 * 社媒发布内置浏览器事件绑定、Electron 防检测抹除与微信扫码直达加速 Hook
 */
export function useSocialPublisherWebview({
  open,
  platform,
  onCheckLoginState,
}: UseSocialPublisherWebviewOptions) {
  const webviewRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [currentUrl, setCurrentUrl] = useState("");

  const onCheckLoginStateRef = useRef(onCheckLoginState);
  onCheckLoginStateRef.current = onCheckLoginState;

  const currentUrlRef = useRef(currentUrl);
  currentUrlRef.current = currentUrl;

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview || !open) return;

    const normPlat = platform.toLowerCase();
    const isWechatPlatform = normPlat === "gzh" || normPlat === "wechat";

    let qrStabilized = false;
    const triggerWechatQrAutoSwitch = async () => {
      if (!isWechatPlatform || qrStabilized) return;
      await injectWechatPermissionsShield(webview);
      const res = await ensureWechatQrCodeLogin(webview);
      if (res.hasQrCode) {
        qrStabilized = true;
      }
    };

    const onDidStartLoading = () => {
      setLoading(true);
      if (isWechatPlatform) {
        injectWechatPermissionsShield(webview);
      }
    };
    const onDidStopLoading = () => {
      setLoading(false);
      triggerWechatQrAutoSwitch();
    };
    const onDomReady = () => {
      triggerWechatQrAutoSwitch();
    };
    const onDidNavigate = (e: any) => {
      const targetUrl = e.url || "";
      setCurrentUrl(targetUrl);
      currentUrlRef.current = targetUrl;
      setCanGoBack(Boolean(webview.canGoBack?.()));
      setCanGoForward(Boolean(webview.canGoForward?.()));
      // 中文注释：在页面完成初步加载后抹除 Electron 痕迹与 webdriver 标志
      webview
        .executeJavaScript(`
        try {
          if (window.process) delete window.process;
          const navProto = Object.getPrototypeOf(navigator);
          if (navProto && ('webdriver' in navProto || 'webdriver' in navigator)) {
            Object.defineProperty(navProto, 'webdriver', { get: () => false, configurable: true });
          }
        } catch {}
      `)
        .catch(() => {});
      triggerWechatQrAutoSwitch();
      onCheckLoginStateRef.current(targetUrl);
    };
    const onDidNavigateInPage = (e: any) => {
      const targetUrl = e.url || "";
      setCurrentUrl(targetUrl);
      currentUrlRef.current = targetUrl;
      triggerWechatQrAutoSwitch();
      onCheckLoginStateRef.current(targetUrl);
    };

    const evts: Array<[string, any]> = [
      ["did-start-loading", onDidStartLoading],
      ["did-stop-loading", onDidStopLoading],
      ["dom-ready", onDomReady],
      ["did-navigate", onDidNavigate],
      ["did-navigate-in-page", onDidNavigateInPage],
    ];
    for (const [evt, fn] of evts) webview.addEventListener(evt, fn);

    // [中文修复依据]：针对微信公众平台，启动前置扫码直达守卫。
    // 二维码一旦就绪立即销毁定时器，严禁重复触发 switchFastLogin 导致微信不断生成新二维码跳变
    let fastWatcher: any = null;
    if (isWechatPlatform) {
      let fastWatchCount = 0;
      fastWatcher = setInterval(async () => {
        fastWatchCount += 1;
        if (!webviewRef.current || fastWatchCount > 20 || qrStabilized) {
          clearInterval(fastWatcher);
          return;
        }
        await injectWechatPermissionsShield(webviewRef.current);
        const qrRes = await ensureWechatQrCodeLogin(webviewRef.current);
        if (qrRes.hasQrCode) {
          qrStabilized = true;
          clearInterval(fastWatcher);
        }
      }, 250);
    }

    // 登录态定期轮询：仅负责核验授权结果与重定向，严禁在后台持续调用 ensureWechatQrCodeLogin
    const poller = setInterval(() => {
      try {
        const url = webview.getURL?.() || currentUrlRef.current;
        if (url) onCheckLoginStateRef.current(url);
      } catch {}
    }, 2000);

    return () => {
      if (fastWatcher) clearInterval(fastWatcher);
      clearInterval(poller);
      for (const [evt, fn] of evts) webview.removeEventListener(evt, fn);
    };
  }, [open, platform]);

  return {
    webviewRef,
    loading,
    canGoBack,
    canGoForward,
    currentUrl,
    setCurrentUrl,
  };
}
