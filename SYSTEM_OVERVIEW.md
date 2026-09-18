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

**Arabic translation.** An EN / العربية toggle sits in the topbar of every
page (`langSwitch()` in build-site.js, wired up in `initLangSwitch()` in
site.js). Every page ships **both languages already baked into the HTML**
at build time — each piece of text is rendered as a pair of spans,
`<span data-i18n-en>` and `<span data-i18n-ar dir="rtl">` (see `bi()` in
build-site.js) — and the toggle just flips a `data-lang`/`dir` attribute on
`<html>` via a couple of CSS rules, remembering the choice in
`localStorage` so it carries across pages. There's no external call, no
cookie, and no reload: this replaced an earlier version that loaded
Google's Website Translator widget and translated on the fly in the
visitor's browser. The Arabic text itself comes from a stored,
per-profile dictionary — see §6a below — merged with a small static table
of section headings/labels (`UI_AR` in build-site.js) that doesn't need
the translation pipeline since it's identical on every page. Once Arabic
is active, `html[dir="rtl"]` is set directly; a few CSS rules under that
selector flip the handful of physical left/right values in the layout
(the featured-card border, the cover ribbon, summary alignment) — flexbox
layouts elsewhere mirror themselves automatically once `direction: rtl`
is set, so most of the page needs no extra rule at all.

### 6a. Stored translations (`scripts/translate.js`)

Translations are generated once and cached, not fetched live:

```
data/profiles/<key>.json           (English, from sync.js)
        │  node scripts/translate.js
        ▼
data/i18n/<key>.json               (English -> Arabic dictionary, cached)
        │  node scripts/build-site.js
        ▼
site/p/<key>/index.html            (both languages baked in)
```

`scripts/translate.js` walks a fixed, explicit list of fields per profile
(`TRANSLATABLE_PATHS`) — summaries, descriptions, category tags like
"Beginner" or "Business English" — and translates whichever of those
strings aren't already in `data/i18n/<key>.json` via MyMemory
(mymemory.translated.net), a free translation API with no account or key
required. Deliberately **not** translated: names, organizations/
institutions, contact handles, dates, IDs, theme words — those are proper
nouns/identifiers, and machine translation tends to mangle them, so they're
left exactly as entered on both language versions of the page.

Each `data/i18n/<key>.json` is a plain `{"English text": "Arabic text"}`
object — read it, hand-edit any line that needs a better translation, and
`scripts/translate.js` will leave your edit alone (it only fills in
strings that are missing, never overwrites an existing entry). Worth
checking by hand at least once: MyMemory is decent but not perfect,
especially on short category tags translated without surrounding context
("Elementary" as a teaching level vs. a school, for instance). Re-running
the script after adding new content to a profile only translates the new
strings, not the whole profile again.

```bash
node scripts/translate.js                 # every profile
node scripts/translate.js ahmed-mohamed   # just one
node scripts/build-site.js                # bake the (updated) translations into the site
```

MyMemory's anonymous free tier is capped around 5,000 words/day per IP;
`export MYMEMORY_EMAIL=you@example.com` (a free registration, not a paid
key: https://mymemory.translated.net/doc/keygen.php) raises that to
roughly 50,000 words/day if a handful of profiles ever isn't enough. A
failed string (network hiccup, quota hit) is skipped with a warning and
retried the next time the script runs — it never blocks the rest of the
batch.

If a string has no cached translation yet (a brand-new profile before its
first `translate.js` run, or a string `translate.js` doesn't cover),
`bi()` falls back to showing the English text under the Arabic toggle too,
rather than rendering blank.

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

## 7. Login + "edit your own profile" backend (`server/`)

The pipeline above (§1) is still the only way a *new* profile gets
created — admin reviews a form response, approves it, `sync.js` +
`build-site.js` publish it. What `server/` adds is a way for the person a
profile belongs to log in afterward and edit their own content directly,
without going through another form submission and admin re-approval.

```
Browser (logged in as "ahmed")
        │  GET/PUT /api/profile
        ▼
server/index.js               (Express: /api/login, /api/logout, /api/me,
        │                       GET+PUT /api/profile — see below)
        │  server/lib/profile-store.js
        ▼
data/profiles/<key>.json      (updated in place)
data/index.json               (matching directory entry patched too)
        │  build-site.js's buildOneProfile()
        ▼
site/p/<key>/index.html       (that one page + the directory page, re-rendered)
```

**Accounts.** There's no public self-signup. An admin runs
`node server/create-user.js <profileKey> <username> <password>` to
provision (or update) a login — this ties exactly one username to exactly
one existing, already-approved `profileKey`. `server/users.json` stores
`{ username, passwordHash (bcrypt), profileKey }` per account; it's
git-ignored (see `server/.gitignore`) since it holds password hashes.

**Sessions.** `/api/login` checks the password and, if it matches, signs a
JWT containing `{ username, profileKey }` and sets it as an httpOnly,
`SameSite=Strict` cookie (`server/lib/auth.js`). `AUTH_JWT_SECRET` must be
set (a long random value — see `server/.env.example`); the server refuses
to start signing tokens without one rather than falling back to a
guessable default.

**Authorization is the whole point, so it's kept as simple as possible:**
every profile-editing route reads the profile key to act on **from the
session**, never from a URL parameter or the request body. There is no
`/api/profile/:key` — just `/api/profile`, meaning "my own." That means
there's no ID for a logged-in user to tamper with to reach someone else's
page; the boundary isn't a permission check that could have a bug in it,
it's the shape of the API. A `sameOriginGuard` middleware also checks the
`Origin` header on state-changing requests (login, logout, save) as a
second layer against cross-site request forgery, on top of the
`SameSite=Strict` cookie.

**Editing.** `PUT /api/profile` accepts partial edits to any section —
basics, teaching/professional details, education, languages, videos,
certificates, contacts (see the field list and comments in
`server/lib/profile-store.js`). Deliberately **excluded** from self-editing:
`profileKey` (the URL slug), `kind` (which section layout renders),
`status`/`visibility`/`featured` (the approval gate from §3) — those stay
admin-controlled. Pasting a new YouTube/Google Drive link for a video,
certificate, or photo re-runs the same `normalizeMedia()` used by the
CSV pipeline (§2/§4), so a bad link gets the same "unrecognized URL,
skipped" treatment either way; leaving a link field blank keeps whatever
that video/certificate/photo already had.

**Frontend.** `server/public/login.html` and `edit.html`/`edit.js` are
plain HTML/JS (no build step) served by the same Express app. `edit.html`
shows/hides the tutor-only vs. professional-only sections based on the
logged-in user's own `kind`, and renders repeatable rows (add/remove) for
work experience, projects, languages, videos, and certificates.

**Deploying alongside the static site.** The public site (`site/`) stays
exactly what it was — plain static files. `server/index.js` can serve
those same files itself (so the whole thing runs as one Node process), or
nginx can keep serving `site/` directly and only proxy `/api/`, `/login`,
and `/edit` to the Node process — see the added location blocks in
`deploy/nginx-tutor-portfolio.conf`. Either way, run the Node process
itself with something that restarts it (pm2, a systemd unit, etc.) — the
included `node server/index.js` is meant for that supervisor to run, not
for a plain terminal session in production. See `server/README.md` for
the full setup checklist.

---

## 8. Known real bugs this caught (worth remembering)

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

## 9. Project structure

```
tutor-portfolio/
├── data/
│   ├── raw/                  ← drop ANY number of sheet exports here (*.csv)
│   │   ├── tutors.csv
│   │   └── professionals.csv
│   ├── profiles/*.json       ← generated, one per Approved profile, any kind
│   ├── i18n/<key>.json       ← generated + cached, per-profile English -> Arabic
│   │                            dictionary (see §6a); safe to hand-edit
│   └── index.json            ← generated directory listing
├── scripts/
│   ├── csv.js                 ← dependency-free CSV parse/stringify
│   ├── lib/
│   │   ├── parse.js           ← Row wrapper, positional slot extraction, media
│   │   │                         normalization, free-text block parsing, language parsing
│   │   ├── schema.js           ← per-form schema detection + mapping into the
│   │   │                          unified profile shape; profile assembly, pruning
│   │   └── i18n.js             ← merges data/i18n/*.json into one lookup table
│   ├── sync.js                 ← reads data/raw/*.csv → data/profiles/*.json + data/index.json
│   ├── translate.js            ← free MyMemory-based translation to fill in data/i18n/<key>.json (§6a)
│   ├── build-site.js           ← JSON (+ i18n) → static HTML site; exports buildSite()/
│   │                              buildOneProfile() so server/ can reuse the same renderer
│   ├── make-fixture.js         ← (dev only) regenerates the tutor sample CSV
│   └── make-fixture-professional.js  ← (dev only) regenerates the professional sample CSV
├── server/                     ← login + "edit your own profile" backend (§7)
│   ├── index.js                 ← Express app: /api/login, /api/me, GET+PUT /api/profile
│   ├── create-user.js           ← admin CLI to provision a login for one profile
│   ├── users.json               ← generated, git-ignored (username + bcrypt hash + profileKey)
│   ├── lib/{auth,users,profile-store}.js
│   ├── public/{login,edit}.html, edit.js, edit.css
│   └── README.md                ← setup + deployment checklist
├── deploy/
│   ├── nginx-tutor-portfolio.conf   ← nginx server block (static site + proxy to server/)
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

node scripts/sync.js          # data/raw/*.csv → data/profiles/*.json + data/index.json
node scripts/translate.js     # data/profiles/*.json → data/i18n/*.json (free, cached; skips what's already translated)
node scripts/build-site.js    # JSON (+ i18n) → site/index.html + site/p/<key>/index.html
```
Re-run these any time any sheet changes and a new export is dropped in
(`translate.js` is cheap to re-run — it only translates strings it
hasn't seen before). `sync.js` prints a per-file summary (schema detected,
rows read, profiles built) plus every warning, so a bad row or a broken
link is visible immediately rather than silently producing an incomplete
page.

On the actual server: `./deploy/update-site.sh /path/to/new-export.csv`
copies the file into `data/raw/`, re-runs sync + build (not translate —
run that separately when you have new content to translate), and
rsyncs the result into nginx's webroot in one step.

To let people log in and edit their own profile afterward, see
`server/README.md` for the one-time setup (install deps, set
`AUTH_JWT_SECRET`, create accounts, start the process, wire up nginx).

---

## 10. Known open items / next decisions

- **Photo crop**: top-biased circular crop is the current default; confirm
  it looks right across a few more real photos, or switch to the uncropped
  `.full` variant if cropping keeps causing problems.
- **Directory filtering**: currently text search only (name/title/tags/
  location); dedicated filters by specialization/field/age-group/etc. were
  scoped out of v1, but the underlying data is already present in both the
  profile JSON and the directory index if this is wanted later.
- **A third form/kind**: the architecture (schema `detect`/`map` +
  `renderProfile()` branch) is designed to make this additive — see §1 and
  §6 for exactly what to add. Remember to add its translatable fields to
  `TRANSLATABLE_PATHS` in `scripts/translate.js`, and its editable fields
  to `server/lib/profile-store.js`, if it should get the same treatment.
- **Sheets API automation**: if manual CSV export becomes a bottleneck,
  swapping the "read every file in `data/raw/`" step for a Sheets API call
  per known sheet ID is the only change needed — everything downstream
  (schema detection, mapping, site generation) is unaffected.
- **Self-service password reset**: `server/create-user.js` also doubles as
  a password reset (re-running it for an existing username updates the
  password) but that's an admin running a CLI command, not something the
  user can trigger themselves — there's no "forgot password" email flow.
  Fine for a small number of profiles; worth adding if this grows.

