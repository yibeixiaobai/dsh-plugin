import type { WechatDraftCard } from "./SocialPublisherTypes.js";
interface DraftCardProps {
    card: WechatDraftCard;
    isDeleting: boolean;
    onDelete: (draftId: string, appmsgid: string, articleType?: "news" | "newspic") => void;
    hasDuplicate?: boolean;
    onOpenDuplicateClean?: () => void;
}
export declare function SocialPublisherDraftCard({ card, isDeleting, onDelete, hasDuplicate, onOpenDuplicateClean, }: DraftCardProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=SocialPublisherDraftCard.d.ts.map