const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
fs.cpSync(
  path.join(root, "node_modules/@excalidraw/excalidraw/dist/prod/fonts"),
  path.join(root, "public/excalidraw-assets/fonts"),
  { recursive: true },
);
