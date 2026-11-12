import { renderApp } from "./ui/app";

const USAGE = `lim — a tui for dsh and others

Usage:
  lim              Launch the TUI
  lim --help       Show this help
  lim --version    Show the version
`;

async function resolveVersion(): Promise<string> {
  // In built artifacts the define constant-folds this to the injected
  // version. The package.json import must stay invisible to the bundler —
  // a literal specifier gets inlined, embedding the whole manifest into
  // dist/lim.js — so it is computed at runtime on purpose. Source checkouts
  // (bun run src/index.ts) take this path; artifacts never do.
  const injected = process.env.LIMULIN_VERSION;
  if (injected) return injected;
  try {
    const specifier = "../package.json";
    const pkg = await import(specifier);
    return pkg.version as string;
  } catch {
    return "unknown";
  }
}

export async function main(argv: string[]): Promise<number> {
  if (argv.length === 0) {
    await renderApp();
    return 0;
  }
  const option = argv[0];
  if (option === "--version" && argv.length === 1) {
    console.log(await resolveVersion());
    return 0;
  }
  if (option === "--help" && argv.length === 1) {
    process.stdout.write(USAGE);
    return 0;
  }
  process.stderr.write(`lim: unknown option ${option}\n\n${USAGE}`);
  return 2;
}
