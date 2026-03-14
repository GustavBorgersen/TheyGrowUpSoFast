# TheyGrowUpSoFast — Roadmap

## MVP Learnings (from original monorepo)

### What worked
- Face alignment algorithm is solid — eyes level and centered across all frames
- WASM backend for face-api gives deterministic results across desktop and mobile
- FFmpeg WASM encoding works reliably in the browser
- Google Photos Picker flow is smooth on desktop
- Supabase Auth + Google OAuth works well

### What was messy
- Stale DB columns (some never used)
- `any`-typed throughout
- No mobile support (popup blocking, OOM on mobile)
- No landing page — jumped straight to processing
- Expired URL bug: stored Google Photos URLs, then they expired after ~1h
- No guest mode — required Google sign-in for everything

### Key Decision: Pre-aligned Frames
After March 2025, Google deprecated all approaches to refreshing Picker URLs:
- `photoslibrary.readonly.appcreateddata` only covers app-uploaded photos
- No way to get fresh download URLs from stored photo IDs after session expiry
- Official Google docs confirm this is intentional

**Resolution**: Store pre-aligned frames (derived data) instead of source URLs.
At ~200KB per frame, 50 photos = ~10MB. Comfortable on Supabase 1GB free tier.

## Phases

### Phase 1 — Foundation ✅
Config, types, DB schema, Supabase auth plumbing, docs.

### Phase 2 — Core Engine ✅
`faceAlign.ts`, `useFaceApi.ts`, `useVideoGenerator.ts`, model files.

Key fix discovered: `tf.tidy()` cannot wrap async detection calls — removed it.
Key fix discovered: Do not import `@tensorflow/tfjs-backend-webgl` alongside face-api — duplicate kernel registrations.
Key fix discovered: Turbopack incompatible with face-api dynamic imports — forced `--webpack`.
Key fix discovered: WebGL produces different face landmarks on mobile vs desktop GPUs — switched to WASM backend.
Key fix discovered: face-api's bundled ESM build inlines TF.js — must use nobundle build (`face-api.esm-nobundle.js`) via webpack alias so separately-imported backends share the same TF instance.

### Phase 3 — Landing + Guest Mode ✅
Landing page, guest flow, ProcessingView, VideoPlayer.

Guest flow improvements over original plan:
- Upload photos first → thumbnails shown immediately
- Add/remove photos before generating
- "Generate" button is explicit user action
- Skipped photos shown inline on thumbnail grid (red ring + label), not in a separate dropdown
- Photos persist after generation for easy add-more + regenerate workflow

### Phase 4 — Auth + Dashboard 🔲
Login, OAuth callback, dashboard, proxy-image, useGooglePhotosPicker.

**Current blocker**: Google Cloud Console + Supabase OAuth setup needed before this can be tested.

### Phase 5 — Project Processing ✅
Project detail page with explicit reference photo step, PhotoGrid with filter controls, full add/generate flow with persistent reference descriptor.

Key design: "Explicit Reference → Store Aligned → Filter at Generate"
- Step 1: User picks a single reference photo → descriptor saved to `projects.reference_descriptor`
- Step 2: Add photos in batches → all matching faces stored with `profile_score` + `descriptor` (no profile filtering at add time)
- Step 3: Generate video with profile filter slider → only passing photos included
- Reference stays consistent across sessions (loaded from DB, not reset per batch)

### Phase 6 — Mobile Polish + Error Handling 🔲
Error boundaries, iOS video fixes, exponential backoff on uploads.

### Phase 7 — Deployment 🔲
Vercel env vars, Supabase Google OAuth, storage RLS, Google Cloud Console verification.

## Decision Log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-03 | Rebuild from scratch | MVP code too messy to iterate; wrong DB schema |
| 2026-03 | Pre-aligned frames storage | Google Photos URL refresh impossible post-March 2025 |
| 2026-03 | No monorepo | Flat Next.js is simpler; no need for turborepo overhead |
| 2026-03 | Guest mode first | Lowers barrier; proves value before requiring sign-in |
| 2026-03 | Paid mode deferred | Free tier covers MVP; add payments when there's demand |
| 2026-03 | Force webpack (not Turbopack) | face-api dynamic imports incompatible with Turbopack |
| 2026-03 | Remove tf.tidy() from async detection | tidy() is synchronous — cannot await inside it |
| 2026-03 | Switch to WASM backend | WebGL non-deterministic across GPUs — mobile alignment completely broken |
| 2026-03 | Use face-api nobundle build | Bundled build inlines TF.js; separate WASM import registered on wrong instance |
| 2026-03 | Reference photo downscaled to match alignment | Descriptor computed at different resolution caused identity mismatches |
| 2026-03 | Skip indicators on thumbnails | Cleaner than a separate skipped-photos dropdown |
| 2026-03 | Upload-then-generate UX | Better than processing on drop; lets user review before committing |
| 2026-03 | Explicit reference photo step | Fixes batch-reset bug: `let reference = null` in each `handleAddPhotos()` call caused alignment drift |
| 2026-03 | Store all faces, filter at generate | Profiles/angled photos are still aligned and stored — user filters them with a slider at generate time |
| 2026-03 | Per-photo descriptor + profile_score | Enables future "change reference" feature and client-side filtering without re-downloading |
