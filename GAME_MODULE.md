# Game Module Integration Guide

This repository is the portal. A separate game repository will eventually provide the actual playable module.

This guide describes what that external game module must do to work with the current portal implementation.

## Expected launch modes

The portal can open a game in either of these ways:

- embedded iframe
- new window or tab

Both modes use the same `postMessage` contract.

## Required message contract

The game module sends requests to the portal:

```ts
{
  type: "gamevault:sdk-request",
  requestId: string,
  gameId: string,
  method:
    | "auth.getToken"
    | "save.load"
    | "save.store"
    | "account.get"
    | "account.set"
    | "realtime.subscribe"
    | "realtime.emit",
  payload?: unknown
}
```

The portal replies:

```ts
{
  type: "gamevault:sdk-response",
  requestId: string,
  ok: boolean,
  result?: unknown,
  error?: string
}
```

The portal may also deliver realtime events back to the game:

```ts
{
  type: "gamevault:realtime-event",
  event: string,
  payload: unknown
}
```

## Game behavior expected by the portal

The external game module should:

- listen for `postMessage` responses from the portal
- request a token after it boots
- use `save.load(slot)` and `save.store(slot, data)` for slot-based save data
- use `account.get()` and `account.set(key, value)` for account-wide data
- call `realtime.subscribe` for events it cares about
- call `realtime.emit` when it needs to publish a portal-visible event

## Portal assumptions the game can rely on

- `gameId` is stable for a given launched game instance.
- `save.store` and `account.set` accept opaque JSON-compatible values.
- `realtime.subscribe` is currently event-name based.
- `realtime.emit` will be persisted by the portal and forwarded back to subscribers in the current user room.
- The portal mock game is intentionally temporary and exists only to validate this contract.

## What the game must not assume

- Do not assume direct database access.
- Do not assume local file save access.
- Do not assume realtime events are delivered unless the game subscribed to them.
- Do not assume the portal uses the same launch origin in iframe and new-window mode.

## Local development note

The current repository already includes a mock game at `public/mock-game.html` that exercises the contract.
Use it as a reference when implementing the real game module in the other repository.
