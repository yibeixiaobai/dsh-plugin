interface BackupTabProps {
    config: any;
    onConfigSaved: (newConfig: any) => void;
    setStatusMessage: (msg: {
        type: "success" | "error";
        text: string;
    } | null) => void;
}
export declare function SocialPublisherBackupTab({ config: _config, onConfigSaved, setStatusMessage, }: BackupTabProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=SocialPublisherBackupTab.d.ts.map