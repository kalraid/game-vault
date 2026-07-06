import { useEffect, useMemo, useState } from "react";
import type { JsonValue, SdkRequest, SdkResponse } from "../../shared/sdk";

type Game = {
  id: string;
  title: string;
  description?: string | null;
  iframeUrl: string;
  launchUrl?: string | null;
};

const apiBase = "";

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

      const response = await handleSdkRequest(request);
      event.source?.postMessage(response, { targetOrigin: event.origin || "*" });
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

async function handleSdkRequest(request: SdkRequest): Promise<SdkResponse> {
  try {
    const result = await callPortalApi(request);
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

async function callPortalApi(request: SdkRequest): Promise<JsonValue> {
  switch (request.method) {
    case "auth.getToken": {
      return fetchJson("/api/auth/token");
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
      return { subscribed: true };
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

async function fetchJson(url: string, init?: RequestInit): Promise<JsonValue> {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(typeof body?.error === "string" ? body.error : "Request failed");
  }
  return body;
}
