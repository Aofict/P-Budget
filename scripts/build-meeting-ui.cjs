// Isolate daisyUI's border-width token from the legacy app's --border color.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'meeting-app/assets/daisyui.css');
const result = spawnSync(process.execPath, [
  path.join(root, 'node_modules/@tailwindcss/cli/dist/index.mjs'),
  '-i', './meeting-app/ui/daisyui.css', '-o', output, '--minify'
], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
const css = fs.readFileSync(output, 'utf8');
fs.writeFileSync(output, css.replace(/--border(?![\w-])/g, '--du-border-width'));
