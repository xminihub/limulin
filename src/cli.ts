import { renderApp } from "./ui/app";

const USAGE = `limulin — a tui for dsh and others

Usage:
  limulin              Launch the TUI
  limulin --help       Show this help
  limulin --version    Show the version
`;

export async function main(
  argv: string[],
  env: Record<string, string | undefined>,
): Promise<number> {
  const flag = argv[0];
  if (flag === "--version") {
    const pkg = await import("../package.json");
    console.log(pkg.version);
    return 0;
  }
  if (flag === "--help") {
    process.stdout.write(USAGE);
    return 0;
  }
  if (flag !== undefined) {
    process.stderr.write(`limulin: unknown option ${flag}\n\n${USAGE}`);
    return 2;
  }
  if (env["LIMULIN_TEST_HEADLESS"] === "1") {
    return 0;
  }
  await renderApp();
  return 0;
}
