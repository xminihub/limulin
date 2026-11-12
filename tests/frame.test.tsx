import { expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { Shell } from "../src/ui/app";

const EXPECTED_20x5 =
  [
    "╭──────────────────╮",
    "│                  │",
    "│                  │",
    "│                  │",
    "╰──────────────────╯",
  ].join("\n") + "\n";

test("shell renders a rounded box filling the viewport", async () => {
  const setup = await testRender(<Shell />, { width: 20, height: 5 });
  try {
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toBe(EXPECTED_20x5);
  } finally {
    setup.renderer.destroy();
  }
});

test("ctrl+c quits the shell by destroying the renderer", async () => {
  const setup = await testRender(<Shell />, { width: 20, height: 5 });
  await setup.renderOnce();
  setup.mockInput.pressCtrlC();
  await setup.waitFor(() => setup.renderer.isDestroyed);
  expect(setup.renderer.isDestroyed).toBe(true);
});
