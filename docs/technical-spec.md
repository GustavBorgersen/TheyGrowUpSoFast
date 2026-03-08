# TheyGrowUpSoFast — Technical Spec

## Stack
- **Frontend**: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4
- **Auth + DB**: Supabase (Google OAuth, Postgres, RLS)
- **Storage**: Supabase Storage (`media` bucket, private)
- **Face detection**: `@vladmandic/face-api` + `@tensorflow/tfjs-backend-webgl`
- **Video encoding**: `@ffmpeg/ffmpeg` + `@ffmpeg/core` (WASM, runs in browser)
- **Deployment**: Vercel (free tier)

## Architecture
Everything is client-side processed. No backend workers, no image processing on the server. The Next.js API routes exist only for:
1. `/api/proxy-image` — CORS bypass for Google Photos URLs

## Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

## Critical Headers (next.config.ts)
```
Cross-Origin-Opener-Policy: same-origin-allow-popups
Cross-Origin-Embedder-Policy: require-corp
```
- COEP is required for `SharedArrayBuffer` (FFmpeg WASM multi-threading)
- COOP must be `same-origin-allow-popups` — `same-origin` silently blocks the Google Photos Picker popup

## Data Model
See `supabase/schema.sql` for full DDL + RLS policies.

### ID Design
All storage paths and internal references use our own `id` (UUID), never the provider ID. Google's `source_id` is stored for reference only. This keeps the system source-agnostic.

### Storage Layout
```
media/
  thumbnails/{userId}/{projectId}/{photoId}.jpg   (~10KB, 300px)
  frames/{userId}/{projectId}/{photoId}.jpg       (~200KB, 1080×1350)
```

### Why Pre-Aligned Frames
Google Photos Picker `baseUrl` tokens expire in ~1h and cannot be refreshed via the Library API after March 2025 (confirmed via official Google docs). The `photoslibrary.readonly.appcreateddata` scope only covers app-uploaded photos — it does NOT work for Picker-selected user photos. Pre-aligned frames are derived/processed data. At ~200KB each, 50 photos = ~10MB, comfortable on Supabase 1GB free tier.

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
  1. Downscale to max 800px wide on temp canvas
  2. detectSingleFace().withFaceLandmarks().withFaceDescriptor() — wrapped in tf.tidy()
  3. left eye = avg landmarks[36..41], right eye = avg landmarks[42..47], nose = landmarks[30]
  4. Profile score = |leftDist - rightDist| / max(leftDist, rightDist)
     where leftDist/rightDist = distance from nose tip to each eye center
  5. Identity check (skip on first photo — it becomes the reference)
     Euclidean distance between Float32Arrays — skip if > MATCH_THRESHOLD
  6. angle = atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x)
     scale = TARGET_IPD / hypot(rightEye - leftEye)
     eyeMid = midpoint of eyes
  7. ctx.translate(EYE_X, EYE_Y) → ctx.rotate(-angle) → ctx.scale(scale) → ctx.translate(-eyeMid)
  8. Return { canvas, descriptor, profileScore }
```

**Memory rules**:
- Caller passes one shared `useRef<HTMLCanvasElement>` — never create canvas inside `faceAlign.ts`
- `ctx.clearRect()` before each frame
- Wrap TF detection in `tf.tidy()`
- Downscale on separate small canvas, discard after detection

## useFaceApi Hook (`src/hooks/useFaceApi.ts`)
- Module-level cache: `let faceApiInstance` — loads once per browser session
- useEffect only (module-level import crashes SSR)
- Import `@tensorflow/tfjs-backend-webgl` only (NOT full `@tensorflow/tfjs` — causes backend conflicts)
- Load models sequentially (not parallel — reduces peak memory on mobile)

## useVideoGenerator Hook (`src/hooks/useVideoGenerator.ts`)
- FFmpeg loaded from `public/ffmpeg/` (not CDN — must work under COEP)
- `-movflags +faststart` is critical — moves moov atom to front for browser streaming
- Frames encoded as `frame_%04d.jpg`, cleaned up after encoding

## useGooglePhotosPicker Hook (`src/hooks/useGooglePhotosPicker.ts`)
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
Run as `postinstall` script (see `scripts/copy-ffmpeg.js`).

## Deployment
### Vercel
- Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Headers from `next.config.ts` apply automatically

### Supabase
1. Enable Google OAuth provider
2. Set redirect URL: `https://yourdomain.vercel.app/auth/callback`
3. Apply `supabase/schema.sql`
4. Create `media` bucket (private)
5. Set Storage RLS (see schema.sql comments)

### Google Cloud Console
1. Enable "Google Photos Picker API"
2. Add OAuth scope `photospicker.mediaitems.readonly`
3. Add authorized JS origins + redirect URIs
4. App requires verification for >100 users — includes video demo of Photos usage

## Known Gotchas
1. **COOP = `same-origin-allow-popups`** — not `same-origin`
2. **`provider_token` NOT auto-refreshed** — handle 401s gracefully
3. **Mobile popup blocking** — `window.open()` after any `await` is blocked
4. **face-api in `useEffect` only** — module-level import crashes SSR
5. **`@tensorflow/tfjs-backend-webgl` only** — not full `@tensorflow/tfjs`
6. **Single shared canvas** — new canvas per frame = OOM after ~20 photos on mobile
7. **FFmpeg WASM in `public/ffmpeg/`** — webpack cannot bundle WASM under COEP
8. **`-movflags +faststart`** — required for browser video streaming
9. **Google app verification** — required for >100 users, needs video demo
10. **`photoslibrary.readonly.appcreateddata` does NOT work for Picker photos** — confirmed March 2025
