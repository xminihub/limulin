#!/usr/bin/env bash
# lim installer (spec #4): fetches the compiled binary for this host from
# GitHub Releases, verifies it against SHA256SUMS, and places it in
# ~/.local/bin. macOS and Linux only; Windows uses npm or the raw binary.
#
#   curl -fsSL https://github.com/xminihub/limulin/releases/latest/download/install.sh | bash
#
# Flags: --version <x.y.z>  --no-modify-path  --binary <path>  --force
# Test hook: LIM_INSTALL_BASE points at a local directory (or alternate URL
# root) laid out like release assets (lim-latest.txt, SHA256SUMS, lim-<v>-<target>).
set -euo pipefail

APP=lim
REPO="xminihub/limulin"
INSTALL_DIR="$HOME/.local/bin"
RC_MARKER="# added by lim installer"

RED='\033[0;31m'
NC='\033[0m'

die() {
    echo -e "${RED}lim install: $1${NC}" >&2
    exit 1
}

usage() {
    cat <<EOF
lim Installer

Usage: install.sh [options]

Options:
    -h, --help              Display this help message
    -v, --version <version> Install a specific version (e.g., 0.4.0)
    -b, --binary <path>     Install from a local binary instead of downloading
    -f, --force             Replace an existing ~/.local/bin/lim even if it
                            is not recognizably lim
        --no-modify-path    Don't modify shell config files (.zshrc, .bashrc)

lim is installed to ~/.local/bin/lim. Shell configs are edited only when
that directory is not already on PATH.
EOF
}

requested_version=""
binary_path=""
no_modify_path=false
force=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        -h|--help) usage; exit 0 ;;
        -v|--version)
            [[ -n "${2:-}" ]] || die "--version requires an argument"
            requested_version="$2"; shift 2 ;;
        -b|--binary)
            [[ -n "${2:-}" ]] || die "--binary requires a path argument"
            binary_path="$2"; shift 2 ;;
        -f|--force) force=true; shift ;;
        --no-modify-path) no_modify_path=true; shift ;;
        *) die "unknown option '$1' (see --help)" ;;
    esac
done

base="${LIM_INSTALL_BASE:-https://github.com/$REPO/releases}"

fetch_asset() {
    # $1: asset name, $2: destination. File mode when LIM_INSTALL_BASE names
    # a local directory (the test seam), URL mode otherwise.
    if [[ -d "$base" ]]; then
        [[ -f "$base/$1" ]] || die "release fixture has no asset $1"
        cp "$base/$1" "$2"
    else
        local url
        if [[ "$1" == "lim-latest.txt" ]]; then
            url="$base/latest/download/$1"
        else
            url="$base/download/v$requested_version/$1"
        fi
        curl -fsSL "$url" -o "$2" || die "failed to fetch $url"
    fi
}

sha256_of() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | cut -d' ' -f1
    elif command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$1" | cut -d' ' -f1
    else
        die "need sha256sum or shasum to verify downloads"
    fi
}

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

if [[ -n "$binary_path" ]]; then
    [[ -f "$binary_path" ]] || die "binary not found at $binary_path"
    src="$work/lim"
    cp "$binary_path" "$src"
    version="local"
else
    raw_os=$(uname -s)
    case "$raw_os" in
        Darwin*) os="darwin" ;;
        Linux*) os="linux" ;;
        *) die "unsupported OS: $raw_os (Windows installs via npm or the raw binary)" ;;
    esac
    arch=$(uname -m)
    [[ "$arch" == "aarch64" ]] && arch="arm64"
    [[ "$arch" == "x86_64" ]] && arch="x64"
    target="$os-$arch"
    case "$target" in
        darwin-arm64|darwin-x64|linux-arm64|linux-x64) ;;
        *) die "unsupported target: $target" ;;
    esac

    requested_version="${requested_version#v}"
    if [[ -z "$requested_version" ]]; then
        fetch_asset "lim-latest.txt" "$work/latest"
        requested_version=$(tr -d '[:space:]' < "$work/latest")
        [[ -n "$requested_version" ]] || die "could not resolve the latest version"
    fi
    version="$requested_version"
    asset="lim-$version-$target"

    fetch_asset "SHA256SUMS" "$work/SHA256SUMS"
    expected=$(awk -v f="$asset" '$2 == f { print $1 }' "$work/SHA256SUMS" | head -n1)
    [[ -n "$expected" ]] || die "$asset is not listed in SHA256SUMS (version $version unknown or mispublished)"

    src="$work/lim"
    fetch_asset "$asset" "$src"
    actual=$(sha256_of "$src")
    [[ "$actual" == "$expected" ]] || die "checksum mismatch for $asset: got $actual, expected $expected — nothing was installed"
fi

mkdir -p "$INSTALL_DIR"
dest="$INSTALL_DIR/$APP"

recognizable_as_lim() {
    # A lim binary exits 0 on --version and prints something version-like.
    [[ -x "$1" ]] || return 1
    outv=$("$1" --version 2>/dev/null) || return 1
    [[ "$outv" =~ [0-9]+\.[0-9]+ ]]
}

if [[ -e "$dest" ]] && ! recognizable_as_lim "$dest" && [[ "$force" != true ]]; then
    die "$dest already exists and is not recognizably lim; remove it or pass --force"
fi

chmod 0755 "$src"
mv "$src" "$dest"
echo "Installed $APP $version to $dest"

path_ok=false
[[ ":$PATH:" == *":$INSTALL_DIR:"* ]] && path_ok=true
rc=""
case "${SHELL:-}" in
    */zsh) rc="$HOME/.zshrc" ;;
    */bash) rc="$HOME/.bashrc" ;;
    *) rc="$HOME/.profile" ;;
esac

if [[ "$path_ok" != true && "$no_modify_path" != true ]]; then
    if ! grep -qF "$RC_MARKER" "$rc" 2>/dev/null; then
        {
            echo ""
            echo "$RC_MARKER"
            echo 'export PATH="$HOME/.local/bin:$PATH"'
        } >> "$rc"
        echo "Added ~/.local/bin to PATH in $rc (restart your shell)"
    fi
fi
