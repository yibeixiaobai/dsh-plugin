interface AccountTabProps {
    config: any;
    setConfig: React.Dispatch<React.SetStateAction<any>>;
    selectedAccountId: string;
    setSelectedAccountId: (id: string) => void;
    revealSecrets: Record<string, boolean>;
    setRevealSecrets: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    triggerLogin: (platform: string, accountId: string) => void;
    loginStatusMap?: Record<string, boolean | null>;
    checkingLogin?: string | null;
    checkLoginStatus?: (platform: string, accountId: string) => void;
    loginingAccountId?: string | null;
    fetchConfig?: () => void;
}
export declare function SocialPublisherAccountTab({ config, setConfig, selectedAccountId, setSelectedAccountId, revealSecrets, setRevealSecrets, triggerLogin, loginStatusMap, checkingLogin, checkLoginStatus, loginingAccountId, fetchConfig, }: AccountTabProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=SocialPublisherAccountTab.d.ts.map