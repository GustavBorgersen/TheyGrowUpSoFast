const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', '@ffmpeg', 'core', 'dist', 'umd');
const dest = path.join(__dirname, '..', 'public', 'ffmpeg');

if (!fs.existsSync(src)) {
  console.log('[copy-ffmpeg] @ffmpeg/core not found, skipping.');
  process.exit(0);
}

fs.mkdirSync(dest, { recursive: true });

for (const file of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  const srcFile = path.join(src, file);
  const destFile = path.join(dest, file);
  if (fs.existsSync(srcFile)) {
    fs.copyFileSync(srcFile, destFile);
    console.log(`[copy-ffmpeg] Copied ${file}`);
  }
}
