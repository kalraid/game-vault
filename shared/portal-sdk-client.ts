import type { JsonValue, PortalSdkMethod, SdkEvent, SdkRequest, SdkResponse } from "./sdk.js";

export interface PortalSdkClientOptions {
  gameId: string;
  target: Window;
  origin?: string;
  timeoutMs?: number;
  onRealtimeEvent?: (event: SdkEvent) => void;
}

export interface PortalSdkClient {
  request(method: PortalSdkMethod, payload?: JsonValue): Promise<JsonValue>;
  authGetToken(): Promise<JsonValue>;
  saveLoad(slot: number): Promise<JsonValue>;
  saveStore(slot: number, data: JsonValue): Promise<JsonValue>;
  accountGet(): Promise<JsonValue>;
  accountSet(key: string, value: JsonValue, schemaVersion?: number): Promise<JsonValue>;
  subscribe(event: string): Promise<JsonValue>;
  emit(event: string, payload: JsonValue): Promise<JsonValue>;
  dispose(): void;
}

export function createPortalSdkClient(options: PortalSdkClientOptions): PortalSdkClient {
  const origin = options.origin ?? "*";
  const timeoutMs = options.timeoutMs ?? 5_000;
  const pending = new Map<string, {
    resolve: (value: JsonValue) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();

  const onMessage = (event: MessageEvent) => {
    const data = event.data as SdkResponse | SdkEvent | undefined;
    if (!data || typeof data !== "object") return;

    if (data.type === "gamevault:sdk-response") {
      const record = pending.get(data.requestId);
      if (!record) return;
      pending.delete(data.requestId);
      clearTimeout(record.timer);
      if (data.ok) {
        record.resolve(data.result ?? null);
      } else {
        record.reject(new Error(data.error || "SDK request failed"));
      }
      return;
    }

    if (data.type === "gamevault:realtime-event") {
      options.onRealtimeEvent?.(data);
    }
  };

  window.addEventListener("message", onMessage);

  function request(method: PortalSdkMethod, payload?: JsonValue): Promise<JsonValue> {
    const requestId = crypto.randomUUID();
    const requestMessage: SdkRequest = {
      type: "gamevault:sdk-request",
      requestId,
      gameId: options.gameId,
      method,
      payload,
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error("SDK request timed out"));
      }, timeoutMs);

      pending.set(requestId, { resolve, reject, timer });
      options.target.postMessage(requestMessage, origin);
    });
  }

  return {
    request,
    authGetToken: () => request("auth.getToken"),
    saveLoad: (slot) => request("save.load", { slot }),
    saveStore: (slot, data) =>
      request("save.store", {
        slot,
        schema_version: 1,
        data,
      }),
    accountGet: () => request("account.get"),
    accountSet: (key, value, schemaVersion = 1) =>
      request("account.set", {
        key,
        schema_version: schemaVersion,
        value,
      }),
    subscribe: (event) => request("realtime.subscribe", { event }),
    emit: (event, payload) => request("realtime.emit", { event, payload }),
    dispose: () => {
      window.removeEventListener("message", onMessage);
      for (const record of pending.values()) {
        clearTimeout(record.timer);
        record.reject(new Error("SDK client disposed"));
      }
      pending.clear();
    },
  };
}
