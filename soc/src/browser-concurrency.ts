// 社媒多账号浏览器并发限流与跨进程文件排他锁
export {
  computeAdaptiveMaxBrowsers,
  GLOBAL_MAX_ACTIVE_BROWSERS,
  acquireBrowserSlot,
  acquireProfileDirMutex,
  acquireProfileLock,
  releaseProfileLock,
  resetConcurrencyPoolForTests,
} from './browser/concurrency.ts'
export type { ProfileLockHandle, AcquireBrowserSlotOptions } from './browser/types.ts'
