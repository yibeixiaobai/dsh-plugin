interface SocialAccountItem {
    id: string;
    name?: string;
    platform?: string;
    enabled?: boolean;
}
interface SocialPlanAccountSelectorProps {
    accounts: SocialAccountItem[];
    selectedAccountId: string;
    onSelectAccount: (accountId: string) => void;
    onOpenLoginModal?: (accountId: string) => void;
    scheduledCountsByAccount?: Record<string, number>;
    draftCountsByAccount?: Record<string, number>;
}
export declare function SocialPlanAccountSelector({ accounts, selectedAccountId, onSelectAccount, onOpenLoginModal, scheduledCountsByAccount, draftCountsByAccount, }: SocialPlanAccountSelectorProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=SocialPlanAccountSelector.d.ts.map