import React from 'react';
import type { SocialPlatformKey } from '../utils/socialPlatformsMeta.js';
export interface LoginModalState {
    open: boolean;
    platform: string;
    accountId: string;
    accountName: string;
}
export interface SocialPublisherComposerModalsProps {
    loginModalState: LoginModalState;
    setLoginModalState: React.Dispatch<React.SetStateAction<LoginModalState>>;
    checkSingleAccount: (platform: string, accountId: string) => void;
    preflightGateOpen: boolean;
    setPreflightGateOpen: (open: boolean) => void;
    unreadyAccountsList: any[];
    doSubmit: (platforms?: SocialPlatformKey[], notes?: string, selectAll?: boolean, accounts?: any[]) => void;
    effectivePlatforms: SocialPlatformKey[];
    notes: string;
    selectAllAccounts: boolean;
    effectiveAccounts: any[];
    setErrorMessage: (msg: string | null) => void;
    featureGateOpen: boolean;
    setFeatureGateOpen: (open: boolean) => void;
}
export declare function SocialPublisherComposerModals({ loginModalState, setLoginModalState, checkSingleAccount, preflightGateOpen, setPreflightGateOpen, unreadyAccountsList, doSubmit, effectivePlatforms: _effectivePlatforms, notes, selectAllAccounts: _selectAllAccounts, effectiveAccounts, setErrorMessage, featureGateOpen, setFeatureGateOpen, }: SocialPublisherComposerModalsProps): React.JSX.Element;
//# sourceMappingURL=SocialPublisherComposerModals.d.ts.map