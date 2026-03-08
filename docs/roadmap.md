# TheyGrowUpSoFast — Roadmap

## MVP Learnings (from `/mnt/c/Users/zealotry/source/repos/ideas/ideas/TheyGrowUpSoFast`)

### What worked
- Face alignment algorithm is solid — eyes are level and centered across all frames
- WebGL backend for face-api is fast enough on desktop
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
Config, types, DB schema, Supabase auth plumbing, docs

### Phase 2 — Core Engine ✅
`faceAlign.ts`, `useFaceApi.ts`, `useVideoGenerator.ts`, model files

### Phase 3 — Landing + Guest Mode ✅
Landing page, guest flow, ProcessingView, VideoPlayer

### Phase 4 — Auth + Dashboard ✅
Login, OAuth callback, dashboard, proxy-image, useGooglePhotosPicker

### Phase 5 — Project Processing ✅
Project detail page, PhotoGrid, full add/generate flow, persistence

### Phase 6 — Mobile Polish + Error Handling ✅
Error boundaries, SharedArrayBuffer check, iOS video fixes, exponential backoff

### Phase 7 — Deployment ✅
Vercel env vars, Supabase Google OAuth, storage RLS, Google Cloud Console

## Decision Log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-03 | Rebuild from scratch | MVP code too messy to iterate; wrong DB schema |
| 2026-03 | Pre-aligned frames storage | Google Photos URL refresh impossible post-March 2025 |
| 2026-03 | No monorepo | Flat Next.js is simpler; no need for turborepo overhead |
| 2026-03 | Guest mode first | Lowers barrier; proves value before requiring sign-in |
| 2026-03 | Paid mode deferred | Free tier covers MVP; add payments when there's demand |
