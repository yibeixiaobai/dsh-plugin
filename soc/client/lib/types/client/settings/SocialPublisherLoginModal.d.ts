import { getSocialPlatformLoginUrl } from "../compat/types.js";
interface SocialPublisherLoginModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    platform: string;
    accountId: string;
    accountName?: string;
    onLoginSuccess: () => void;
}
export { getSocialPlatformLoginUrl as getPlatformLoginUrl };
export declare function SocialPublisherLoginModal({ open, onOpenChange, platform, accountId, accountName, onLoginSuccess, }: SocialPublisherLoginModalProps): import("react").ReactPortal;
//# sourceMappingURL=SocialPublisherLoginModal.d.ts.map