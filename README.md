# limulin

A TUI for [dsh](https://github.com/xminihub) and others, built with [OpenTUI](https://opentui.com).

**Repository:** https://github.com/xminihub/limulin
**Issues:** https://github.com/xminihub/limulin/issues

## Status

v0.1 scaffold: launching the app renders an empty rounded frame. `Ctrl+C` quits. Real features (dsh session dashboard and friends) come next.

## Requirements

- Bun >= 1.4.4

## Run

```bash
bun install
bun run src/index.ts
```

CLI flags:

```bash
bun run src/index.ts --help
bun run src/index.ts --version
```

## Development

Run the TUI:

```bash
bun run src/index.ts
```

Tests (two seams: CLI process behavior and the React shell component via OpenTUI's in-memory test renderer):

```bash
bun test
```

Type check:

```bash
bun check
```

Format:

```bash
bun fmt
```

## License

MIT
