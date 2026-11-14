interface AccountLoginCardProps {
    currentAccount: any;
    selectedAccountId: string;
    isGzh: boolean;
    needsBrowserSession: boolean;
    loginStatusMap?: Record<string, boolean | null>;
    checkingLogin?: string | null;
    loginingAccountId?: string | null;
    checkLoginStatus?: (platform: string, accountId: string) => void;
    triggerLogin?: (platform: string, accountId: string) => void;
    fetchConfig?: () => void;
}
export declare function SocialPublisherAccountLoginCard({ currentAccount, selectedAccountId, isGzh, needsBrowserSession, loginStatusMap, checkingLogin, loginingAccountId: _loginingAccountId, checkLoginStatus, triggerLogin: _triggerLogin, fetchConfig, }: AccountLoginCardProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=SocialPublisherAccountLoginCard.d.ts.map