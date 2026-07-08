# ADR-0002: Guest Sessions & Login Promotion

**Status**: Accepted — implemented (see `TODO.md` Priority 5)

## Context

ADR-0001 flagged auth as "consciously temporary": there is no login UI in the client today, and `requireUser` resolves every request to the same hardcoded `dev@example.com` user regardless of who's asking. This ADR replaces that placeholder with an actual design: play should not require login, but progress should still persist server-side, and logging in should be additive rather than a hard reset.

## Decision

**Guests get the full SDK contract, not a degraded one.** A player who has never logged in still gets a real portal-issued identity (an anonymous `User` row) the first time they hit the API, tracked via a server-set cookie — not a client-generated id sent as a header. `save.store`/`save.load`/`account.get`/`account.set`/`realtime.*` all work identically whether the caller is a guest or a logged-in account; a game module never needs to know or branch on which one it's talking to. This keeps the SDK contract (ADR-0001) uniform — "guest vs. logged-in" is entirely the portal's internal concern.

**Logging in promotes a guest session; it does not merge, per item, into an existing account.** When a guest signs in:
- If the account being signed into has **no existing `GameSave`/`AccountData` rows at all**, the guest's rows are re-pointed to that account's `userId` wholesale — the guest's progress becomes the account's progress.
- If the account **already has any data of its own** (e.g. this person has played before, on this device or another), the guest session's data is **discarded entirely** in favor of the existing account data. This is deliberately all-or-nothing, not a per-save-slot or per-account-key merge — resolving item-level conflicts (which save slot "wins") is a real product decision deferred out of this ADR.

## Consequences

- `requireUser` needs to become real: check for an authenticated session first, then fall back to a guest cookie (issuing one if absent), instead of today's constant-email stub.
- The client needs an actual login UI, which doesn't exist yet — currently `ExpressAuth`'s routes are mounted but unreachable from `client/ui/App.tsx`.
- The promotion check (does this account already have data?) needs to run once, synchronously, at the moment a guest completes login — not lazily on next save.

## Open questions

- What happens to a guest's `User` row after promotion, or after a guest session is abandoned entirely (never logs in)? No expiry/cleanup policy is decided yet.
- Item-level conflict resolution for the "account already has data" case (see Decision) is unresolved — right now the whole guest session simply loses.
- Whether promotion should surface any UI feedback to the player ("your guest progress was kept" / "your guest progress was discarded because this account already had a save") is unresolved.
