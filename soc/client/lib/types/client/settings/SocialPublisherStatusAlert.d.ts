interface SocialPublisherStatusAlertProps {
    statusMessage: {
        type: "success" | "error";
        text: string;
    } | null;
    onClose: () => void;
}
export declare function SocialPublisherStatusAlert({ statusMessage, onClose, }: SocialPublisherStatusAlertProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=SocialPublisherStatusAlert.d.ts.map