[![CI](https://github.com/xminihub/limulin/actions/workflows/ci.yml/badge.svg)](https://github.com/xminihub/limulin/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/limulin.svg)](https://badge.fury.io/js/limulin)

# limulin

A TUI for [dsh](https://github.com/xminihub) and others, built with [OpenTUI](https://opentui.com).

**Repository:** https://github.com/xminihub/limulin
**Issues:** https://github.com/xminihub/limulin/issues

## Status

v0.1 scaffold: launching the app renders an empty rounded frame. `Ctrl+C` quits. Real features (dsh session dashboard and friends) come next.

## Install

### With a package manager (recommended)

The `limulin` package ships a portable JavaScript build; the command it installs is `lim`.

Node.js (>= 22):

```bash
npm install -g limulin
```

Bun (>= 1.4.4):

```bash
bun add -g limulin
```

Verify:

```bash
lim --version
```

### Standalone binaries

No runtime required — download the build for your platform from the
[latest release](https://github.com/xminihub/limulin/releases/latest):

| Platform              | Asset                           |
| --------------------- | ------------------------------- |
| macOS (Apple Silicon) | `lim-<version>-darwin-arm64`    |
| macOS (Intel)         | `lim-<version>-darwin-x64`      |
| Linux x86_64          | `lim-<version>-linux-x64`       |
| Linux arm64           | `lim-<version>-linux-aarch64`   |
| Windows x64           | `lim-<version>-windows-x64.exe` |

macOS binaries are Developer ID signed and notarized. Linux binaries work on
both glibc and musl systems. **Windows binaries are best-effort**: they are
cross-built but not exercised in CI — report issues if you hit one.

Verify:

```bash
./lim-<version>-<platform> --version   # Windows: lim-<version>-windows-x64.exe --version
```

## Usage

```bash
lim              # Launch the TUI
lim --help       # Show help
lim --version    # Show the version
```

## Development

Run the TUI from source:

```bash
bun install
bun run dev
```

Build the publishable bundle (`dist/lim.js`) or all standalone binaries:

```bash
bun run build
bun run build:binaries   # needs network to fetch per-target Bun runtimes
```

Tests (seams: CLI process behavior against source and against the built
dist bundle under Node and Bun, plus the React shell component via OpenTUI's
in-memory test renderer):

```bash
bun test                          # source tests
bun run build && bun test tests/dist.test.ts   # artifact tests
```

Type check and format:

```bash
bun check
bun fmt
```

## Testing note

The component tests need React development-build internals (`act`). `bunfig.toml` preloads `tests/preload.ts` which sets `NODE_ENV=test`, so plain `bun test` works.

## Requirements

Package managers: Node >= 22 or Bun >= 1.4.4. Standalone binaries: none.

## License

MIT
