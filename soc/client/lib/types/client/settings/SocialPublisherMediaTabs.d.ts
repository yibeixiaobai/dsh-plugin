import type { ProviderSettingsFormProvider } from "../compat/lib/providerSettingsFormTypes.js";
interface MediaTabsProps {
    config: any;
    setConfig: React.Dispatch<React.SetStateAction<any>>;
    activeTab?: "image_providers";
    testingProvider: string | null;
    testProvider: (provider: any) => void;
    modelProviders?: readonly ProviderSettingsFormProvider[];
}
export declare function SocialPublisherMediaTabs({ config, setConfig, activeTab, testingProvider, testProvider, modelProviders, }: MediaTabsProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=SocialPublisherMediaTabs.d.ts.map