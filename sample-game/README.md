# Sample Game Module

This folder is a starter module for the separate game repository.

## What to copy

- `index.html`
- `main.ts`
- `main.test.ts`

## What it depends on

- `shared/portal-sdk-client.ts`
- `shared/sdk.ts`

If you move this into another repository, keep the message contract unchanged:

- `gamevault:sdk-request`
- `gamevault:sdk-response`
- `gamevault:realtime-event`

## Expected behavior

- connect to the portal through `window.opener` or `window.parent`
- request a token on demand
- load and store save slot `0`
- read and write account data
- subscribe to multiple realtime events
- emit a portal-visible realtime event

## Local use

The sample module is already wired into the portal build output.

- development entry: `sample-game/index.html`
- bundled output: `dist/sample-game/index.html`

Use this module as the base for the real game project, then replace its hard-coded values with the actual game flow.
