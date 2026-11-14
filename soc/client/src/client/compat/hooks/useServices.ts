export type ModelSelectionView = any
export type IServiceAccessor = any

export function useOptionalServices(): any {
  return {
    socialPublisher: {
      getAccounts: async () => [],
      getDrafts: async () => [],
      getScheduled: async () => [],
      getHistory: async () => [],
    },
    socialPublisherService: null,
  }
}

export function useServices(): any {
  return useOptionalServices()
}
