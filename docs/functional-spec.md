# TheyGrowUpSoFast — Functional Spec

## What it does
Upload photos of a person over time → get a timelapse video where their face stays perfectly centered and level in every frame. Processed entirely in your browser. Nothing uploaded to any server (except when you're logged in and want to save your project).

## Modes

### Guest Mode (no account required)
1. Upload photos from your device (drag-drop or file picker, multiple selection)
2. Photos sorted by file modification date (oldest first) automatically
3. Thumbnail grid shows uploaded photos — hover to remove individual ones
4. Add more photos at any time before generating
5. Click "Generate timelapse" → face detection + alignment runs in-browser → MP4 downloads
6. After generating: photos stay visible, skipped photos shown with reason badge on thumbnail
7. Add more photos and regenerate at any time (video overwrites)
8. Nothing stored server-side

**First-photo rule** (shown prominently): *"The oldest photo sets the reference face. Make sure it has one face clearly visible and looking at the camera."*

**Skip indicators on thumbnails**: skipped photos show faded opacity + label (`No face`, `Wrong person`). Profile-filtered photos show amber "Filtered" badge. Profile scores shown as percentage overlay on all thumbnails.

### Free Account (Google sign-in)
- Sign in with Google
- Create named projects
- Pick photos from Google Photos using the Google Photos Picker
- Photos processed in-browser; aligned frames stored in Supabase
- Close the browser, come back next week — project is still there, video still generates
- Add more photos to a project over time
- Inline project rename, remove individual photos, delete project

### Paid (future)
- Not implemented in V1

## User Flows

### Guest Flow
1. Land on `/` — hero with CTA "Try it free →" → `/guest`
2. Drag or select photos (multiple accepted, `image/*`)
3. Thumbnails appear immediately, sorted oldest first
4. Remove unwanted photos by hovering and clicking X
5. Click "Generate timelapse (N photos)"
6. Progress: step label + frame N/M progress bar
7. Done: video player appears with download button; skipped photos marked on grid
8. Add more photos → "Regenerate" → video overwrites
9. CTA: "Save your projects" sign-up prompt

### Logged-in Flow
1. Sign in with Google at `/login`
2. Dashboard at `/dashboard` — list of projects, "New project" button
3. New project: enter name → create row → redirect to `/project/[id]`
4. Project page starts in "no reference" state — user picks a single reference photo from a grid
5. After picking, Reference step shows the photo as a large preview (with "Change" button to re-pick)
6. On save: reference photo blob uploaded to storage; descriptor + path saved to DB
7. On load: reference photo downloaded and shown in the Reference step immediately
8. "Add Photos" → Google Photos Picker opens → batch processed against reference descriptor
9. All matching faces stored (including profiles) — only no-face and identity-mismatch skipped
10. Profile filter slider controls which photos are included at generate time
11. "Generate Video (N photos)" → encodes only photos passing the current filter
12. Add more photos across sessions — reference stays consistent (loaded from DB, never resets)
13. Adjust filter and re-generate without re-downloading or re-aligning

## UX Rules
- Touch targets ≥ 44×44px
- `loading="lazy"` on all thumbnails
- Warn if >100 photos uploaded on mobile
- Browser compatibility warning for SharedArrayBuffer shown only if encoding actually fails
- Video player uses `<video playsinline muted controls>` (iOS requires `playsinline`)
- Skipped photos indicated inline on thumbnail grid (not in a separate list)
- Photos persist after generation so user can add more and regenerate

## Source Rules (V1)
- A project is either Google Photos or local files — not both
- Enforced at the UI level with clear messaging
- Mixed sources are a future paid feature

## Copy
- Hero: "Watch them grow — one photo at a time"
- How it works: 3 steps (Upload → Align → Download)
- Reference prompt: "Pick a reference photo to set the anchor face. All other photos will be aligned to match it."
- First-photo warning (guest): "The oldest photo sets the reference face. Make sure it has one face clearly visible and looking at the camera."
- Token expiry banner: "Google Photos access expired — click to reconnect"
