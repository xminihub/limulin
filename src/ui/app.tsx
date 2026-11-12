import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";

export function Frame() {
  return <box borderStyle="rounded" width="100%" height="100%" />;
}

export async function renderApp() {
  const renderer = await createCliRenderer({ exitOnCtrlC: true });
  createRoot(renderer).render(<Frame />);
}
