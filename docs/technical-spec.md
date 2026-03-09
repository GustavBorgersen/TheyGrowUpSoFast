# TheyGrowUpSoFast — Technical Spec

## Stack
- **Frontend**: Next.js 16.1.6 (webpack mode), React 19, TypeScript, Tailwind CSS 4
- **Auth + DB**: Supabase (Google OAuth, Postgres, RLS)
- **Storage**: Supabase Storage (`media` bucket, private)
- **Face detection**: `@vladmandic/face-api` (bundles its own TF — do NOT also import `@tensorflow/tfjs`)
- **Video encoding**: `@ffmpeg/ffmpeg` + `@ffmpeg/core` (WASM, runs in browser)
- **Deployment**: Vercel (free tier)

## Architecture
Everything is client-side processed. No backend workers, no image processing on the server. The Next.js API routes exist only for:
1. `/api/proxy-image` — CORS bypass for Google Photos URLs

## Bundler
Webpack (not Turbopack). Set via `next dev --webpack` and `next build --webpack` in `package.json`.

Turbopack was the default in Next.js 16 but causes two problems:
1. `@vladmandic/face-api` has internal dynamic imports that Turbopack can't handle ("expression too dynamic" error)
2. The `asyncWebAssembly` webpack experiment needed for FFmpeg WASM has no Turbopack equivalent yet

## Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

## Critical Headers (`next.config.ts`)
```
Cross-Origin-Opener-Policy: same-origin-allow-popups
Cross-Origin-Embedder-Policy: require-corp
```
- COEP is required for `SharedArrayBuffer` (FFmpeg WASM multi-threading)
- COOP must be `same-origin-allow-popups` — `same-origin` silently blocks the Google Photos Picker popup

## Data Model
See `supabase/schema.sql` for full DDL + RLS policies.

### Reference Photo Flow
Each project stores:
- `reference_descriptor` (FLOAT8 array) — 128-dim face descriptor used for alignment
- `reference_photo_path` (TEXT) — path to the original reference image in Supabase storage (`references/{userId}/{projectId}/ref.jpg`)

The reference is set once via an explicit "Pick reference photo" step. The original image blob is uploaded to storage on save, and downloaded back when a project is loaded — so the Reference step always shows the stored photo as a large preview. This eliminates:
1. The bug where `let reference = null` in `handleAddPhotos()` caused each batch to align to a different first face
2. The UX gap where loading a project left the Reference step empty with no visible anchor

### Per-Photo Metadata
Each `project_photo` stores:
- `profile_score` (FLOAT8) — how much the face is turned (0 = frontal, 1 = full profile)
- `descriptor` (FLOAT8[]) — the 128-dim face descriptor for future "change reference" feature

Photos are only skipped (not stored) for `no_face` or `identity_mismatch`. Profile filtering happens at generate time via a client-side slider, not at add time.

### ID Design
All storage paths and internal references use our own `id` (UUID), never the provider ID. Google's `source_id` is stored for reference only. This keeps the system source-agnostic.

### Storage Layout
```
media/
  references/{userId}/{projectId}/ref.jpg         (~100–300KB, original image)
  frames/{userId}/{projectId}/{photoId}.jpg        (~150KB, 1080×1350 aligned)
```

### Storage Budget
- Reference photo: ~200KB original image
- Per photo: ~150KB aligned frame ≈ 150KB
- 60 photos: ~10MB per project → ~100 projects per 1GB

### Why Pre-Aligned Frames
Google Photos Picker `baseUrl` tokens expire in ~1h and cannot be refreshed via the Library API after March 2025 (confirmed via official Google docs). The `photoslibrary.readonly.appcreateddata` scope only covers app-uploaded photos — it does NOT work for Picker-selected user photos. Pre-aligned frames are derived/processed data. At ~150KB each, 60 photos = ~10MB, comfortable on Supabase 1GB free tier.

## Face Alignment Algorithm (`src/lib/faceAlign.ts`)
```
Constants (tuned, do not make configurable):
  TARGET_IPD = 220        inter-pupil distance in output pixels
  CANVAS_W = 1080
  CANVAS_H = 1350
  EYE_X = 540             CANVAS_W / 2
  EYE_Y = 513             CANVAS_H * 0.38
  MATCH_THRESHOLD = 0.6   Euclidean descriptor distance
  DETECT_MAX_W = 800      downscale input before detection

Per-photo pipeline:
  1. Downscale to max 800px wide on a temporary canvas
  2. detectSingleFace().withFaceLandmarks().withFaceDescriptor()
     Note: do NOT wrap in tf.tidy() — tidy() is synchronous and cannot await
  3. left eye = avg landmarks[36..41], right eye = avg landmarks[42..47], nose = landmarks[30]
  4. Profile score = |leftDist - rightDist| / max(leftDist, rightDist)
     (all distances measured on the scaled detect canvas)
  5. Identity check (skip on first photo — it becomes the reference)
     Euclidean distance between Float32Arrays — skip if > MATCH_THRESHOLD
  6. angle = atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x)
     scale = TARGET_IPD / hypot(rightEye - leftEye)
     eyeMid = midpoint of eyes (scaled back to original image coordinates)
  7. ctx.translate(EYE_X, EYE_Y) → ctx.rotate(-angle) → ctx.scale(scale) → ctx.translate(-eyeMid)
  8. Return { canvas, descriptor, profileScore }
```

**Memory rules**:
- Caller passes one shared `useRef<HTMLCanvasElement>` — never create canvas inside `faceAlign.ts`
- `ctx.clearRect()` + `fillRect black` before each frame
- Do NOT use `tf.tidy()` with async detection calls — it's synchronous only
- Downscale on a separate small canvas, discard after detection

## `useFaceApi` Hook (`src/hooks/useFaceApi.ts`)
- Module-level cache: `let faceApiInstance` — loads once per browser session
- `useEffect` only (module-level import crashes SSR)
- Import `@vladmandic/face-api` only — it bundles its own TF build
- Do NOT also import `@tensorflow/tfjs-backend-webgl` — causes duplicate kernel registration warnings
- Load models sequentially (not parallel — reduces peak memory on mobile)

## `useVideoGenerator` Hook (`src/hooks/useVideoGenerator.ts`)
- FFmpeg loaded from `public/ffmpeg/` (not CDN — must work under COEP)
- `-movflags +faststart` is critical — moves moov atom to front for browser streaming
- Frames encoded as `frame_%04d.jpg`, cleaned up after encoding
- `ffmpeg.readFile()` returns `FileData` — cast via `as any` before passing to `new Blob()`

## `useGooglePhotosPicker` Hook (`src/hooks/useGooglePhotosPicker.ts`)
- Token: `(await supabase.auth.getSession()).data.session?.provider_token`
- **Mobile popup fix**: `window.open('about:blank')` synchronously BEFORE any await, then navigate after
- `provider_token` is NOT auto-refreshed by Supabase — handle 401s with graceful re-auth banner
- Token expiry: try silent re-auth (`prompt: 'none'`), fall back to `prompt: 'select_account'`
- Poll session every 3s for `mediaItemsSet === true`, timeout after 5 minutes

## Proxy Image Route (`src/app/api/proxy-image/route.ts`)
- POST `{ url, token }`
- Validates URL against `/^https:\/\/(lh\d\.googleusercontent\.com|photos\.googleapis\.com)/`
- Returns 403 for non-Google URLs (prevents arbitrary URL proxying)
- Appends `=d` for direct download, bypasses CORS

## OAuth Config
```typescript
supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: `${origin}/auth/callback`,
    scopes: 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly',
    queryParams: { access_type: 'offline', prompt: 'consent' }
  }
})
```

## FFmpeg Public Files Setup
```bash
cp node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.js public/ffmpeg/
cp node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.wasm public/ffmpeg/
```
Run automatically as `postinstall` script via `scripts/copy-ffmpeg.js`.

## Deployment
### Vercel
- Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Headers from `next.config.ts` apply automatically

### Supabase
1. Enable Google OAuth provider (Client ID + Secret from Google Cloud Console)
2. Set redirect URL: `https://yourdomain.vercel.app/auth/callback`
3. Apply `supabase/schema.sql`
4. Create `media` bucket (private)
5. Set Storage RLS (see schema.sql comments — includes `references/` folder INSERT policy)

### Google Cloud Console
1. Create project (or use existing)
2. Enable **Google Photos Picker API**
3. Configure OAuth consent screen (External, add test users while in Testing mode)
4. Add OAuth scope: `https://www.googleapis.com/auth/photospicker.mediaitems.readonly`
5. Create OAuth 2.0 credentials (Web application type)
6. Add authorized JS origins: `https://yourdomain.vercel.app` (+ `http://localhost:3000` for dev)
7. Add redirect URI: `https://<your-supabase-project>.supabase.co/auth/v1/callback`
   (Supabase handles the OAuth redirect, not your app directly)
8. App requires verification for >100 users — includes video demo of Photos usage per Google policy

## Known Gotchas
1. **COOP = `same-origin-allow-popups`** — not `same-origin`
2. **`provider_token` NOT auto-refreshed** — handle 401s gracefully
3. **Mobile popup blocking** — `window.open()` after any `await` is blocked
4. **face-api in `useEffect` only** — module-level import crashes SSR
5. **`@vladmandic/face-api` only** — do not import `@tensorflow/tfjs` or `@tensorflow/tfjs-backend-webgl` alongside it
6. **`tf.tidy()` is synchronous** — cannot `await` inside it; face-api handles its own tensor cleanup
7. **Single shared canvas** — new canvas per frame = OOM after ~20 photos on mobile
8. **FFmpeg WASM in `public/ffmpeg/`** — webpack cannot bundle WASM under COEP
9. **`-movflags +faststart`** — required for browser video streaming
10. **Google app verification** — required for >100 users, needs video demo
11. **`photoslibrary.readonly.appcreateddata` does NOT work for Picker photos** — confirmed March 2025
12. **Turbopack incompatible** — use `--webpack` flag for both dev and build
