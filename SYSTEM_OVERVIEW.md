# Profile Portfolio System — Overview

A pipeline that turns **multiple Google Form response sheets** (currently a
tutor form and a professional/engineering form, more can be added) into one
static, per-profile website. No backend server, no database, no build
framework — Google Sheets, a handful of Node scripts, and plain HTML/CSS/JS.

```
Google Sheet A (Tutor form)         Google Sheet B (Professional form)   ...
        │  admin: File → Download → CSV              │
        ▼                                             ▼
data/raw/tutors.csv                          data/raw/professionals.csv   (any number of .csv files)
        │
        │  node scripts/sync.js
        │    1. read every .csv in data/raw/
        │    2. detect which form schema each file matches
        │    3. map every row into ONE unified profile shape
        ▼
data/profiles/<profileKey>.json   (one file per Approved profile, any kind)
data/index.json                   (directory listing: Approved + Public only)
        │  node scripts/build-site.js
        ▼
site/index.html                   (directory page, client-side search)
site/p/<profileKey>/index.html    (one static page per profile)
```

No live calls to Google from the website — the sync step is the only thing
that ever touches a sheet, and it's run manually whenever an admin wants to
publish updates from a fresh export.

---

## 1. Multi-form architecture

### Adding a new CSV
Just drop it into `data/raw/`. `sync.js` reads **every** `.csv` file in that
folder, independently, in the same run — you are not limited to one file
per kind, and you don't tell the script which schema a file uses. Each
file's header row is inspected and matched against a list of known schemas:

```js
// scripts/lib/schema.js
const tutorSchema = {
  kind: 'tutor',
  detect: (headers) => headers.some(h => /Teaching Specializations/i.test(h)) || ...,
  map(row, warn) { ... }
};

const professionalSchema = {
  kind: 'professional',
  detect: (headers) => headers.some(h => /Profession \/ Career Field/i.test(h)) || ...,
  map(row, warn) { ... }
};

const SCHEMAS = [tutorSchema, professionalSchema];
```

Each schema has a `detect(headers)` (a cheap "does this file look like me"
check based on a couple of column names unique to that form) and a
`map(row, warn)` that turns one raw row into that schema's slice of the
unified profile object. If a CSV's headers don't match any known schema,
sync.js logs a warning and skips that file entirely (nothing crashes, no
profiles are half-written).

**To add a third form** (say, a "Business/Service Provider" form): write a
third schema object with its own `detect`/`map` in `scripts/lib/schema.js`,
add it to the `SCHEMAS` array, and add a matching profile-page renderer
branch in `build-site.js` (see §5). No changes needed to `sync.js` itself,
the CSV parser, or the directory page.

### Every profile carries a `kind`
The unified profile JSON always has a top-level `"kind"` (`"tutor"` or
`"professional"` today). The site builder renders a different set of
sections depending on `kind` — see §6 — but both kinds share the same
outer shell: header photo, contact section at the end, same theme system,
same media embedding rules.

---

## 2. The duplicate-header trap (and how it's handled)

The professional form's certificate slots 4–7 are **not** named
`Certificate 4 — Name`, `Certificate 5 — Name`, etc. — Google Forms
exported them as the exact same literal header text for every slot past 3:

```
Certificate — Name   Certificate — Issuing Organization   Certificate — Date  ...   (slot 4)
Certificate — Name   Certificate — Issuing Organization   Certificate — Date  ...   (slot 5)
Certificate — Name   Certificate — Issuing Organization   Certificate — Date  ...   (slot 6)
Certificate — Name   Certificate — Issuing Organization   Certificate — Date  ...   (slot 7)
```

`Do you want to add another Video` and `Do you want to add another
Certificate?` repeat the same way across every slot.

A parser that looks values up **by header name** (`row['Certificate — Name']`)
silently keeps only the *last* matching column and loses slots 4–6 entirely.
This bit us on the first version of the pipeline and was caught by manually
counting certificates in the output against the sheet.

**Fix — parse positionally, not by name.** `scripts/lib/parse.js` provides
a `Row` class that wraps `(headers, cells)` and an `extractSlots()` helper:

```js
function extractSlots(row, anchorRe, fieldRes) {
  const anchors = row.indicesMatching(anchorRe);   // e.g. every "Certificate...Name" column INDEX
  const slots = [];
  anchors.forEach((start, n) => {
    const end = n + 1 < anchors.length ? anchors[n + 1] : row.headers.length;
    // scan only [start, end) for this slot's other fields, so identical
    // header text in a later slot can never leak into an earlier one
    ...
  });
  return slots;
}
```

Each slot's "anchor" column (`...Name` for certificates, `...Title` for
videos) marks where that slot starts; the next anchor marks where it ends.
Every other field for that slot (organization, date, description, file) is
found by scanning only within that window, by regex on the header text, not
by exact-name lookup. This works correctly however many times a header
string repeats. Verified against the real sheet: all **7** certificates and
all **5** videos come through, in order.

This is also why `Row.get(name)` (used for one-off fields like `Full Name`
or `Professional Title`, which only ever appear once) is explicitly a
*different, simpler* code path from `extractSlots()` — using name lookup
for genuinely-unique columns is fine and simpler; the slot extractor is
only for the parts of the sheet that repeat.

---

## 3. Admin columns

Both forms now carry the same four admin columns, appended after the form's
own questions (added manually in the sheet, not part of the original form
design):

| Column | Values | Purpose |
|---|---|---|
| `Status` | `Approved` / `Pending` / `Rejected` / `Hidden` | Only `Approved` rows get a JSON file written at all. |
| `Featured` | `Yes` / `No` | Featured profiles sort first and get a highlighted card in the directory. |
| `Profile Key` | free text (slug) | **Admin override** of the URL slug — takes priority over the submitter's own `Preferred Profile Key`, which in turn takes priority over an auto-slugified name. Use this to resolve a collision without touching the submitter's answer. |
| `Admin Notes` | free text | Private — read by the sync script but **never** written into the public JSON (stripped via the `_admin` field before the file is saved). |

**If a sheet has no `Status` column at all** (this happened with an early
export of the professional form), every row is treated as `Approved` by
default so the site doesn't just silently publish nothing — but a warning
is printed every sync run until the column is added, since that means there
is currently no approval gate on that source file.

Google Forms/Sheets exports sometimes have one or two trailing blank-header
columns (an artifact of the export, not real data) — the parser tolerates
these without erroring.

---

## 4. Data cleaning & media rules

- **Multi-value fields** (specializations, age groups, levels, format,
  languages, skills/tools, areas of expertise) are comma- or newline-
  separated in the sheet → split into arrays.
- **Structured free-text blocks** — the professional form's `Work
  Experience` and `Projects & Portfolio` are one big textarea per tutor,
  using a repeated labelled format:
  ```
  Experience 1
  Position:
  Embedded Software Engineer
  Organization:
  Swift Act
  Period:
  Jul 2022 – Present
  Description:
  ...
  ```
  `scripts/lib/parse.js` (`parseWorkExperience`, `parseProjects`) splits on
  the `Experience N` / `Project N` markers, then reads each `Label:` line to
  populate that block's fields. If a block doesn't match the expected shape
  at all, its raw text is kept as a `description` rather than being dropped
  — parsing never loses content, worst case it's just unstructured.
- **Languages**: the tutor form has *two* separate columns (`English
  Proficiency` + freeform `Other Language Proficiency`); the professional
  form has *one* freeform `Languages` column, newline-separated
  (`"Arabic — Native\nEnglish — Fluent"`). Both are parsed into the same
  `{ language, proficiency }` shape.
- **Profile key / slug**: `Profile Key` (admin) → `Preferred Profile Key`
  (submitter) → slugified `Full Name`, in that priority order. Collisions
  are auto-resolved (`name`, `name-2`, `name-3`, …) and logged as a warning.
- **Empty fields are dropped entirely**, recursively, not rendered as empty
  strings/dashes (`pruneEmpty()` in `schema.js`) — a profile with no
  `Personal Website` has no `website` key and no "Website" contact chip; a
  profile with zero certificates has no "Certificates" heading at all.
- **Video/certificate slots**: only slots with an actual URL (video) or
  name+file (certificate) are kept; empty slots are skipped, not padded.
- **Media normalization** — both YouTube and Google Drive URLs are detected
  and converted into one unified shape so the frontend never special-cases
  the source:
  - YouTube (`watch?v=`, `youtu.be/`, `/embed/`, `/shorts/`) →
    `youtube.com/embed/<id>` (works with extra query params like `?t=5.432`)
  - Google Drive file (`/d/<id>/`, `?id=<id>`) →
    - images (profile photo): `drive.google.com/thumbnail?id=<id>&sz=w1000`
      (more reliable for hotlinking than the older `uc?export=view` form,
      which frequently gets blocked by a virus-scan interstitial)
    - videos/certificate files: `drive.google.com/file/d/<id>/preview`
      (iframe embed — works for Drive-hosted videos, PDFs, and images alike)
  - **Google Drive folder links are explicitly rejected** (`/drive/folders/...`)
    with a clear warning, rather than being silently mis-parsed as a file —
    a folder isn't a piece of embeddable media, and this exact mistake
    showed up in a real submission (a video slot pointed at a folder
    instead of a single file inside it).
  - Any other unrecognized URL (e.g. a Google Form link pasted into a video
    field by mistake — this also happened in real data) is **dropped, not
    guessed at**, and logged as a warning, so a broken embed never reaches
    the site.

---

## 5. Unified profile JSON shape

```jsonc
{
  "id": "a1b2c3d4e5f6",
  "profileKey": "eng-abdelrahman-essam",
  "kind": "professional",              // or "tutor"
  "status": "Approved",
  "visibility": "public",
  "featured": true,

  "personal": {
    "name": "Abdelrahman Essam",
    "title": "Senior Embedded Software Engineer",
    "photo": { "provider": "drive", "id": "...", "embedUrl": "https://drive.google.com/thumbnail?id=...&sz=w1000" },
    "summary": "...",
    "theme": "sand",
    "location": "Alexandria, Egypt",
    "field": "Engineering",
    "specialization": "Embedded Systems & Functional Safety Engineering"
  },

  "teaching": { "specializations": ["..."], "ageGroups": ["..."], "levels": ["..."], "format": ["..."], "availability": "...", "experienceYears": "5", "experienceDescription": "...", "philosophy": "..." },

  "professional": {
    "field": "Engineering", "specialization": "...", "location": "...",
    "experienceYears": "4", "experienceSummary": "...",
    "expertise": ["Embedded Software Development", "..."],
    "tools": ["VS Code", "Altium Designer", "..."],
    "workExperience": [ { "position": "...", "organization": "...", "period": "...", "description": "..." } ],
    "projects": [ { "name": "...", "description": "..." } ]
  },
  "education": { "qualification": "...", "institution": "...", "graduationYear": "2022", "additional": ["...", "..."] },

  "languages": [ { "language": "Arabic", "proficiency": "Native" }, { "language": "English", "proficiency": "Fluent" } ],
  "skills": ["VS Code", "Altium Designer", "..."],

  "videos": [
    { "title": "About Me", "description": "...", "provider": "drive",   "id": "...", "embedUrl": "https://drive.google.com/file/d/.../preview" },
    { "title": "What is IoT", "description": "...", "provider": "youtube", "id": "j7mwHWBjSWk", "embedUrl": "https://www.youtube.com/embed/j7mwHWBjSWk" }
  ],
  "certificates": [
    { "name": "TESOL Certificate", "organization": "...", "date": "...", "description": "...", "file": { "provider": "drive", "id": "...", "embedUrl": "..." } }
  ],

  "contacts": {
    "email": "...", "whatsapp": "...", "phone": "...", "telegram": "...",
    "facebook": "...", "instagram": "...", "linkedin": "...", "github": "...", "website": "..."
  }
}
```

("teaching" appears only for kind `"tutor""; "professional"/"education" only
for kind `"professional"` — `pruneEmpty()` removes whichever branch doesn't
apply.)

`_admin` (source filename, submission timestamp, admin notes) exists
internally during sync but is **stripped** before the file is written — it
never reaches disk in the public JSON.

`data/index.json` is a lighter version for the directory page: `profileKey`,
`kind`, `featured`, `name`, `title`, `photo`, `summary`, `theme`,
`location`, and up to 3 `tags` (specializations for tutors, specialization
+ top expertise for professionals) — only for profiles that are both
`Approved` and `Public`.

---

## 6. The frontend

- **Directory page** (`site/index.html`): card grid, one card per public
  profile of any kind, text search over name/title/tags/location. Cards
  show a photo (or initials fallback), name, title, location (if present),
  and up to 4 tags.
- **Profile page** (`site/p/<key>/index.html`), shared shell:
  1. Header — photo (in a geometric corner-frame), name, title, a meta
     line (specialization · location, professional kind only), summary
  2. **Kind-specific middle section** (see below)
  3. Contact — chip row with small inline SVG icons (email, WhatsApp,
     phone, Telegram, Facebook, Instagram, LinkedIn, GitHub, website), at
     the very end of the page

  **Tutor kind**: Teaching Profile (labeled Specializations / Age Groups /
  Levels / Format sub-groups) → Videos → Teaching Experience → Languages →
  Technical Skills → Teaching Philosophy → Certificates.

  **Professional kind**: Professional Overview → Areas of Expertise →
  Videos → Work Experience → Projects & Portfolio → Education &
  Qualifications → Software & Tools → Languages → Certificates.

  Adding a third `kind` means adding its own ordered list of section calls
  inside the `t.kind === '...' ? ... : ...` branch in `renderProfile()`
  (`scripts/build-site.js`), reusing the shared helpers (`pillSection`,
  `videosSection`, `certificatesSection`, `contactSection`, `metaLine`, ...)
  wherever the shape matches, and writing new ones only for genuinely new
  section types (the way `workExperienceSection`/`projectsSection` were
  added for the professional kind).
- **Empty sections never render** — e.g. a profile with no certificates has
  no "Certificates" heading at all, not an empty one.
- **Certificates** open in a **lightbox/modal** on click. (An inline
  expand-panel alternative was built and compared side by side during
  development; the lightbox was chosen and the inline variant's markup,
  CSS, and JS have been fully removed — there's no leftover toggle in the
  shipped site.)

### Design system
One shared base palette, only the **accent** changes per profile's chosen
theme (`Preferred Profile Theme` in the sheet, slugified — `"Deep Blue"` →
`deep-blue`):

| Theme | Accent |
|---|---|
| emerald | `#0E6B4F` |
| deep-blue | `#1E3A5F` |
| teal | `#0B6E77` |
| burgundy | `#7A2333` |
| sand | `#A9772F` |
| purple | `#5B3170` |
| dark | flips paper/ink to dark, accent `#C79A4B` |

**Theme bug found and fixed**: `--accent-ink` (used for titles/pills/links
in the accent color) was hardcoded to the emerald hex in `:root` and never
overridden per theme, so every profile rendered with green accents
regardless of its chosen theme. Fixed by making it a derived token instead
of a fixed value:
```css
--accent-ink: var(--accent);   /* was: --accent-ink: #0E6B4F; */
```
so it now automatically follows whatever `--accent` a given
`[data-theme="..."]` block sets.

Base tokens: paper `#F2EDE3`, ink `#211D17`, muted text `#55524A`, hairline
`rgba(27,22,15,0.14)`. Type: **Fraunces** (display/serif) + **IBM Plex
Sans** (body). One deliberate ornamental element (a thin geometric ring
around the profile photo) — everything else is flat, hairline-bordered, no
shadows.

**Any theme word now gets its own color** (`scripts/lib/theme-color.js`).
Previously only the 7 names in the table above actually changed anything —
type any other word into `Preferred Profile Theme` and the profile silently
rendered emerald, with no visual distinction from someone who picked no
theme at all. Now:
- The 7 curated names above still resolve to their exact hand-picked hex
  values (unchanged output for every profile that already uses them).
- `dark` still triggers the whole-palette flip via the existing
  `[data-theme="dark"]` CSS block (paper/ink invert, not just the accent —
  handled separately, excluded from per-word generation).
- Anything else (`"Ocean"`, `"Rose Gold"`, a submitter's own name, whatever
  someone types) is hashed (DJB2, deterministic — no dependency, same word
  → same color on every rebuild) into a hue, then rendered at the same
  saturation/lightness range as the curated jewel tones (~25-32% lightness,
  ~40-80% saturation), so it reads as another deliberate color choice
  rather than a washed-out placeholder, while still reliably differing from
  every other word.

`build-site.js` calls `resolveTheme()` once per profile/card and writes the
result as an inline `style="--accent:…;--accent-tint:…;"` alongside
`data-theme="<slug>"` — inline styles win over the CSS attribute selectors
in `styles.css`, so curated names are untouched (no inline style is
emitted for them: the existing `[data-theme="emerald"]` etc. rules keep
doing the work) and every other word gets its accent set directly, with no
need to hand-add a CSS rule per new theme word.

**The theme color is a reference, not a page wash.** An earlier version
of the site used `--accent-tint` as a full flat background on featured
directory cards, on card hover, and on the entire profile page — with a
different pastel per theme sitting edge-to-edge in the directory grid, this
read as a set of mismatched colored construction-paper tiles rather than a
professional site. Fixed by treating the theme color the way an accent
color is normally used: a thin 4px bar at the very top of each profile
page, a 3px left border marking a featured directory card, headings, links,
pill/tag backgrounds, and hover/focus states — never a full-bleed
background. The directory and profile pages both stay on the same neutral
paper (or, for the `dark` theme, the same neutral dark) regardless of which
accent a given profile picked.

**Profile header:** a gradient cover band (built from the profile's own
`--accent`, so it's per-profile without any extra data) sits behind the
circular photo, with a small ribbon badge in the corner for featured
profiles. Below the summary, a row of quick-fact stat cards (years of
experience, specialization/expertise count, language count, certificate
count) is generated straight from data already in the sheet — nothing
fabricated, and a fact is simply omitted if that field is empty. A single
"Get in touch" button surfaces the best available contact method
(WhatsApp → email → Telegram → phone, first one present) right under the
summary; the full contact list still lives in the Contact section further
down. Certificate cards get a small icon distinguishing an uploaded
file/PDF from an image.

**Arabic translation — stored, not machine/runtime-translated.** An earlier
version of this piped every page through Google's Website Translator widget
at runtime, in the visitor's browser. That's gone now — Google Translate's
output quality wasn't good enough for people's own bios and professional
credentials, and it meant re-translating the same page on every single
visit, for every visitor, dependent on Google's service being reachable.

Now every page is built **twice** — once per language — with real,
hand-written Arabic baked directly into the static HTML:

- `scripts/lib/i18n.js` — the dictionary of static UI strings (headings,
  labels, button text) that's identical on every page, in English and
  Arabic.
- `data/translations/ar.json` — hand-translated content **per profile**,
  keyed by `profileKey`: name, title, summary, specializations, languages,
  certificates, work experience, projects, education, etc. Only real
  translatable text lives here — ids, URLs, dates, and file references
  always come from the English profile data untouched.
- `scripts/lib/localize.js` — merges a profile's Arabic entry onto its
  English data field-by-field. Anything NOT yet translated for a given
  profile simply falls back to the English text, so a partially-translated
  profile still renders correctly instead of breaking or showing blanks.

`build-site.js` calls this twice in `main()`: once building the normal
English pages, once building an Arabic mirror of every page under `/ar/`
(`site/ar/index.html` for the directory, `site/p/<key>/ar/index.html` per
profile). The EN/العربية toggle in the topbar (`langSwitch()`) is just two
static links between these pre-built pages — no cookie, no JavaScript
translation step, nothing loaded from a third party, and it works with no
internet connection at all once the site is loaded.

Arabic pages are rendered with `dir="rtl"` directly on `<html>`. Flexbox
mirrors itself automatically once `direction: rtl` is set, so most of the
layout needs no extra CSS at all; a handful of rules under
`html[dir="rtl"]` in styles.css flip the few places using a physical
left/right value instead of a logical one (the featured-card border, the
cover ribbon, summary alignment).

**Adding or updating a translation:** open `data/translations/ar.json`,
find (or add) the entry for that `profileKey`, and fill in whichever
fields need it — you don't need to translate everything at once. Run
`node scripts/build-site.js` again and both language versions rebuild.
For a brand-new profile with no entry yet, the Arabic page still renders
correctly — every field just falls back to English until someone adds a
translation.

## Letting someone edit their own profile

This site has **no backend, no database, and no server** — it's a folder
of static HTML files. That's deliberate (it's simple, free to host, and
has nothing that can be hacked), but it also means there's nowhere safe to
put a real login system: a login page in plain HTML/JS has no server
behind it to check a password against, and there's no secure place to hold
Google Drive credentials that upload on the visitor's behalf — anyone
could open the page's source and extract them. Building a login page here
would either not actually be secure, or would need standing up real
infrastructure (a server, a database of accounts, Google OAuth) — a much
bigger project than "add a feature to this static site."

The good news: this system already has a login-and-upload mechanism that's
real, secure, and free — **the Google Form people originally filled out to
be listed.** Google Forms can:
- require the person to sign in with their Google account (that's the
  login),
- let them upload a new video or photo straight to Drive via a file-upload
  question (exactly how every video/photo/certificate already on the site
  got there), and
- give them a link back to **their own submission** to edit it later.

To turn this on for your form (one-time setup, no code):
1. In the Form's Settings → Responses, turn on **"Restrict to 1 response"**
   and **"Collect email addresses"** (this requires sign-in and ties each
   response to one person).
2. After someone submits, Forms shows them a confirmation screen with an
   **"Edit your response"** link — that link lets them come back anytime
   and change any answer, including re-uploading a video or photo (the new
   file lands in the same Drive folder as before).
3. Optionally, add a column to the sheet (e.g. `Edit Response Link`) and
   paste each person's edit link into their row — the build already looks
   for a column named `Edit Response Link` (or `Profile Edit Link` /
   `Edit Link`) and, if it finds one, shows an **"Edit my profile"** link
   near the bottom of that person's page automatically (see `editLink` in
   `scripts/lib/schema.js`). Without that column, nothing changes — no
   broken link ever appears.

This reuses infrastructure you already trust (the same Form/Sheet/Drive
this whole system is built on) instead of a second, weaker one. If you
later do want people to edit directly on the site itself rather than
going back to the Form, that's a real project — a small backend, accounts,
and a Google Drive integration — happy to help design that when you're
ready to stand up that infrastructure.

### Photo cropping
Profile photos are shown in a circular frame, cropped with `object-fit:
cover`. A plain centred crop cuts off faces in a lot of real portrait
photos (faces tend to sit in the upper portion of the frame, not dead
center). Fixed with a CSS custom property:
```css
--photo-focus: 50% 22%;   /* horizontal 50%, vertical 22% = biased toward the top */
```
applied via `object-position: var(--photo-focus)` everywhere a photo is
cropped (directory card avatar + profile header photo). Raise the second
number to show more of the body, lower it to zoom in tighter on the face.

An **uncropped alternative** is also built in for cases where cropping
loses something important: add `class="full"` to the `.photo-frame` div
(`<div class="photo-frame full">`) and it switches to a rectangular,
letterboxed presentation (`object-fit: contain` on a tinted background)
that shows the whole photo with nothing cut off, instead of a circular crop.

---

## 7. Known real bugs this caught (worth remembering)

These aren't hypothetical edge cases — each was an actual mistake found in
real submitted data while building this:

1. **Certificate slots 4–7 silently dropped** by a name-keyed parser,
   because the sheet reuses the literal header `Certificate — Name` (etc.)
   for every slot past 3. Fixed by parsing positionally (§2).
2. **A video field pointed at a Google Drive *folder***
   (`drive.google.com/drive/folders/...`) instead of a single file inside
   it — not embeddable as-is. Now explicitly detected and rejected with a
   warning naming which slot and file, instead of producing a broken iframe.
3. **A video field pointed at a Google Form link**
   (`docs.google.com/forms/...`) — almost certainly the wrong URL pasted
   into the wrong cell. Falls through the "unrecognized URL" path and is
   dropped with a warning rather than embedded blindly.
4. **Theme accent not actually applying** — see the `--accent-ink` bug
   above; every profile looked emerald-green regardless of its chosen theme
   until this was traced and fixed.
5. **No `Status` column on the professional form's first export** — meant
   there was no approval gate at all for that source file; every row would
   auto-publish. Now defaulted safely (to `Approved`, so nothing silently
   vanishes) but loudly warned about every sync run until the column exists.
6. **YouTube "Error 153" when testing locally** — not a code bug at all:
   opening a generated page directly as a `file://` path gives it no valid
   web origin, and YouTube's embed player refuses to load in that context
   regardless of video ID. Confirmed by testing a definitely-real,
   definitely-embeddable video ID and seeing the same error. Fixes itself
   once the page is served over `http://`/`https://` (even just
   `localhost` while developing) instead of opened as a local file.

---

## 8. Project structure

```
tutor-portfolio/
├── data/
│   ├── raw/                  ← drop ANY number of sheet exports here (*.csv)
│   │   ├── tutors.csv
│   │   └── professionals.csv
│   ├── profiles/*.json       ← generated, one per Approved profile, any kind
│   └── index.json            ← generated directory listing
├── scripts/
│   ├── csv.js                 ← dependency-free CSV parse/stringify
│   ├── lib/
│   │   ├── parse.js           ← Row wrapper, positional slot extraction, media
│   │   │                         normalization, free-text block parsing, language parsing
│   │   └── schema.js           ← per-form schema detection + mapping into the
│   │                              unified profile shape; profile assembly, pruning
│   ├── sync.js                 ← reads data/raw/*.csv → data/profiles/*.json + data/index.json
│   ├── build-site.js           ← JSON → static HTML site
│   ├── make-fixture.js         ← (dev only) regenerates the tutor sample CSV
│   └── make-fixture-professional.js  ← (dev only) regenerates the professional sample CSV
├── deploy/
│   ├── nginx-tutor-portfolio.conf   ← nginx server block for the static site
│   └── update-site.sh               ← copy new CSV in, resync, rebuild, publish to webroot
└── site/
    ├── assets/{styles.css, site.js}
    ├── index.html               ← generated
    └── p/<key>/index.html       ← generated, one per profile
```

### Running it
```bash
# 1. Export each sheet: File → Download → Comma-separated values (.csv)
#    Save them into data/raw/ (any filenames, any number of files)

node scripts/sync.js        # data/raw/*.csv → data/profiles/*.json + data/index.json
node scripts/build-site.js  # JSON → site/index.html + site/p/<key>/index.html
```
Re-run both any time any sheet changes and a new export is dropped in.
`sync.js` prints a per-file summary (schema detected, rows read, profiles
built) plus every warning, so a bad row or a broken link is visible
immediately rather than silently producing an incomplete page.

On the actual server: `./deploy/update-site.sh /path/to/new-export.csv`
copies the file into `data/raw/`, re-runs both scripts, and rsyncs the
result into nginx's webroot in one step.

---

## 9. Known open items / next decisions

- **Photo crop**: top-biased circular crop is the current default; confirm
  it looks right across a few more real photos, or switch to the uncropped
  `.full` variant if cropping keeps causing problems.
- **Directory filtering**: currently text search only (name/title/tags/
  location); dedicated filters by specialization/field/age-group/etc. were
  scoped out of v1, but the underlying data is already present in both the
  profile JSON and the directory index if this is wanted later.
- **A third form/kind**: the architecture (schema `detect`/`map` +
  `renderProfile()` branch) is designed to make this additive — see §1 and
  §6 for exactly what to add.
- **Sheets API automation**: if manual CSV export becomes a bottleneck,
  swapping the "read every file in `data/raw/`" step for a Sheets API call
  per known sheet ID is the only change needed — everything downstream
  (schema detection, mapping, site generation) is unaffected.
