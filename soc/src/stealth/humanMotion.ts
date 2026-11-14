import type { ElementHandle, Page } from 'puppeteer-core'
import type { HumanMotionOptions, HumanPasteOptions, HumanTypeOptions } from './types.ts'

export interface Point {
  x: number
  y: number
}

function cubicBezierPoint(t: number, p0: Point, p1: Point, p2: Point, p3: Point): Point {
  const u = 1 - t
  const tt = t * t
  const uu = u * u
  const uuu = uu * u
  const ttt = tt * t

  const x = uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x
  const y = uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y

  return { x, y }
}

export function generateBezierPath(start: Point, end: Point, options: HumanMotionOptions = {}): Point[] {
  const { enableJitter = true, jitterIntensity = 1.2 } = options
  const distance = Math.hypot(end.x - start.x, end.y - start.y)

  if (distance < 2) {
    return [start, end]
  }

  const steps = Math.min(50, Math.max(12, Math.floor(Math.sqrt(distance) * 2.0)))

  const deltaX = end.x - start.x
  const deltaY = end.y - start.y
  const deviation1 = (Math.random() - 0.5) * distance * 0.22
  const deviation2 = (Math.random() - 0.5) * distance * 0.22

  const cp1: Point = {
    x: start.x + deltaX * 0.25 + deviation1,
    y: start.y + deltaY * 0.25 + deviation1,
  }
  const cp2: Point = {
    x: start.x + deltaX * 0.75 + deviation2,
    y: start.y + deltaY * 0.75 + deviation2,
  }

  const path: Point[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const easedT = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t

    const pt = cubicBezierPoint(easedT, start, cp1, cp2, end)

    if (enableJitter && i > 0 && i < steps) {
      const envelope = Math.sin(Math.PI * t)
      pt.x += (Math.random() - 0.5) * jitterIntensity * envelope
      pt.y += (Math.random() - 0.5) * jitterIntensity * envelope
    }

    path.push({
      x: Math.round(pt.x),
      y: Math.round(pt.y),
    })
  }

  return path
}

const pageMouseCoords = new WeakMap<Page, Point>()

export async function humanMouseMove(
  page: Page,
  targetX: number,
  targetY: number,
  options?: HumanMotionOptions,
): Promise<void> {
  const current = pageMouseCoords.get(page) || { x: 0, y: 0 }
  const target: Point = { x: targetX, y: targetY }
  const path = generateBezierPath(current, target, options)

  for (const pt of path) {
    await page.mouse.move(pt.x, pt.y)
    const delay = Math.floor(Math.random() * 5) + 3
    await new Promise(r => setTimeout(r, delay))
  }

  pageMouseCoords.set(page, target)
}

export async function humanClick(
  page: Page,
  target: ElementHandle<any> | string,
  options?: HumanMotionOptions,
): Promise<void> {
  let element: ElementHandle<Element> | null = null
  if (typeof target === 'string') {
    element = await page.waitForSelector(target, { visible: true, timeout: 10000 })
  } else {
    element = target
  }
  if (!element) throw new Error('humanClick: 目标元素不存在或不可见')

  const box = await element.boundingBox()
  if (!box) {
    await element.click()
    return
  }

  const marginRatioX = 0.25 + Math.random() * 0.5
  const marginRatioY = 0.25 + Math.random() * 0.5
  const destX = box.x + box.width * marginRatioX
  const destY = box.y + box.height * marginRatioY

  await humanMouseMove(page, destX, destY, options)

  const sightConfirmDelay = Math.floor(Math.random() * 70) + 50
  await new Promise(r => setTimeout(r, sightConfirmDelay))

  await page.mouse.down({ button: 'left' })
  const pressDuration = Math.floor(Math.random() * 50) + 40
  await new Promise(r => setTimeout(r, pressDuration))
  await page.mouse.up({ button: 'left' })
}

export const executeHumanClick = humanClick

function randomGaussian(mean: number, stdDev: number): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
  return Math.max(15, Math.round(num * stdDev + mean))
}

export async function humanType(
  page: Page,
  text: string,
  options: HumanTypeOptions = {},
): Promise<void> {
  const {
    meanDelay = 65,
    stdDev = 20,
    punctuationPause = 250,
    paragraphPause = 400,
    simulateTypo = true,
  } = options

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (simulateTypo && Math.random() < 0.015 && /[a-zA-Z]/.test(char)) {
      const typoChar = String.fromCharCode(char.charCodeAt(0) + (Math.random() > 0.5 ? 1 : -1))
      await page.keyboard.type(typoChar, { delay: 0 })
      await new Promise(r => setTimeout(r, Math.floor(Math.random() * 80) + 100))
      await page.keyboard.press('Backspace')
      await new Promise(r => setTimeout(r, Math.floor(Math.random() * 60) + 60))
    }

    await page.keyboard.type(char, { delay: 0 })

    let delay = randomGaussian(meanDelay, stdDev)

    if (/[，。！？；,.!?;]/.test(char)) {
      delay += punctuationPause + Math.floor(Math.random() * 100)
    } else if (char === '\n') {
      delay += paragraphPause + Math.floor(Math.random() * 150)
    }

    await new Promise(r => setTimeout(r, delay))
  }
}

export const executeHumanType = humanType

export async function humanScroll(page: Page, deltaY: number, steps = 6): Promise<void> {
  const perStep = deltaY / steps
  for (let i = 0; i < steps; i++) {
    const factor = Math.sin(((i + 1) / steps) * (Math.PI / 2))
    const stepDelta = perStep * factor * (steps / 4)
    await page.mouse.wheel({ deltaY: stepDelta })
    await new Promise(r => setTimeout(r, Math.floor(Math.random() * 15) + 15))
  }
}

export async function executeHumanPaste(
  page: Page,
  target: ElementHandle<any> | string,
  text: string,
  options: HumanPasteOptions = {},
): Promise<void> {
  const {
    dwellBeforePasteMs = 500,
    reviewScrollSteps = 4,
    pauseAfterPasteMs = 1000,
  } = options

  await humanClick(page, target)
  await new Promise(r => setTimeout(r, dwellBeforePasteMs + Math.floor(Math.random() * 200)))

  await page.evaluate((content: string) => {
    const active = document.activeElement as HTMLElement
    if (!active) return

    try {
      const dt = new DataTransfer()
      dt.setData('text/plain', content)
      const pasteEvt = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dt,
      })
      active.dispatchEvent(pasteEvt)
    } catch {}
  }, text)

  const hasTextNow = await page.evaluate(() => {
    const active = document.activeElement
    return Boolean(active && ((active as any).value || active.textContent))
  })

  if (!hasTextNow) {
    await page.keyboard.down('Control')
    await page.keyboard.press('KeyV')
    await page.keyboard.up('Control')
  }

  await humanScroll(page, 150, reviewScrollSteps)
  await new Promise(r => setTimeout(r, Math.floor(pauseAfterPasteMs * 0.4)))
  await humanScroll(page, -150, reviewScrollSteps)
  await new Promise(r => setTimeout(r, pauseAfterPasteMs))
}

export async function executeCognitiveDwell(
  page: Page,
  minMs = 800,
  maxMs = 2000,
): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
  const current = pageMouseCoords.get(page) || { x: 500, y: 300 }
  const microTarget: Point = {
    x: Math.max(10, current.x + (Math.random() - 0.5) * 40),
    y: Math.max(10, current.y + (Math.random() - 0.5) * 40),
  }
  await page.mouse.move(microTarget.x, microTarget.y)
  pageMouseCoords.set(page, microTarget)
  await new Promise(r => setTimeout(r, ms))
}

export async function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
  await new Promise(r => setTimeout(r, ms))
}
