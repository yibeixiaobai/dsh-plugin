export const logger = {
  debug: (...args: unknown[]) => console.debug('[SocialPublisher]', ...args),
  info: (...args: unknown[]) => console.info('[SocialPublisher]', ...args),
  warn: (...args: unknown[]) => console.warn('[SocialPublisher]', ...args),
  error: (...args: unknown[]) => console.error('[SocialPublisher]', ...args),
}
