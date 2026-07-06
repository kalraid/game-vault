import { useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { JsonValue, SdkRequest, SdkResponse } from "../../shared/sdk";

type Game = {
  id: string;
  title: string;
  description?: string | null;
  iframeUrl: string;
  launchUrl?: string | null;
};

const apiBase = "";
const realtimeEventName = "gamevault:realtime-event";

type AuthContext = {
  token: string;
  user: {
    id: string;
    email: string;
  };
};

type RealtimeEnvelope = {
  gameId: string;
  event: string;
  payload: JsonValue;
};

type RealtimeTarget = {
  source: WindowProxy;
  origin: string;
};

const realtimeSubscriptions = new Map<
  string,
  Map<string, Map<WindowProxy, RealtimeTarget>>
>();
let realtimeSocket: Socket | null = null;
let realtimeSocketUserId: string | null = null;
let realtimeSocketReady: Promise<Socket> | null = null;

export function App() {
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>("lords-daughter");
  const selectedGame = useMemo(
    () => games.find((game) => game.id === selectedGameId) || games[0],
    [games, selectedGameId]
  );

  useEffect(() => {
    seedAndLoadGames();
  }, []);

  useEffect(() => {
    const onMessage = async (event: MessageEvent<SdkRequest>) => {
      const request = event.data;
      if (!request || request.type !== "gamevault:sdk-request") return;

      const source = event.source;
      if (!source || typeof (source as WindowProxy).postMessage !== "function") return;

      const response = await handleSdkRequest(request, {
        source: source as WindowProxy,
        origin: event.origin || "*"
      });
      source.postMessage(response, { targetOrigin: event.origin || "*" });
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  async function seedAndLoadGames() {
    await fetch(`${apiBase}/api/games/seed`, { method: "POST" });
    const response = await fetch(`${apiBase}/api/games`);
    const loadedGames = (await response.json()) as Game[];
    setGames(loadedGames);
    setSelectedGameId(loadedGames[0]?.id || "lords-daughter");
  }

  function openInNewWindow() {
    if (!selectedGame) return;
    window.open(selectedGame.launchUrl || selectedGame.iframeUrl, `gamevault-${selectedGame.id}`, "popup");
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">GameVault</p>
          <h1>Portal</h1>
        </div>
        <nav className="game-list" aria-label="Games">
          {games.map((game) => (
            <button
              key={game.id}
              className={game.id === selectedGame?.id ? "active" : ""}
              onClick={() => setSelectedGameId(game.id)}
            >
              <span>{game.title}</span>
              <small>{game.id}</small>
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h2>{selectedGame?.title || "No game registered"}</h2>
            <p>{selectedGame?.description || "Register a game to start testing the portal SDK."}</p>
          </div>
          <button className="primary" onClick={openInNewWindow} disabled={!selectedGame}>
            Open Window
          </button>
        </header>

        <div className="game-frame-wrap">
          {selectedGame ? (
            <iframe
              key={selectedGame.id}
              title={selectedGame.title}
              src={selectedGame.iframeUrl}
              sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
            />
          ) : (
            <div className="empty">No game selected.</div>
          )}
        </div>
      </section>
    </main>
  );
}

async function handleSdkRequest(
  request: SdkRequest,
  context: RealtimeTarget,
): Promise<SdkResponse> {
  try {
    const result = await callPortalApi(request, context);
    return { type: "gamevault:sdk-response", requestId: request.requestId, ok: true, result };
  } catch (error) {
    return {
      type: "gamevault:sdk-response",
      requestId: request.requestId,
      ok: false,
      error: error instanceof Error ? error.message : "Unknown SDK error"
    };
  }
}

async function callPortalApi(request: SdkRequest, context: RealtimeTarget): Promise<JsonValue> {
  switch (request.method) {
    case "auth.getToken": {
      return fetchJson<AuthContext>("/api/auth/token");
    }
    case "save.load": {
      const slot = Number((request.payload as { slot?: number })?.slot || 0);
      return fetchJson(`/api/games/${request.gameId}/save/${slot}`);
    }
    case "save.store": {
      return fetchJson(`/api/games/${request.gameId}/save`, {
        method: "PUT",
        body: JSON.stringify(request.payload),
        headers: { "Content-Type": "application/json" }
      });
    }
    case "account.get": {
      return fetchJson("/api/account");
    }
    case "account.set": {
      return fetchJson("/api/account", {
        method: "PUT",
        body: JSON.stringify(request.payload),
        headers: { "Content-Type": "application/json" }
      });
    }
    case "realtime.subscribe": {
      const eventName = parseRealtimeEventName(request.payload);
      if (!eventName) {
        throw new Error("Expected realtime.subscribe payload to include an event name");
      }
      await ensureRealtimeSocket();
      registerRealtimeSubscription(request.gameId, eventName, context);
      return { subscribed: true, event: eventName };
    }
    case "realtime.emit": {
      return fetchJson(`/api/games/${request.gameId}/realtime`, {
        method: "POST",
        body: JSON.stringify(request.payload),
        headers: { "Content-Type": "application/json" }
      });
    }
    default:
      throw new Error(`Unsupported SDK method: ${request.method}`);
  }
}

async function fetchJson<T extends JsonValue = JsonValue>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(typeof body?.error === "string" ? body.error : "Request failed");
  }
  return body as T;
}

function parseRealtimeEventName(payload: JsonValue | undefined): string | null {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const event = (payload as { event?: unknown }).event;
    if (typeof event === "string" && event.trim()) {
      return event.trim();
    }
  }
  return null;
}

function registerRealtimeSubscription(
  gameId: string,
  eventName: string,
  target: RealtimeTarget,
) {
  let gameSubscriptions = realtimeSubscriptions.get(gameId);
  if (!gameSubscriptions) {
    gameSubscriptions = new Map();
    realtimeSubscriptions.set(gameId, gameSubscriptions);
  }

  let eventSubscriptions = gameSubscriptions.get(eventName);
  if (!eventSubscriptions) {
    eventSubscriptions = new Map();
    gameSubscriptions.set(eventName, eventSubscriptions);
  }

  eventSubscriptions.set(target.source, target);
}

async function ensureRealtimeSocket(): Promise<Socket> {
  if (realtimeSocketReady) {
    return realtimeSocketReady;
  }

  realtimeSocketReady = (async () => {
    const auth = await fetchJson<AuthContext>("/api/auth/token");
    if (realtimeSocket && realtimeSocketUserId === auth.user.id) {
      return realtimeSocket;
    }

    realtimeSocket?.disconnect();
    realtimeSocketUserId = auth.user.id;
    realtimeSocket = io("/", {
      auth: { userId: auth.user.id },
      transports: ["websocket"]
    });
    realtimeSocket.on(realtimeEventName, deliverRealtimeEvent);
    return realtimeSocket;
  })();

  try {
    return await realtimeSocketReady;
  } catch (error) {
    realtimeSocketReady = null;
    throw error;
  }
}

function deliverRealtimeEvent(envelope: RealtimeEnvelope) {
  const gameSubscriptions = realtimeSubscriptions.get(envelope.gameId);
  const eventSubscriptions = gameSubscriptions?.get(envelope.event);
  if (!eventSubscriptions) return;

  const message = {
    type: realtimeEventName,
    event: envelope.event,
    payload: envelope.payload
  };

  for (const target of eventSubscriptions.values()) {
    try {
      target.source.postMessage(message, target.origin);
    } catch {
      eventSubscriptions.delete(target.source);
    }
  }
}
