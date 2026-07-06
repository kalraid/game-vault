import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const htmlPath = new URL("./index.html", import.meta.url);
const mainPath = new URL("./main.ts", import.meta.url);

describe("sample game module", () => {
  it("contains the portal SDK wiring expected by the external repo", async () => {
    const html = await readFile(htmlPath, "utf8");
    const main = await readFile(mainPath, "utf8");

    expect(html).toContain('src="./main.ts"');
    expect(main).toContain('createPortalSdkClient');
    expect(main).toContain('sdk.authGetToken()');
    expect(main).toContain('sdk.saveLoad(0)');
    expect(main).toContain('sdk.saveStore(0, {');
    expect(main).toContain('sdk.accountSet("external_module_ready", true)');
    expect(main).toContain('sdk.subscribe(event)');
    expect(main).toContain('sdk.emit("progress.updated"');
  });
});
