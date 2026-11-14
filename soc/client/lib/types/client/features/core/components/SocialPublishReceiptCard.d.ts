export interface PublishReceiptData {
    platform: string;
    platformName?: string;
    accountName: string;
    accountId: string;
    title: string;
    publishAction: 'draft' | 'publish_now' | 'schedule';
    mediaId?: string;
    draftUrl?: string;
    scheduledTime?: string;
    publishedAt?: string;
    durationSeconds?: number;
    traceId?: string;
    failureSnapshotDir?: string;
    screenshotUrl?: string;
}
export interface SocialPublishReceiptCardProps {
    receipt: PublishReceiptData;
    className?: string;
}
export declare function SocialPublishReceiptCard({ receipt, className }: SocialPublishReceiptCardProps): import("react").JSX.Element;
//# sourceMappingURL=SocialPublishReceiptCard.d.ts.map