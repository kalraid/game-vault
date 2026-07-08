# TODO

This repository is being aligned to the `game-vault` portal direction. Work is staged in small steps, and each completed step should be committed and pushed before the next one starts.

## Priority 1: Make the mock game the local proof point

- [x] Keep the mock game runnable from the portal shell.
- [x] Add a small visible interaction loop so the SDK contract can be exercised without reading source.
- [x] Make the mock game clearly show auth, save, account, and realtime behavior.
- [x] Keep this temporary and easy to replace when the real game module lands.

Current implementation note:

- The mock game now shows live state panels for auth, save slot 0, account data, and realtime events.
- The portal-side `realtime.subscribe` bridge is wired to forward events back into the game window.

## Priority 2: Add basic verification

- [x] Add tests for the portal API contract.
- [x] Add a small test for the mock game wiring if practical.
- [x] Cover the SDK bridge behavior at the boundaries we control.

Current implementation note:

- Tests now cover the portal contract, the game registry, the realtime fanout helper, and the mock game wiring.

## Priority 3: Dockerize the project

- [x] Add a Dockerfile for the portal app.
- [x] Add a docker-compose entry for local development and the mock game.
- [x] Keep Windows PowerShell usage documented, but treat Docker as the deployment path.
- [x] The current machine does not run Docker, so this step should be verified by build/config review first.

Current implementation note:

- The Docker image is a single production portal container that builds the client and server together.
- The compose file publishes the portal on `http://localhost:3001` and stores SQLite data in a named volume.

## Priority 4: Expand the portal contract

- [x] Document the external game-module contract.
- [x] Expand the game registry with a configurable JSON override.
- [x] Align the realtime flow with the eventual external game module contract.
- [x] Remove temporary assumptions once the real game module exists.
- [x] Add a reusable sample game module starter.
- [x] Add copy instructions for the sample game module.

Current implementation note:

- The integration guide now lives in `GAME_MODULE.md` and describes the message protocol the other repository should implement.
- The registry can now be expanded with `GAMES_JSON` without editing code.
- Realtime fanout is now centralized in `server/realtime.ts` and covered by unit tests.
- The mock game now demonstrates additive realtime subscriptions across multiple events.
- `sample-game/` is a starter module that can be copied into the separate game repository.
- `sample-game/README.md` describes the files to copy and the expected portal contract behavior.

## Priority 5: Real auth — guest sessions + login promotion

Design decided in [docs/adr/0002-guest-sessions-and-login-promotion.md](./docs/adr/0002-guest-sessions-and-login-promotion.md); implemented.

- [x] Add a login UI in `client/ui/App.tsx` that actually reaches `ExpressAuth`'s routes (currently mounted server-side but unreachable from the client).
- [x] Replace `requireUser`'s constant-email stub with real logic: check for an authenticated session first, then fall back to a server-issued guest cookie (creating one if absent).
- [x] Implement login promotion: if the logging-in account has no existing `GameSave`/`AccountData` rows, re-point the guest session's rows to it; if it already has any data, discard the guest session's data instead (all-or-nothing, not per-item merge).
- [ ] Decide and implement a cleanup/expiry policy for abandoned guest `User` rows (open question in ADR-0002).

Current implementation note:

- `server/auth.ts` now resolves `requireUser` via a real Auth.js session first (`getSession`), falling back to a `gv_guest` cookie (httpOnly, `sameSite: lax`, 1 year), creating a fresh guest `User` (`isGuest: true`, `email: null`) when absent or stale.
- `POST /api/auth/promote-guest` (in `server/routes.ts`, handler in `server/auth.ts`) implements the all-or-nothing promotion/discard logic from ADR-0002 inside a Prisma transaction, returning `{ promoted, reason? }`.
- `client/ui/App.tsx` adds a minimal login form + identity/sign-out panel in the sidebar, driving Auth.js's Express credentials flow (`/auth/csrf`, `/auth/callback/credentials`, `/auth/signout`) and calling `/api/auth/promote-guest` right after sign-in.
- `prisma/schema.prisma`'s `User.email` is now `String? @unique` and `User.isGuest Boolean @default(false)`.
- Guest-row expiry/cleanup policy is still an open question per ADR-0002 and was deliberately left unimplemented.

## Notes

- The current repository already has the core portal shell, auth, saves, and realtime event transport.
- `realtime.subscribe` is intentionally minimal for now.
- The mock game is the fastest way to prove the portal loop end-to-end before the real game module is integrated.
- Auth today is a single shared dev account, not per-browser identity — see Priority 5 and ADR-0002.
