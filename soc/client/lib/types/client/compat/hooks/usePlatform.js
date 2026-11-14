export function useSelectDirectory() {
    return async () => undefined;
}
export function useOptionalPlatform() {
    return {
        isDesktop: false,
        openExternal: (url) => {
            if (typeof window !== 'undefined')
                window.open(url, '_blank');
        },
    };
}
export function usePlatform() {
    return useOptionalPlatform();
}
//# sourceMappingURL=usePlatform.js.map