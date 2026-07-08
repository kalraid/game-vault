# GameVault Portal

GameVault is a web application that hosts externally-built browser games, giving each one a shared contract for authentication, save data, account-wide data, and realtime events. It owns none of the gameplay itself.

## Language

**Portal**:
GameVault itself — the web app that hosts game modules and brokers auth, save, account, and realtime access on their behalf.
_Avoid_: Server, backend, hub

**Game Module**:
An externally-built, independently-repo'd browser game that integrates with the portal via the SDK contract. The portal is game-agnostic; a game module is a pluggable consumer of it.
_Avoid_: Game, app, plugin

**gameId**:
The stable identifier for a launched game module instance, scoping save slots and realtime events to that game. Does **not** scope account data — see Account data.
_Avoid_: Game key, slug

**Launch mode**:
The mechanism by which the portal presents a game module to the player — embedded iframe or a new window/tab. Both modes speak the same SDK contract.
_Avoid_: Display mode, view mode

**SDK contract**:
The `postMessage`-based request/response/event protocol a game module uses to talk to the portal (`gamevault:sdk-request` / `gamevault:sdk-response` / `gamevault:realtime-event`).
_Avoid_: API, protocol

**Save slot**:
Per-slot save state for a game module (0-99), versioned by a `schema_version` field. Independent of account data.
_Avoid_: Save file, save data

**Account data**:
Key-value state scoped to the **account as a whole, shared across every game module** (not per-game, not per-save-slot) — the mechanism for cross-game unlocks/achievements. Game modules must namespace their own keys by convention to avoid colliding with another game's keys.
_Avoid_: Profile, global state, per-game data

**Realtime event**:
A named event a game module publishes or subscribes to through the portal, fanned out **per account** (every open portal session for that user, across tabs/windows/devices), not per browser tab and not broadcast to other users. A subscription in one tab can receive an event emitted from the same game in another tab of the same account — that's deliberate cross-session sync, not a leak.
_Avoid_: Message, notification, per-tab event, per-session event

**Guest session** (see ADR-0002):
An unauthenticated identity the portal issues automatically so a player can use the full SDK contract (save, account data, realtime) without logging in first. Backed by the same `User`/`GameSave`/`AccountData` rows as a logged-in account — a guest is not a second-class storage tier, just an account nobody has claimed with a login yet.
_Avoid_: Anonymous user, temp account

**Promotion** (see ADR-0002):
The one-time act of attaching a guest session's data to a login the first time that guest signs in. Only happens when the logging-in account has no prior data of its own; if it already has data, the guest session's data is discarded rather than merged.
_Avoid_: Migration, merge, claim
