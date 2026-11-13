# 2. Sign and notarize darwin binaries, do not staple them

Date: 2026-11-13

## Context

The `sign-macos` job hung for the full runner timeout (a 4h13m run, cancelled)
right after printing `lim-0.3.0-darwin-arm64: replacing existing signature`.
Once signing worked, the next step died with `Stapler is incapable of working
with Document files.` (exit 66).

The hang was a keychain problem, not a codesign problem: the CI keychain was
created, unlocked and given the certificate, but the imported private key kept
its ACL, so `codesign` waited for an authorization prompt that can never appear
on a headless runner.

The stapling failure is a format limit, not a misconfiguration. `stapler`
accepts UDIF disk images, signed flat installer packages and code-signed
executable bundles. Apple's own wording: "Although tickets are created for
standalone binaries, it's not currently possible to staple tickets to them."

## Decision

- Grant `codesign` access to the key non-interactively: `security import` with
  `-T /usr/bin/codesign -A`, then
  `security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k ci`,
  re-`unlock-keychain` immediately before signing, and pass `--keychain` to
  `codesign`.
- Keep Developer ID signing with hardened runtime, and keep notarizing the
  per-binary zip with `notarytool --wait`.
- Do not staple. There is nothing to staple to unless lim ships a `.pkg` or
  `.dmg` (ADR-0001 chose not to).
- Prove notarization took effect with `spctl --assess --type exec` in a retry
  loop, and treat that as a warning rather than a failure: Apple indexes the
  ticket asynchronously, so the first assessment after `Accepted` can lag.
- Every step in the signing path carries `timeout-minutes` (5 import, 10
  codesign, 30 notarize). A hung step must cost minutes, not a runner lifetime.

## Consequences

- The shipped Mach-O has no offline ticket. A quarantined direct download needs
  network for its first Gatekeeper assessment; brew and npm installs are
  unaffected because they do not set the quarantine xattr.
- The certificate import is safe-by-default on a shared runner: `-A` widens key
  access inside a keychain that is destroyed with the job.
- `spctl` warnings in a green run are expected and not a release blocker; a real
  notarization failure still fails the job at `notarytool`.
