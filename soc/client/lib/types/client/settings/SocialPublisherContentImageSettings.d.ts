interface ImageSettingsProps {
    currentAccount: any;
    updateCurrentAccount: (patch: any) => void;
    isZhihu: boolean;
    isXhs: boolean;
    isBaijiahao: boolean;
    isToutiao: boolean;
}
/** 社媒正文与封面配图设置子面板：支持自适应与自定义配比，多平台规格适配 */
export declare function SocialPublisherContentImageSettings({ currentAccount, updateCurrentAccount, isZhihu, isXhs, isBaijiahao, isToutiao, }: ImageSettingsProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=SocialPublisherContentImageSettings.d.ts.map