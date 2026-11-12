import { expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { Frame } from "../src/ui/app";

const EXPECTED_20x5 =
  [
    "╭──────────────────╮",
    "│                  │",
    "│                  │",
    "│                  │",
    "╰──────────────────╯",
  ].join("\n") + "\n";

test("frame renders a rounded box filling the viewport", async () => {
  const setup = await testRender(<Frame />, { width: 20, height: 5 });
  try {
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toBe(EXPECTED_20x5);
  } finally {
    setup.renderer.destroy();
  }
});
