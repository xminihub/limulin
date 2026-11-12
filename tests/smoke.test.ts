import { expect, test } from "bun:test";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const ENTRY = resolve(ROOT, "src/index.ts");

test("launch renders the frame and Ctrl+C quits", async () => {
  const proc = Bun.spawn(["bun", "run", ENTRY], {
    cwd: ROOT,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  try {
    let buf = "";
    const reader = proc.stdout.getReader();
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && !buf.includes("╭")) {
      const res = await Promise.race([
        reader.read(),
        new Promise((r) => setTimeout(() => r(null), 300)),
      ]);
      if (res === null) continue;
      const { value, done } = res as { value?: Uint8Array; done?: boolean };
      if (done || !value) break;
      buf += Buffer.from(value).toString("utf8");
    }
    expect(buf).toContain("╭");
    proc.stdin.write("\x03");
    expect(await proc.exited).toBe(0);
  } finally {
    proc.kill(9);
  }
}, 15000);
