# ADR-0034: Godot → Web Pivot

**Date**: 2026-07-06
**Status**: Proposed
**Related**: ADR-0012 (superseded for save/serialization only, modding-boundary intent unaffected), ADR-0031 (SD/pixel visual-style split — referenced, not changed), ADR-0018 (Visual QA pixel-diff PASS threshold — mechanism survives, runtime target changes from Godot to browser)

**Scope note**: This ADR is a handoff specification only. It does not execute any repository changes. §6 describes what a future session will do after this document is reviewed and approved; nothing in §6 has been performed yet.

## 1. Context

"Lord's Daughter" is currently a Godot 4 project (`game/`: ~30 GDScript autoload singletons, ~74 `.tscn` scenes, ~125 `.gd` scripts, only 3 `.cs` files). ADR-0012 planned a GDScript/C# hybrid split along a modding boundary, but that migration was never actually executed for save/serialization — `SaveManager.gd` still performs save/load itself in GDScript, writing local files (`user://save_slot_N.json`, versioned via a `SAVE_VERSION` constant, with legacy single-file migration). No server communication, account system, or websocket code exists anywhere in `game/`.

The product direction is now changing: distribute the game as a web app, hosted inside a separate web portal project (built by a different AI, in a different repository — out of scope here), with account and save data held server-side instead of locally, and with an explicit intent to support game-to-game and game-to-webserver-to-game integration in the future. This is a net-new capability, not a response to a technical dead end in the Godot build — no prior web/server/multiplayer design exists in this project's documentation.

Two existing assets substantially de-risk this pivot:

- **`Documentation/Wireframes/`** — roughly 50 static HTML files (`screen_01_title.html` … `screen_51_spirit_relationship.html`) covering every game screen, with shared `_wireframe_common.css`, `wireframe_nav.css`, `_wireframe_state.js`, and a `NAV_SPEC.md` for inter-screen navigation. `Documentation/Wireframes/AGENTS.md` already designates these HTML files as the authoritative UI spec ("HTML wins" over `UIFigmaSpec.md`). This becomes the direct source for the web frontend's component conversion — it does not need to be redesigned, only re-implemented in a real framework.
- **The "글로벌 계정 데이터 구조" (Global Account Data Structure)** in `CONTEXT.md` (confirmed 2026-06-18, lines 1892-1905) — a Steam Cloud `user://account_data.json`, fully separate from save slots, already modeling three tiers of persistence (per-save-slot state, account-global state, difficulty/mode-gated unlocks). This is the reference schema for the web save/account design in §4.

ADR-0012 is **not fully superseded**. Its modding-boundary reasoning (what belongs in a protected core vs. a moddable/data-driven layer) is unaffected; only the specific plan to move save/load/serialization into a C# core is superseded, since that layer moves server-side entirely under this pivot.

## 2. Decision: Frontend stack — React + Phaser/PixiJS

The web game client will be built as **React for UI chrome** (dialogue boxes, menus, settings screens — converted directly from `Documentation/Wireframes/`) with a **Phaser or PixiJS canvas embedded inside React** for the pixel-art gameplay layer (raising-sim schedule, RPG battles, territory management, activity CG playback).

This maps directly onto the SD/dot-pixel split already decided in ADR-0031 (line 14: "경계 기준: 대화창 툴 사용 여부" / boundary = whether the dialogue-box tool is used): screens using the dialogue-box tool → React DOM layer; dialogue-tool-free gameplay/ambient screens (territory management, schedule calendar, RPG combat, activity CG) → Phaser/PixiJS canvas layer. The two visual tracks ADR-0031 already separates for art generation (SD queue vs. pixel queue) now also separate cleanly by rendering technology.

Rationale for React specifically: largest frontend ecosystem, and this repository is itself AI-orchestrated (Claude/Codex/Gemini via `CLAUDE.md`/`CODEX.md`/`.agents/AGENTS.md`) — React is the framework AI codegen tools handle most reliably, which matters more here than in a conventionally-staffed project.

The final choice between Phaser and PixiJS is **not** made in this ADR — see §7.

## 3. Decision: Portal SDK contract (requirements only, not portal architecture)

The web portal itself is a separate project built by a different AI; its internal architecture (iframe vs. module federation vs. server-rendered subroutes, transport choices, hosting) is **explicitly out of scope for this repository** and is not specified here. This section states only what this game requires *from* the portal, as a consumer-side contract:

```
auth.getToken()
save.load(slot) / save.store(slot, data)
account.get() / account.set(key, value)
realtime.subscribe(event, cb) / realtime.emit(event, payload)
```

The cross-game trigger/flag mechanism the user wants (e.g., an achievement in one game unlocking content in another) is modeled as a convention layered on top of `account`/`realtime` — not a new primitive. Its exact payload schema and transport are left to the portal team's discretion.

This ADR deliberately does **not** specify: iframe vs. module-federation embedding, the websocket library/protocol, hosting infrastructure, or the auth provider. Specifying any of these here would be portal-architecture creep into a separate project's decision space.

## 4. Decision: Save/account schema for the web version

The web save/account schema keeps the **field names and semantics** of the existing `CONTEXT.md` "글로벌 계정 데이터 구조" (lines 1892-1905) unchanged, and only swaps the transport/persistence layer:

| Tier | Godot (current) | Web (this ADR) |
|------|------------------|-----------------|
| Per-save-slot state | `save_slot_*.json` (local file) | `save.load(slot)` / `save.store(slot, data)` via portal SDK |
| Account-global state (`outer_god_front_club`, `global_hints_collected[]`, `awakened_mode`, `gallery_unlocked[]`, `achievements[]`, `endings_seen[]`) | `user://account_data.json` (Steam Cloud sync) | `account.get()` / `account.set(key, value)` via portal SDK |
| Difficulty/mode-gated unlocks | Derived from account-global fields (e.g. `awakened_mode`) | Unchanged in concept — persisted through the account tier |

`SaveManager.gd`'s `SAVE_VERSION` constant precedent carries forward as a `schema_version` field on both the per-slot and account-global payloads, so future format changes remain migratable.

Migration of existing local Godot save files into the new web account system is **out of scope** for this ADR — treat web accounts as greenfield unless the user decides otherwise (also listed as an open question in §7).

## 5. Decision: AI role redivision

Role mapping for this repository going forward (the portal has its own separate role table in its own project — not covered here):

| AI | New roles |
|----|-----------|
| Claude | `orchestrator` + `web_common` + `sound` |
| Codex | `web_frontend` + `content_event` + `visual_gen` |
| Gemini | `web_logic` + `qa` |

`ROLES/ROLE_*.md` disposition:

- `ROLE_godot_common.md` → `ROLE_web_common.md` (Claude) — shared build tooling/config, SDK contract/interface types, cross-cutting glue. Same arbitration function `godot_common` played for shared autoloads, now for shared TS types and the SDK contract from §3.
- `ROLE_godot_rpg.md` + `ROLE_godot_territory.md` → merged into `ROLE_web_logic.md` (Gemini) — ports combat math, territory building/tech effects, and stat calculations from GDScript into TypeScript.
- `ROLE_godot_raising.md` + `ROLE_wireframe.md` → merged into `ROLE_web_frontend.md` (Codex) — converts `Documentation/Wireframes/` HTML into React components; owns UI/UX implementation.
- `ROLE_content_event.md`, `ROLE_visual_gen.md`, `ROLE_sound.md`, `ROLE_qa.md`, `ROLE_orchestrator.md` — identity unchanged, only the downstream target changes (React/Phaser assets and web QA instead of Godot scenes/resources).

The existing QA 3-way cross-rotation ring (`AGENTS.md` lines 76-89, tester ≠ owner) re-maps directly onto the new roles with no redesign needed:

```
qa_codex  (Codex executes)  → web_logic                          (Gemini-owned)
qa_gemini (Gemini executes) → web_common, sound                  (Claude-owned)
qa_claude (Claude executes) → web_frontend, content_event, visual_gen  (Codex-owned)
```

`AGENTS.md`'s role table (lines 25-38) and "Godot 파트 분할 구조" section (lines 39-50) get replaced by an equivalent "Web 파트 분할 구조" table using the mapping above; the future migration session should apply this table verbatim rather than redesign it.

## 6. Migration plan outline (future session — not executed now)

**Nothing in this section is performed in this session.** It is a plan for a future session after this ADR is approved.

1. `git tag` the current Godot state before any removal (safety net).
2. Decide branch strategy: the current convention is "모든 AI는 dev 브랜치" (all AIs work on `dev`) — whether the pivot proceeds directly on `dev` or on a dedicated pivot branch is an open question (§7), not decided here.
3. Remove the `game/` Godot source tree.
4. What survives vs. gets rewritten:
   - Survives as-is: `Documentation/` (Wireframes becomes the conversion source), `Z_DOC/`, `.claude/`/`.agents/`/`.gemini/` orchestration configs (pointers updated, not removed).
   - Rewritten per §5: `ROLES/`, `.roles/<id>/` (old role directories archived/retired the same way `.roles/godot_impl/` was retired previously — see `AGENTS.md` line 37).
   - Partially rewritten: `tools/` — Godot-coupled scripts (Godot-build/test/flow-qa runners targeting `.tscn` scenes) need replacement; scripts that diff HTML wireframes against a runtime screenshot likely survive with only the runtime target changed from Godot to browser.
5. Scaffold the new web app (React + Phaser/PixiJS + build tooling), converting `Documentation/Wireframes/` HTML 1:1 into initial React components.
6. Rewrite root entry docs (`CLAUDE.md`, `CODEX.md`, `GEMINI.md`/`.agents/AGENTS.md`, `AGENTS.md`) to point at the new role docs and web dev-server/build commands instead of Godot editor/headless commands.

The only hard ordering dependency: tag before removal. Role-doc rewrite and scaffolding can proceed in parallel with or ahead of `game/` removal since they're additive.

## 7. Open questions / explicitly out of scope

- Portal internal architecture (iframe vs. module federation vs. server-rendered subroutes) — the portal team's decision, not this repo's.
- Exact realtime channel protocol/library — portal team's decision; this repo only specifies the `realtime.subscribe`/`realtime.emit` shape (§3).
- Hosting infrastructure for the web app — deferred.
- Auth provider choice (OAuth flow, session strategy) — portal's decision; this repo only needs `auth.getToken()`.
- Phaser vs. PixiJS final pick — recommend a short spike before committing.
- Whether/how to migrate existing local Godot save files into the new web account system — currently unresolved (see §4).
- Proceeding directly on `dev` vs. a dedicated pivot branch for the migration in §6 — currently unresolved.
