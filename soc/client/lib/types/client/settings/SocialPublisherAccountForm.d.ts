interface AccountFormProps {
    currentAccount: any;
    selectedAccountId: string;
    updateCurrentAccount: (patch: any) => void;
    revealSecrets: Record<string, boolean>;
    setRevealSecrets: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}
export declare function SocialPublisherAccountForm({ currentAccount, selectedAccountId, updateCurrentAccount, revealSecrets, setRevealSecrets, }: AccountFormProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=SocialPublisherAccountForm.d.ts.map