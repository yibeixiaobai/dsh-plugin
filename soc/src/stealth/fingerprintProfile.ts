import fs from 'node:fs'
import path from 'node:path'
import type { FingerprintConfig } from './types.ts'

export const DEFAULT_DESKTOP_CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

export const DEFAULT_CHROME_BRANDS = [
  { brand: 'Chromium', version: '130' },
  { brand: 'Google Chrome', version: '130' },
  { brand: 'Not?A_Brand', version: '99' },
]

const COMMON_DESKTOP_GPUS = [
  {
    vendor: 'Google Inc. (NVIDIA)',
    renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  },
  {
    vendor: 'Google Inc. (NVIDIA)',
    renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  },
  {
    vendor: 'Google Inc. (Intel)',
    renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
  },
  {
    vendor: 'Google Inc. (AMD)',
    renderer: 'ANGLE (AMD, AMD Radeon Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
  },
]

export function getOrCreateAccountFingerprint(profileDir: string): FingerprintConfig {
  const fpFile = path.join(profileDir, 'fingerprint_profile.json')
  if (fs.existsSync(fpFile)) {
    try {
      const content = fs.readFileSync(fpFile, 'utf-8')
      const parsed = JSON.parse(content) as FingerprintConfig
      if (parsed && parsed.renderer && parsed.screen && parsed.userAgent) {
        return parsed
      }
    } catch {}
  }

  const gpu = COMMON_DESKTOP_GPUS[Math.floor(Math.random() * COMMON_DESKTOP_GPUS.length)]
  const config: FingerprintConfig = {
    vendor: gpu.vendor,
    renderer: gpu.renderer,
    userAgent: DEFAULT_DESKTOP_CHROME_UA,
    userAgentData: {
      brands: DEFAULT_CHROME_BRANDS,
      mobile: false,
      platform: 'Windows',
      architecture: 'x86',
      bitness: '64',
      model: '',
      platformVersion: '15.0.0',
    },
    screen: {
      width: 1440,
      height: 900,
      availWidth: 1440,
      availHeight: 860,
      colorDepth: 24,
    },
    windowGeometry: {
      outerWidthDiff: 16,
      outerHeightDiff: 79,
      devicePixelRatio: 1.0,
    },
    languages: ['zh-CN', 'zh', 'en'],
    canvasNoiseSeed: Math.floor(Math.random() * 10000) + 1,
    audioNoiseSeed: Math.floor(Math.random() * 10000) + 1,
  }

  try {
    fs.mkdirSync(profileDir, { recursive: true })
    fs.writeFileSync(fpFile, JSON.stringify(config, null, 2), 'utf-8')
  } catch {}

  return config
}
