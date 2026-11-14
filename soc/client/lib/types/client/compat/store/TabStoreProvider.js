export function useTabStore(selector) {
    const store = {
        activeTab: 'main',
        setActiveTab: () => { },
        openSettingsTab: () => { },
        tabs: [],
    };
    return selector ? selector(store) : store;
}
//# sourceMappingURL=TabStoreProvider.js.map