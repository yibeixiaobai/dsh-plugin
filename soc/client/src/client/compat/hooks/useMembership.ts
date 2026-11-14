export function useMembership(): any {
  return {
    isPro: true,
    tier: 'pro',
    profile: {
      tier: 'pro',
      privileges: {
        socialAccountsLimit: -1,
      },
    },
    features: {
      socialPublisher: true,
      batchPublish: true,
      aiImages: true,
    },
  }
}
