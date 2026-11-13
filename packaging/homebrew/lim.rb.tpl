class Lim < Formula
  desc "TUI for dsh and others"
  homepage "https://github.com/xminihub/limulin"
  url "https://github.com/xminihub/limulin/releases/download/v{{VERSION}}/lim-{{VERSION}}-darwin-arm64.tar.gz"
  version "{{VERSION}}"
  sha256 "{{SHA256}}"
  license "MIT"

  livecheck do
    url "https://github.com/xminihub/limulin/releases/latest"
    regex(%r{/v(\d+(?:\.\d+)+)/lim-\1-darwin-arm64\.tar\.gz$}i)
  end

  def install
    bin.install "lim"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/lim --version")
  end
end
