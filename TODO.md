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

- Add tests for the portal API contract.
- Add a small test for the mock game wiring if practical.
- Cover the SDK bridge behavior at the boundaries we control.

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
- Align the realtime flow with the eventual external game module contract.
- Expand the game registry as more game modules are added.
- Remove temporary assumptions once the real game module exists.

Current implementation note:

- The integration guide now lives in `GAME_MODULE.md` and describes the message protocol the other repository should implement.

## Notes

- The current repository already has the core portal shell, auth, saves, and realtime event transport.
- `realtime.subscribe` is intentionally minimal for now.
- The mock game is the fastest way to prove the portal loop end-to-end before the real game module is integrated.
