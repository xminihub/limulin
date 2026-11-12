import { resolve } from "node:path";

export type RunResult = { code: number; out: string; err: string };

const ROOT = resolve(import.meta.dir, "..");

/** Spawn a CLI entry (source or dist) under a runtime and capture output. */
export async function runProcess(
  command: string,
  args: string[],
  options: { env?: Record<string, string> } = {},
): Promise<RunResult> {
  const proc = Bun.spawn([command, ...args], {
    cwd: ROOT,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: options.env ? { ...process.env, ...options.env } : process.env,
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, out, err };
}

export const repoRoot = ROOT;
