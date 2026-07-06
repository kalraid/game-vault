import { createPortalSdkClient } from "../shared/portal-sdk-client";
import type { JsonValue } from "../shared/sdk";

const app = document.getElementById("app");
if (!app) {
  throw new Error("missing app root");
}

app.innerHTML = `
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; background: #101316; color: #f0f4ef; font-family: ui-sans-serif, system-ui, sans-serif; }
    main { min-height: 100vh; padding: 24px; display: grid; gap: 16px; max-width: 920px; margin: 0 auto; }
    .panel { border: 1px solid #39473f; border-radius: 14px; background: #171c1a; padding: 16px; }
    .row { display: flex; flex-wrap: wrap; gap: 8px; }
    button { border: 1px solid #d0ba72; background: #314039; color: #f0f4ef; border-radius: 8px; padding: 10px 14px; cursor: pointer; }
    pre { margin: 0; min-height: 220px; padding: 14px; background: #0c0f0f; border-radius: 12px; overflow: auto; }
    .muted { color: #9ea9a5; }
    .chip { display: inline-flex; border: 1px solid #3c5448; border-radius: 999px; padding: 3px 9px; }
    .list { display: flex; flex-wrap: wrap; gap: 8px; }
  </style>
  <main>
    <header class="panel">
      <div class="chip" id="state">booting</div>
      <h1>Sample Game Module</h1>
      <p class="muted">Reference implementation for the external game repository.</p>
    </header>

    <section class="panel">
      <h2>State</h2>
      <div class="list" id="subs"></div>
      <pre id="log">Ready.</pre>
    </section>

    <section class="panel row">
      <button id="auth">auth.getToken</button>
      <button id="load">save.load</button>
      <button id="store">save.store</button>
      <button id="account">account.get/set</button>
      <button id="subscribe">subscribe</button>
      <button id="emit">emit</button>
    </section>
  </main>
`;

const state = document.getElementById("state") as HTMLSpanElement;
const log = document.getElementById("log") as HTMLPreElement;
const subs = document.getElementById("subs") as HTMLDivElement;
const subscriptions = new Set<string>();

function write(message: string, payload?: JsonValue) {
  log.textContent = payload === undefined ? message : `${message}\n\n${JSON.stringify(payload, null, 2)}`;
}

function renderSubscriptions() {
  subs.innerHTML = "";
  if (subscriptions.size === 0) {
    subs.innerHTML = `<span class="chip">none</span>`;
    return;
  }
  for (const name of subscriptions) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = name;
    subs.appendChild(chip);
  }
}

const opener = window.opener ?? window.parent;
if (!opener) {
  state.textContent = "no portal window";
  write("Open this page from the portal.");
  throw new Error("sample game requires a portal opener or parent");
}

const sdk = createPortalSdkClient({
  gameId: new URLSearchParams(location.search).get("gameId") || "lords-daughter",
  target: opener,
  onRealtimeEvent: (event) => {
    subscriptions.add(event.event);
    renderSubscriptions();
    write(`realtime event: ${event.event}`, event.payload);
  },
});

state.textContent = "connected";
renderSubscriptions();

document.getElementById("auth")?.addEventListener("click", async () => {
  const result = await sdk.authGetToken();
  write("auth.getToken", result);
});

document.getElementById("load")?.addEventListener("click", async () => {
  const result = await sdk.saveLoad(0);
  write("save.load", result);
});

document.getElementById("store")?.addEventListener("click", async () => {
  const result = await sdk.saveStore(0, {
    hp: 7,
    gold: 100,
    savedAt: new Date().toISOString(),
  });
  write("save.store", result);
});

document.getElementById("account")?.addEventListener("click", async () => {
  await sdk.accountSet("external_module_ready", true);
  const result = await sdk.accountGet();
  write("account.get", result);
});

document.getElementById("subscribe")?.addEventListener("click", async () => {
  const events = ["achievement.unlocked", "progress.updated"];
  for (const event of events) {
    const result = await sdk.subscribe(event);
    subscriptions.add(event);
    write(`subscribed: ${event}`, result);
  }
  renderSubscriptions();
});

document.getElementById("emit")?.addEventListener("click", async () => {
  const result = await sdk.emit("progress.updated", { chapter: 2, percent: 65 });
  write("realtime.emit", result);
});
