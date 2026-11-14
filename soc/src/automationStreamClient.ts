import http from "node:http";
import type { Page, CDPSession } from "puppeteer-core";
import { dispatchCdpInput } from "./browser/screencast.ts";
import { automationStreamHub, type AutomationSessionPayload, type AutomationStepPayload } from "./automationStreamHub.ts";

const DEFAULT_SERVER_URL = "http://127.0.0.1:3088";

async function postHttpAsync(endpoint: string, data: any): Promise<void> {
  try {
    await fetch(`${DEFAULT_SERVER_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    // 忽略远端未启动或网络波动
  }
}

/** 跨进程输入事件监听桥（穿透独立 MCP 进程与嵌入式 HTTP 服务） */
let bridgeReq: http.ClientRequest | null = null;
let bridgeRefCount = 0;

function ensureCrossProcessInputBridge(): void {
  bridgeRefCount++;
  if (bridgeReq) return;

  try {
    const req = http.get(`${DEFAULT_SERVER_URL}/api/gzh-publisher/automation/stream`, (res) => {
      let buffer = "";
      res.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const lines = part.split("\n");
          let eventType = "message";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            else if (line.startsWith("data: ")) dataStr = line.slice(6).trim();
          }
          if (!dataStr) continue;
          try {
            const data = JSON.parse(dataStr);
            if (eventType === "input") {
              automationStreamHub.dispatchInput(data);
            } else if (eventType === "takeover") {
              automationStreamHub.setTakeover(data.sessionId, data.enabled, data.reason, data.action);
            }
          } catch {}
        }
      });
      res.on("end", () => {
        bridgeReq = null;
        if (bridgeRefCount > 0) setTimeout(ensureCrossProcessInputBridge, 1000);
      });
    });

    req.on("error", () => {
      bridgeReq = null;
      if (bridgeRefCount > 0) setTimeout(ensureCrossProcessInputBridge, 1500);
    });

    bridgeReq = req;
  } catch {
    bridgeReq = null;
  }
}

function releaseCrossProcessInputBridge(): void {
  bridgeRefCount = Math.max(0, bridgeRefCount - 1);
  if (bridgeRefCount === 0 && bridgeReq) {
    try {
      bridgeReq.destroy();
    } catch {}
    bridgeReq = null;
  }
}

/** 启动自动化监控会话 */
export function startAutomationStreamSession(session: AutomationSessionPayload): void {
  automationStreamHub.setSession(session);
  void postHttpAsync("/api/gzh-publisher/automation/session", session);
}

/** 推进步骤状态 */
export function updateAutomationStreamStep(
  sessionId: string,
  stepId: string,
  status: AutomationStepPayload["status"],
  detail?: string,
  currentUrl?: string,
): void {
  automationStreamHub.updateStep(sessionId, stepId, status, detail, currentUrl);
  void postHttpAsync("/api/gzh-publisher/automation/step", {
    sessionId,
    stepId,
    status,
    detail,
    currentUrl,
  });
}

/** 更新当前 URL */
export function updateAutomationStreamUrl(sessionId: string, url: string): void {
  automationStreamHub.updateUrl(sessionId, url);
  void postHttpAsync("/api/gzh-publisher/automation/url", { sessionId, url });
}

/** 结束会话 */
export function completeAutomationStreamSession(sessionId: string): void {
  automationStreamHub.endSession(sessionId, true);
  void postHttpAsync("/api/gzh-publisher/automation/complete", { sessionId, success: true });
}

/** 标记会话失败 */
export function failAutomationStreamSession(sessionId: string, error?: string): void {
  automationStreamHub.endSession(sessionId, false, error);
  void postHttpAsync("/api/gzh-publisher/automation/complete", { sessionId, success: false, error });
}

/** 活跃 CDP 会话注册表，支持双向输入穿透 */
const activeCdpSessions = new Map<string, CDPSession>();

/** 订阅分发来自前端的真实鼠标操作与拖拽（委托至 @deepseek-ai/dsh-browser-service） */
automationStreamHub.onInput(async (event) => {
  const cdp = activeCdpSessions.get(event.sessionId);
  if (!cdp) return;
  try {
    await dispatchCdpInput(cdp, event);
  } catch {}
});

/** 设置或广播会话的人工接管状态 */
export function setAutomationStreamTakeover(
  sessionId: string,
  enabled: boolean,
  reason?: string,
  action?: "resume" | "pause",
): void {
  automationStreamHub.setTakeover(sessionId, enabled, reason, action);
  void postHttpAsync("/api/gzh-publisher/automation/takeover", { sessionId, enabled, reason, action });
}

/**
 * 挂接 Puppeteer Page CDP Screencast 推流
 */
export async function attachPageScreencast(
  page: Page,
  sessionId: string,
  options: { maxFps?: number; quality?: number } = {},
): Promise<() => Promise<void>> {
  let cdpSession: CDPSession | null = null;
  let isDetached = false;

  try {
    cdpSession = await page.createCDPSession();
    activeCdpSessions.set(sessionId, cdpSession);
    ensureCrossProcessInputBridge();
  } catch {
    return async () => {};
  }

  const { maxFps = 15, quality = 60 } = options;

  cdpSession.on("Page.screencastFrame", async (event: any) => {
    if (isDetached || !cdpSession) return;
    try {
      await cdpSession.send("Page.screencastFrameAck", {
        sessionId: event.sessionId,
      });
    } catch {}

    const frame = {
      sessionId,
      data: event.data,
      metadata: event.metadata,
      timestamp: Date.now(),
    };

    automationStreamHub.pushFrame(frame);
    void postHttpAsync("/api/gzh-publisher/automation/frame", frame);
  });

  page.on("framenavigated", (frame) => {
    if (isDetached) return;
    try {
      if (frame === page.mainFrame()) {
        const url = frame.url();
        updateAutomationStreamUrl(sessionId, url);
      }
    } catch {}
  });

  try {
    await cdpSession.send("Page.startScreencast", {
      format: "jpeg",
      quality,
      maxWidth: 1280,
      maxHeight: 800,
      everyNthFrame: Math.max(1, Math.round(60 / maxFps)),
    });
  } catch {}

  return async () => {
    if (isDetached) return;
    isDetached = true;
    activeCdpSessions.delete(sessionId);
    releaseCrossProcessInputBridge();
    if (cdpSession) {
      try {
        await cdpSession.send("Page.stopScreencast").catch(() => {});
        await cdpSession.detach().catch(() => {});
      } catch {}
      cdpSession = null;
    }
  };
}

/** 广播跨进程登录态自愈同步事件，通知前端设置卡片即时刷新为已登录 */
export function broadcastLoginSynced(payload: { platform: string; accountId: string; userName?: string }): void {
  automationStreamHub.syncLogin(payload);
  void postHttpAsync("/api/gzh-publisher/automation/login-synced", payload);
}
