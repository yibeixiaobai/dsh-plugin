export function useOptionalServices() {
    return {
        socialPublisher: {
            getAccounts: async () => [],
            getDrafts: async () => [],
            getScheduled: async () => [],
            getHistory: async () => [],
        },
        socialPublisherService: null,
    };
}
export function useServices() {
    return useOptionalServices();
}
//# sourceMappingURL=useServices.js.map