import { renderApp } from "./ui/app";

const USAGE = `limulin — a tui for dsh and others

Usage:
  limulin              Launch the TUI
  limulin --help       Show this help
  limulin --version    Show the version
`;

export async function main(argv: string[]): Promise<number> {
  if (argv.length === 0) {
    await renderApp();
    return 0;
  }
  const option = argv[0];
  if (option === "--version" && argv.length === 1) {
    const pkg = await import("../package.json");
    console.log(pkg.version);
    return 0;
  }
  if (option === "--help" && argv.length === 1) {
    process.stdout.write(USAGE);
    return 0;
  }
  process.stderr.write(`limulin: unknown option ${option}\n\n${USAGE}`);
  return 2;
}
