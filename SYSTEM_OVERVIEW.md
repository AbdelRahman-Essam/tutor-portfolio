# Tutor Portfolio System — Overview

A pipeline that turns a Google Form response sheet (one row per tutor) into a
static, per-tutor portfolio website. No backend server, no database, no
build framework — a Google Sheet, two Node scripts, and plain HTML/CSS/JS.

```
Google Sheet (Form responses + admin columns)
        │  admin: File → Download → Comma-separated values (.csv)
        ▼
data/raw/tutors.csv
        │  node scripts/sync.js
        ▼
data/tutors/<profileKey>.json   (one file per Approved tutor)
data/index.json                 (directory listing: Approved + Public only)
        │  node scripts/build-site.js
        ▼
site/index.html                 (directory page, client-side search)
site/tutors/<profileKey>/index.html   (one static page per tutor)
```

No live calls to Google from the website — the sync step is the only thing
that ever touches the sheet, and it's run manually whenever the admin wants
to publish updates.

---

## 1. Why this shape (decisions made along the way)

| Question | Decision | Why |
|---|---|---|
| How does the sync script get sheet data? | **Manual CSV export**, not the Sheets API | No service-account/credential setup to maintain; fine at tutor-directory scale. Swappable later — only the "read raw rows" step would change. |
| Frontend stack? | **Plain HTML/CSS/JS** + a small Node build script | No framework/build-tool overhead; scripts just read JSON and print HTML strings. |
| Admin approval / publishing control? | **New columns on the same response sheet**: `Status`, `Featured`, `Admin Notes` | Keeps everything in one place the admin already has open; no second sheet to keep in sync. |
| Media (photos, certs, videos) | **Fully embedded**, no bare "click to view" links; supports **both YouTube and Google Drive** per video slot | Sheet's own "Video — Type" field allows either source; tutors' Drive files are already shared as viewable. |
| Only `Approved` rows get published; only `Approved + Public` show in the directory | Lets an admin stage/reject a tutor without deleting their row. |

---

## 2. The Google Sheet — columns

The form produces one flat row per tutor. Fixed slots: **5 video slots**,
**7 certificate slots** (Option A from the original spec — simpler than
dynamically-linked sheets, at the cost of a hard cap per tutor).

Raw form columns (in order): `Timestamp`, `Email Address`, `Full Name`,
`Professional Title`, `Profile Photo`, `Preferred Profile Key`,
`Professional Summary`, `Teaching Philosophy`, `Teaching Specializations`,
`Student Age Groups`, `Student Levels`, `Teaching Format`,
`Years of Teaching Experience`, `Teaching Experience`, `Current Availability`,
`Languages You Can Communicate/Teach In`, `English Proficiency`,
`Other Language Proficiency`, `Teaching & Technology Skills`,
`Professional Email`, `WhatsApp Number`, `Phone Number`, `Telegram`,
`Facebook`, `Instagram`, `LinkedIn`, `Personal Website`,
then for **each** of Video 1–5: `Video N — Title`, `— Type`, `— Description`,
`— YouTube/GoogleDrive URL`, `Do you want to add another Video`,
then for **each** of Certificate 1–7: `Certificate N — Name`,
`— Issuing Organization`, `— Date`, `— Description`, `— File`,
`Do you want to add another Certificate?`,
then `Preferred Profile Theme`, `Profile Visibility`, `Publication Consent`,
`Information Accuracy`.

### Admin columns to add (not part of the original form)
Add these as extra columns at the end of the same sheet:

| Column | Values | Purpose |
|---|---|---|
| `Status` | `Approved` / `Pending` / `Rejected` / `Hidden` | Only `Approved` rows get a JSON file written at all. |
| `Featured` | `Yes` / `No` | Featured tutors sort first and get a highlighted card in the directory. |
| `Admin Notes` | free text | Private — read by the sync script but **never** written into the public JSON. |

Tutors can also self-serve one piece of admin control: **`Preferred Profile
Key`** — if two tutors' names would collide, or a tutor wants a specific
URL slug, edit that cell.

---

## 3. Data cleaning rules the sync script applies

- **Multi-value fields** (`Teaching Specializations`, `Student Age Groups`,
  `Student Levels`, `Teaching Format`, `Languages...`, `Teaching &
  Technology Skills`) are comma-separated in the sheet → split into arrays.
- **Language proficiency**: `English Proficiency` is its own column;
  `Other Language Proficiency` is freeform (e.g. `"Arabic — Native"`) →
  parsed into `{ language, proficiency }` pairs. Any language listed
  without an explicit level still appears, just without a `proficiency`.
- **Profile key / slug**: derived from `Preferred Profile Key` if present,
  else slugified from `Full Name`. Collisions are auto-resolved
  (`name`, `name-2`, `name-3`, …) and logged as a warning — fix by editing
  `Preferred Profile Key` in the sheet.
- **Empty fields are dropped entirely**, not rendered as empty strings/dashes
  — e.g. a tutor with no `Personal Website` simply has no `website` key and
  no "Website" contact chip.
- **Video/certificate slots**: only slots with an actual URL (video) or
  name+file (certificate) are kept; empty slots are skipped, not padded.
- **Media normalization**: both YouTube and Google Drive URLs are detected
  and converted into one unified shape so the frontend never special-cases
  the source:
  - YouTube (`watch?v=`, `youtu.be/`, `/embed/`, `/shorts/`) → `youtube.com/embed/<id>`
  - Google Drive (`/d/<id>/`, `?id=<id>`) →
    - images (profile photo): `drive.google.com/thumbnail?id=<id>&sz=w1000`
      (more reliable for hotlinking than the older `uc?export=view` form,
      which frequently gets blocked by a virus-scan interstitial)
    - videos/certificate files: `drive.google.com/file/d/<id>/preview`
      (iframe embed — works for Drive-hosted videos, PDFs, and images alike)
  - Unrecognized URLs are **dropped, not guessed at**, and logged as a
    warning so a broken embed never reaches the site.

---

## 4. Output JSON shape (`data/tutors/<key>.json`)

```jsonc
{
  "id": "a1b2c3d4e5f6",              // stable hash of email (or name+timestamp)
  "profileKey": "ahmed-mohamed",     // used in the URL: /tutors/ahmed-mohamed/
  "status": "Approved",
  "visibility": "public",            // public | unlisted
  "featured": true,

  "personal": {
    "name": "Ahmed Mohamed",
    "title": "English & Islamic English Tutor",
    "photo": { "provider": "drive", "id": "...", "embedUrl": "https://drive.google.com/thumbnail?id=...&sz=w1000" },
    "summary": "...",
    "theme": "emerald"
  },

  "teaching": {
    "specializations": ["General English", "Conversational English", "..."],
    "ageGroups": ["Children", "Teenagers", "Adults"],
    "levels": ["Beginner", "Elementary", "Intermediate", "Upper Intermediate"],
    "format": ["Online"],
    "availability": "Accepting new students",
    "experienceYears": "5",
    "experienceDescription": "...",
    "philosophy": "..."
  },

  "languages": [
    { "language": "English", "proficiency": "Fluent" },
    { "language": "Arabic", "proficiency": "Native" }
  ],
  "technicalSkills": ["Zoom", "Google Meet", "..."],

  "videos": [
    { "title": "About Me", "description": "...", "provider": "youtube", "id": "3QYC2oXTdUA", "embedUrl": "https://www.youtube.com/embed/3QYC2oXTdUA" },
    { "title": "Sample English Lesson", "description": "...", "provider": "drive", "id": "...", "embedUrl": "https://drive.google.com/file/d/.../preview" }
  ],

  "certificates": [
    { "name": "TESOL Certificate", "organization": "International TESOL Institute", "date": "6/11/2024", "description": "...", "file": { "provider": "drive", "id": "...", "embedUrl": "https://drive.google.com/file/d/.../preview" } }
  ],

  "contacts": {
    "email": "ahmed.tutor@example.com",
    "whatsapp": "+201012345678",
    "phone": "+201012345678",
    "telegram": "@ahmedtutor",
    "facebook": "https://facebook.com/ahmed.tutor",
    "instagram": "https://instagram.com/ahmed.tutor",
    "linkedin": "https://linkedin.com/in/ahmed-tutor"
  }
}
```

`_admin` (submission timestamp + admin notes) exists internally during sync
but is **stripped** before the file is written — it never reaches disk in
the public JSON.

`data/index.json` is a lighter version for the directory page: `profileKey`,
`featured`, `name`, `title`, `photo`, `summary`, `theme`, and the teaching
tag lists — only for tutors that are both `Approved` and `Public`.

---

## 5. The frontend

- **Directory page** (`site/index.html`): card grid, one card per public
  tutor, text search over name/title only (v1 scope — filters by
  specialization/age/level were deferred).
- **Profile page** (`site/tutors/<key>/index.html`), section order:
  1. Header — photo (in a geometric corner-frame), name, title, summary
  2. Teaching Profile — labeled groups: Specializations / Age Groups / Levels / Format
  3. Videos — embedded iframes, YouTube or Drive
  4. Teaching Experience
  5. Languages
  6. Technical Skills
  7. Teaching Philosophy
  8. Certificates — card grid; **two display modes are currently both wired
     up behind a demo toggle** (inline expand-panel vs. modal/lightbox) so a
     final choice can be made by trying both. Once decided, the losing
     mode's markup/CSS/JS should be deleted.
  9. Contact — chip row with small inline SVG icons (email, WhatsApp, phone,
     Telegram, Facebook, Instagram, LinkedIn, website), at the very end of
     the page.
- **Empty sections never render** — e.g. a tutor with no certificates has no
  "Certificates" heading at all, not an empty one.

### Design system
One shared base palette, only the **accent** changes per tutor's chosen
theme (`Preferred Profile Theme` in the sheet):

| Theme | Accent |
|---|---|
| emerald | `#0E6B4F` |
| deepblue | `#1E3A5F` |
| teal | `#0B6E77` |
| burgundy | `#7A2333` |
| sand | `#A9772F` |
| purple | `#5B3170` |
| dark | flips paper/ink to dark, accent `#C79A4B` |

Base tokens: paper `#F2EDE3`, ink `#211D17`, muted text `#55524A`, hairline
`rgba(27,22,15,0.14)`. Type: **Fraunces** (display/serif) + **IBM Plex Sans**
(body). One deliberate ornamental element (a thin geometric ring around the
profile photo) — everything else is flat, hairline-bordered, no shadows.

---

## 6. Project structure

```
tutor-portfolio/
├── data/
│   ├── raw/tutors.csv        ← replace with your real sheet export
│   ├── tutors/*.json         ← generated, one per Approved tutor
│   └── index.json            ← generated directory listing
├── scripts/
│   ├── csv.js                ← dependency-free CSV parse/stringify
│   ├── sync.js                ← CSV → per-tutor JSON (the normalization logic)
│   ├── build-site.js          ← JSON → static HTML site
│   └── make-fixture.js        ← (dev only) regenerates the sample CSV used for testing
└── site/
    ├── assets/{styles.css, site.js}
    ├── index.html              ← generated
    └── tutors/<key>/index.html ← generated
```

### Running it
```bash
# 1. Export the sheet: File → Download → Comma-separated values (.csv)
#    Save it as data/raw/tutors.csv

node scripts/sync.js        # CSV → data/tutors/*.json + data/index.json
node scripts/build-site.js  # JSON → site/index.html + site/tutors/<key>/index.html
```
Re-run both any time the sheet changes and a new export is dropped in.

---

## 7. The example/test data used

Two fixture rows (`scripts/make-fixture.js` generates `data/raw/tutors.csv`
from these) were used to exercise the pipeline end to end:

- **Ahmed Mohamed** — full row: photo (Drive), 2 YouTube videos + 1 Drive
  video, 3 certificates (Drive files), full contact set, both an English and
  an Arabic language entry, `Status = Approved`, `Featured = Yes`. This is
  the sample row from the actual Google Sheet you shared — note its media
  IDs/URLs appear to be **placeholder/example data** (the YouTube video ID
  in particular doesn't resolve to any indexed real video), so use it to
  confirm the *pipeline and markup* work, not as proof a specific real
  video will play — that needs testing with one real tutor's real link.
- **Sarah Ahmed** — deliberately sparse: only name, title, photo, summary,
  one specialization, contact email, `Status = Pending`. Used to confirm
  (a) a `Pending` tutor is correctly excluded from output entirely, and
  (b) missing fields (languages, videos, certificates, most contacts, etc.)
  correctly produce no section at all rather than an empty/broken one.

Only Ahmed ends up published; Sarah is present in the CSV but absent from
both `data/tutors/` and `data/index.json`, which is the intended behavior
for a `Pending` row.

---

## 8. Known open items / next decisions

- **Certificate display mode**: inline-expand vs. lightbox — still an open
  choice (both implemented behind a toggle for comparison).
- **Directory filtering**: currently text search only; specialization/
  age-group/level filters were scoped out of v1 but the data
  (`teaching.specializations`, `.ageGroups`, `.levels`, `.format`) is
  already present in both the tutor JSON and the directory index if you
  want to add them later.
- **Real media validation**: everything above has been validated against
  the *shape* of a real Drive/YouTube URL, but not against a guaranteed
  working real-world video/photo, since the current sample sheet's video
  link doesn't correspond to a discoverable real video. Test with one real
  tutor before wider rollout.
- **Sheets API automation**: if manual CSV export becomes a bottleneck,
  swapping `sync.js`'s file-read step for a Sheets API call is the only
  change needed — the normalization logic downstream is unaffected.
