import { describe, expect, it, vi } from "vitest";
import { emitRealtimeEvent, REALTIME_EVENT } from "./realtime.js";

describe("realtime fanout", () => {
  it("emits the realtime envelope to the target room", () => {
    const emit = vi.fn();
    const io = {
      to: vi.fn(() => ({
        emit,
      })),
    };

    const envelope = {
      gameId: "lords-daughter",
      event: "achievement.unlocked",
      payload: { id: "mock_start" },
    };

    expect(emitRealtimeEvent(io, "user-1", envelope)).toBe(true);
    expect(io.to).toHaveBeenCalledWith("user-1");
    expect(emit).toHaveBeenCalledWith(REALTIME_EVENT, envelope);
  });

  it("throws when the room is blank", () => {
    expect(() =>
      emitRealtimeEvent(undefined, "   ", {
        gameId: "lords-daughter",
        event: "achievement.unlocked",
        payload: {},
      }),
    ).toThrow("realtime room is required");
  });
});
