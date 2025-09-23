# ClickTree

ClickTree is a minimal Electron desktop app that lets you grow procedurally generated trees with the open-source [`tree.js`](vendor/tree.js) plugin. Click anywhere on the canvas to sprout a tree and tweak parameters live through the built-in control panel.

## Getting Started

```bash
npm install
npm start
```

That will open the development window with live reload.

## Building Installers

```bash
npm run build
```

This wraps the app with `electron-builder` and produces platform-specific binaries inside the `dist/` folder.

## Controls & Features

- **Click to grow**: click (or Redraw) to generate a deterministic tree at the selected point.
- **Parameters**: depth, growth speed, tree scale, branch width, color mode (solid or gradient), seed and colors.
- **Randomize Tree**: shuffles all parameters (depth, scale, colors, seed) in one click.
- **Clear**: stops any animation and clears the canvas.
- **Presets**: Save/Load buttons (and File menu items) read/write JSON configuration files via the native dialog.
- **Menu shortcuts**: `Cmd/Ctrl + S` saves the current preset, `Cmd/Ctrl + O` loads one, and `View` offers Reload or Toggle DevTools.

## Determinism

The underlying plugin exposes a seeded RNG. Passing the same seed together with the same parameters reproduces identical trees, which powers the Randomize/Redraw flow and saved presets.

## License

The bundled [`tree.js`](vendor/tree.js) file remains under its original MIT License and includes the vendor’s header in place. The rest of ClickTree is released under MIT as well.
