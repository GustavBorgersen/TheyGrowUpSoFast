const fs = require('fs');
const path = require('path');

// --- FFmpeg files ---
const ffmpegSrc = path.join(__dirname, '..', 'node_modules', '@ffmpeg', 'core', 'dist', 'umd');
const ffmpegDest = path.join(__dirname, '..', 'public', 'ffmpeg');

if (fs.existsSync(ffmpegSrc)) {
  fs.mkdirSync(ffmpegDest, { recursive: true });
  for (const file of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
    const srcFile = path.join(ffmpegSrc, file);
    const destFile = path.join(ffmpegDest, file);
    if (fs.existsSync(srcFile)) {
      fs.copyFileSync(srcFile, destFile);
      console.log(`[postinstall] Copied ${file}`);
    }
  }
} else {
  console.log('[postinstall] @ffmpeg/core not found, skipping.');
}

// --- TF.js WASM files ---
const wasmSrc = path.join(__dirname, '..', 'node_modules', '@tensorflow', 'tfjs-backend-wasm', 'dist');
const wasmDest = path.join(__dirname, '..', 'public', 'wasm');

if (fs.existsSync(wasmSrc)) {
  fs.mkdirSync(wasmDest, { recursive: true });
  for (const file of [
    'tfjs-backend-wasm.wasm',
    'tfjs-backend-wasm-simd.wasm',
    'tfjs-backend-wasm-threaded-simd.wasm',
  ]) {
    const srcFile = path.join(wasmSrc, file);
    const destFile = path.join(wasmDest, file);
    if (fs.existsSync(srcFile)) {
      fs.copyFileSync(srcFile, destFile);
      console.log(`[postinstall] Copied ${file}`);
    }
  }
} else {
  console.log('[postinstall] @tensorflow/tfjs-backend-wasm not found, skipping.');
}
