import { createCliRenderer, type CliRenderer } from "@opentui/core";
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui";
import { KeymapProvider, useBindings } from "@opentui/keymap/react";
import { createRoot, useRenderer } from "@opentui/react";

export function Frame() {
  return <box borderStyle="rounded" width="100%" height="100%" />;
}

export function QuitLayer({ renderer }: { renderer: CliRenderer }) {
  useBindings(() => ({
    commands: [
      {
        name: "app.quit",
        run() {
          renderer.destroy();
        },
      },
    ],
    bindings: [{ key: "ctrl+c", cmd: "app.quit" }],
  }));
  return null;
}

export function Shell() {
  const renderer = useRenderer();
  const keymap = createDefaultOpenTuiKeymap(renderer);
  return (
    <KeymapProvider keymap={keymap}>
      <QuitLayer renderer={renderer} />
      <Frame />
    </KeymapProvider>
  );
}

export async function renderApp(): Promise<CliRenderer> {
  const renderer = await createCliRenderer({ exitOnCtrlC: false });
  createRoot(renderer).render(<Shell />);
  return renderer;
}
