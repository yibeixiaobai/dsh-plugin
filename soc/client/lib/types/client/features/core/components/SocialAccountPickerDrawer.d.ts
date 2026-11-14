import type { SocialPlatformKey } from '../utils/socialPlatformsMeta.js';
import type { AccountHealthInfo } from '../utils/useSocialAccountsHealth.js';
export interface SocialAccountPickerDrawerProps {
    show: boolean;
    selectedPlatforms: SocialPlatformKey[];
    platformsMeta: Array<{
        key: SocialPlatformKey;
        label: string;
        shortLabel: string;
    }>;
    filteredAccounts: any[];
    effectiveAccounts: any[];
    selectedAccountIds: string[];
    selectAllAccounts: boolean;
    loadingAccounts: boolean;
    accountHealthMap: Record<string, AccountHealthInfo>;
    onSelectAll: () => void;
    onToggleAccount: (id: string) => void;
    onOpenLoginModal?: (account: any) => void;
}
export declare const SocialAccountPickerDrawer: import("react").MemoExoticComponent<({ show, selectedPlatforms, platformsMeta, filteredAccounts, effectiveAccounts, selectedAccountIds, selectAllAccounts, loadingAccounts, accountHealthMap, onSelectAll, onToggleAccount, onOpenLoginModal: _onOpenLoginModal, }: SocialAccountPickerDrawerProps) => import("react").JSX.Element>;
//# sourceMappingURL=SocialAccountPickerDrawer.d.ts.map