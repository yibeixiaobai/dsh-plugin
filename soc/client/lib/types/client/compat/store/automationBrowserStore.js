const store = {
    sessions: [],
    activeSession: null,
    instances: {},
    connect: async () => { },
    disconnect: async () => { },
};
export function useAutomationBrowserStore(selector) {
    return selector ? selector(store) : store;
}
useAutomationBrowserStore.getState = () => store;
useAutomationBrowserStore.setState = (_partial) => { };
//# sourceMappingURL=automationBrowserStore.js.map