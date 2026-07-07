import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const mockGamePath = new URL("../public/mock-game.html", import.meta.url);

describe("mock game wiring", () => {
  it("exposes the contract controls the portal depends on", async () => {
    const html = await readFile(mockGamePath, "utf8");

    expect(html).toContain('id="authState"');
    expect(html).toContain('id="saveState"');
    expect(html).toContain('id="accountState"');
    expect(html).toContain('id="realtimeState"');
    expect(html).toContain('id="subscriptionState"');
    expect(html).toContain('id="subscribe">subscribe all</button>');
    expect(html).toContain('id="event2">emit progress</button>');
    expect(html).toContain('sdk("realtime.subscribe", { event: eventName })');
    expect(html).toMatch(/sdk\("realtime\.emit",\s*\{\s*event:\s*"progress\.updated"/);
  });
});
