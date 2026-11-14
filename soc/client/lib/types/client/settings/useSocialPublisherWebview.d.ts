interface UseSocialPublisherWebviewOptions {
    open: boolean;
    platform: string;
    onCheckLoginState: (url: string) => void;
}
/**
 * 社媒发布内置浏览器事件绑定、Electron 防检测抹除与微信扫码直达加速 Hook
 */
export declare function useSocialPublisherWebview({ open, platform, onCheckLoginState, }: UseSocialPublisherWebviewOptions): {
    webviewRef: import("react").MutableRefObject<any>;
    loading: boolean;
    canGoBack: boolean;
    canGoForward: boolean;
    currentUrl: string;
    setCurrentUrl: import("react").Dispatch<import("react").SetStateAction<string>>;
};
export {};
//# sourceMappingURL=useSocialPublisherWebview.d.ts.map