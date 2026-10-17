/** Placeholder document until file open/save arrives with tabs (step 3). */
export const SAMPLE = `# MD

A tabbed Markdown editor for Windows. This sample document exists until step 3 adds
file open and save.

## What you are looking at

- **Left:** the source, in a monospace editor with subtle markup colouring.
- **Right:** the rendered preview, sanitised, capped at a 70-character measure.
- The bar between them is a splitter: drag it, or focus it and use the arrow keys.

## Shortcuts (also shown in the View menu)

| Action | Keys |
| --- | --- |
| Editor only / Split / Preview only | Ctrl+Shift+E / Ctrl+\\ / Ctrl+Shift+P |
| Zoom in / out / reset | Ctrl+= / Ctrl+- / Ctrl+0 |
| Undo / Redo | Ctrl+Z / Ctrl+Y |

> Scroll either pane and the other follows, by block. Turn it off in the View menu.

\`\`\`ts
// Fenced code keeps its own line map for scroll sync.
export const answer = 42;
\`\`\`

Raw HTML is allowed but sanitised, so this is harmless: <script>alert('nope')</script>

Links open in your browser, never inside the app: [Electron security](https://www.electronjs.org/docs/latest/tutorial/security).
`;
