# TheyGrowUpSoFast — Functional Spec

## What it does
Upload photos of a person over time → get a timelapse video where their face stays perfectly centered and level in every frame. Processed entirely in your browser. Nothing uploaded to any server (except when you're logged in and want to save your project).

## Modes

### Guest Mode (no account required)
- Upload photos from your device (drag-drop or file picker)
- Photos sorted by file modification date (oldest first)
- Face detection and alignment runs in-browser
- Download the MP4 when done
- Nothing stored server-side

**First-photo rule** (shown prominently on first step): *"The first photo sets the face. Upload your oldest photo first."*

### Free Account (Google sign-in)
- Sign in with Google
- Create named projects
- Pick photos from Google Photos using the Google Photos Picker
- Photos are processed in-browser; aligned frames stored in Supabase
- Close the browser, come back next week — project is still there, video still generates
- Add more photos to a project over time

### Paid (future)
- Not implemented in V1

## User Flows

### Guest Flow
1. Land on `/` — hero with CTA "Try it free →" → `/guest`
2. Drag or select photos (multiple accepted, `image/*`)
3. Processing: models load, faces detected/aligned one at a time
4. Progress UI: step label + frame N/M bar + rejected count with reasons
5. Done: video player appears with download button
6. CTA: "Save your projects" sign-up prompt

### Logged-in Flow
1. Sign in with Google at `/login`
2. Dashboard at `/dashboard` — list of projects, "New project" button
3. New project modal: enter name → create row → redirect to `/project/[id]`
4. Project page: "Add Photos" → Google Photos Picker opens
5. Photos processed in batches of 3 — thumbnails appear as they complete
6. Skipped photos show skip reason badge
7. "Generate Video" → downloads MP4
8. Project persists; return anytime, regenerate without re-picking

## UX Rules
- Touch targets ≥ 44×44px
- `loading="lazy"` on all thumbnails
- Warn if >100 photos uploaded on mobile
- Browser compatibility warning if `SharedArrayBuffer` unavailable (Firefox without HTTPS, older browsers)
- Video player uses `<video playsinline muted controls>` (iOS requires `playsinline`)
- Accepted/rejected count shown at end of processing
- Rejected photos: show reason ('profile_angle', 'identity_mismatch', 'no_face')

## Source Rules (V1)
- A project is either Google Photos or local files — not both
- Enforced at the UI level with clear messaging
- Mixed sources are a future paid feature

## Copy
- Hero: "Watch them grow — one photo at a time"
- How it works: 3 steps (Upload → Align → Download)
- First-photo warning: "The first photo sets the face. Upload your oldest photo first."
- Token expiry banner: "Google Photos access expired — click to reconnect"
