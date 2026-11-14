export interface ProviderSettingsFormProvider {
    readonly id?: string;
    readonly providerId?: string;
    readonly name?: string;
    readonly enabled?: boolean;
    readonly models?: readonly any[];
    readonly config?: any;
    readonly personalConfig?: any;
}
export declare function getProviderFormLabel(provider: string): string;
export declare function getProviderFormApiKey(target: any): string;
//# sourceMappingURL=providerSettingsFormTypes.d.ts.map