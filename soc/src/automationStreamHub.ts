import type { ServerResponse } from "node:http";

export interface AutomationStepPayload {
  id: string;
  label: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt?: number;
  completedAt?: number;
  detail?: string;
}

export interface AutomationSessionPayload {
  sessionId: string;
  /** 关联的发起该自动化操作的宿主聊天会话 ID（主任务 taskId），用于侧边栏多会话精准隔离 */
  ownerTaskId?: string;
  module: "social-publisher" | "geo" | "brand-geo" | "browser-use";
  platform: string;
  platformName?: string;
  accountId?: string;
  title: string;
  currentUrl?: string;
  status: "starting" | "running" | "completed" | "failed";
  currentStepId?: string;
  steps: AutomationStepPayload[];
  startedAt: number;
  completedAt?: number;
  error?: string;
  isTakeoverActive?: boolean;
  takeoverReason?: string;
  /** 是否需要主动弹发展开侧边栏（社媒发布或人工扫码时为 true，桌面端自动滑出实时操作画面） */
  autoReveal?: boolean;
}

export interface AutomationFramePayload {
  sessionId: string;
  data: string; // base64 JPEG
  metadata?: any;
  timestamp: number;
}

export interface AutomationInputPayload {
  sessionId: string;
  type: "mousePressed" | "mouseReleased" | "mouseMoved" | "click" | "wheel" | "keyDown" | "keyUp";
  x?: number;
  y?: number;
  button?: "left" | "middle" | "right" | "none";
  clickCount?: number;
  deltaX?: number;
  deltaY?: number;
  key?: string;
  text?: string;
}

export interface AutomationTakeoverPayload {
  sessionId: string;
  enabled: boolean;
  action?: "resume" | "pause";
  reason?: string;
}

class AutomationStreamHub {
  private sessions = new Map<string, AutomationSessionPayload>();
  private latestFrames = new Map<string, AutomationFramePayload>();
  private activeSessionId: string | null = null;
  private sseClients = new Set<ServerResponse>();
  private inputListeners = new Set<(input: AutomationInputPayload) => void>();
  private takeoverListeners = new Set<(takeover: AutomationTakeoverPayload) => void>();

  /** 注册新的 SSE 客户端连接 */
  public addSseClient(res: ServerResponse): () => void {
    this.sseClients.add(res);
    // 首次连入即刻推送已有全部多会话与对应最新帧，避免新任务上线冲垮旧会话
    for (const session of this.sessions.values()) {
      try {
        res.write(`event: session\ndata: ${JSON.stringify(session)}\n\n`);
      } catch {}
    }
    for (const frame of this.latestFrames.values()) {
      try {
        res.write(`event: frame\ndata: ${JSON.stringify(frame)}\n\n`);
      } catch {}
    }

    return () => {
      this.sseClients.delete(res);
    };
  }

  /** 获取当前活跃会话与多会话完整快照 */
  public getSnapshot(): {
    session: AutomationSessionPayload | null;
    latestFrame: AutomationFramePayload | null;
    sessions: AutomationSessionPayload[];
    frames: AutomationFramePayload[];
  } {
    const active = this.activeSessionId ? this.sessions.get(this.activeSessionId) || null : null;
    const latestF = this.activeSessionId ? this.latestFrames.get(this.activeSessionId) || null : null;
    return {
      session: active,
      latestFrame: latestF,
      sessions: Array.from(this.sessions.values()),
      frames: Array.from(this.latestFrames.values()),
    };
  }

  /** 启动或更新特定任务会话 */
  public setSession(session: AutomationSessionPayload): void {
    this.sessions.set(session.sessionId, session);
    this.activeSessionId = session.sessionId;
    this.pruneOldSessionsIfNecessary();
    this.broadcast("session", session);
  }

  /** 推进指定任务的步骤状态 */
  public updateStep(
    sessionId: string,
    stepId: string,
    status: AutomationStepPayload["status"],
    detail?: string,
    currentUrl?: string,
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (currentUrl) {
      session.currentUrl = currentUrl;
    }

    for (const step of session.steps) {
      if (step.id === stepId) {
        step.status = status;
        if (detail) step.detail = detail;
        if (status === "running" && !step.startedAt) step.startedAt = Date.now();
        if (status === "completed" || status === "failed") step.completedAt = Date.now();
        session.currentStepId = stepId;
      }
    }

    this.broadcast("session", session);
    this.broadcast("step", { sessionId, stepId, status, detail, currentUrl });
  }

  /** 更新当前访问 URL */
  public updateUrl(sessionId: string, url: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.currentUrl = url;
    this.broadcast("session", session);
  }

  /** 推送画面帧（精准关联对应 sessionId，绝不丢弃任何任务的推流） */
  public pushFrame(frame: AutomationFramePayload): void {
    if (!frame.sessionId) return;
    this.latestFrames.set(frame.sessionId, frame);
    this.broadcast("frame", frame);
  }

  /** 结束指定会话 */
  public endSession(sessionId: string, success: boolean, error?: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = success ? "completed" : "failed";
    session.completedAt = Date.now();
    if (error) session.error = error;

    for (const step of session.steps) {
      if (step.status === "running") {
        step.status = success ? "completed" : "failed";
        step.completedAt = Date.now();
      }
    }

    this.broadcast("session", session);
  }

  /** 订阅输入事件（供 CDP Session 转发底层输入） */
  public onInput(fn: (input: AutomationInputPayload) => void): () => void {
    this.inputListeners.add(fn);
    return () => this.inputListeners.delete(fn);
  }

  /** 派发输入事件 */
  public dispatchInput(input: AutomationInputPayload): void {
    this.broadcast("input", input);
    for (const listener of this.inputListeners) {
      try {
        listener(input);
      } catch {}
    }
  }

  /** 订阅人工接管/恢复控制事件 */
  public onTakeover(fn: (takeover: AutomationTakeoverPayload) => void): () => void {
    this.takeoverListeners.add(fn);
    return () => this.takeoverListeners.delete(fn);
  }

  /** 更新或通知人工接管状态 */
  public setTakeover(sessionId: string, enabled: boolean, reason?: string, action?: "resume" | "pause"): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isTakeoverActive = enabled;
      session.takeoverReason = reason;
      this.broadcast("session", session);
    }
    const payload: AutomationTakeoverPayload = { sessionId, enabled, reason, action };
    this.broadcast("takeover", payload);
    for (const listener of this.takeoverListeners) {
      try {
        listener(payload);
      } catch {}
    }
  }

  /** 安全回收超量旧会话，防止长期并发运行内存膨胀 */
  /** 广播账号登录态自愈同步事件 */
  public syncLogin(data: { platform: string; accountId: string; userName?: string; timestamp?: number }): void {
    const payload = {
      ...data,
      timestamp: data.timestamp || Date.now(),
    };
    this.broadcast("login_synced", payload);
  }

  private pruneOldSessionsIfNecessary(): void {
    if (this.sessions.size <= 25) return;
    for (const [id, s] of this.sessions.entries()) {
      if (s.status === "completed" || s.status === "failed") {
        this.sessions.delete(id);
        this.latestFrames.delete(id);
        if (this.sessions.size <= 20) break;
      }
    }
  }

  private broadcast(event: string, data: any): void {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(message);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }
}

export const automationStreamHub = new AutomationStreamHub();
