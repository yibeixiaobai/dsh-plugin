export function useModelProviders(_options?: any): any {
  return {
    modelProviders: [],
    providers: [],
    models: [],
    loading: false,
    selectedProvider: null,
    selectedModel: null,
  }
}
