# CLAUDE.md

Project context for Claude Code. Read this fully before touching anything.

---

## Who you're working with

Jeremy Carrow — Creative Director, broadcast motion design, NYC. Emmy and Clio winner. Also the solo founder of Clutch Motion Tools, a commercial After Effects plugin suite.

**He does not read code.** Do not explain implementation, paste diffs, or walk through functions unless he asks. Report in outcomes: what now works, what changed visually, what he needs to click, what's still broken. When you need a decision from him, frame it as a product or design choice, never as a technical one. If a technical decision has no product consequence, just make it.

He works across two Windows machines and a Mac. Verification happens in a real browser on his machine, not in a sandbox.

---

## What this project is

A project scheduling and tracking app for the manager of a creative/technical department. Assign projects to owners, group them by phase, set start and due dates, hang dated milestones off each one, and let progress and risk surface automatically. Five views over the same data: Board, Timeline, Kanban, Team, Insights.

Single-user. Zero backend. Local-first. Installs to an iPhone home screen and runs offline.

The job it does: **one manager, one department, all the work, all the dates, at a glance.**

Originating context is a broadcast and sports-media creative department — the demo data is graphics packages, promos, LED wall content, sponsor billboards, highlight pipelines, show rebrands, truck firmware.

---

## ⚠️ Current repo state — read before your first commit

The repo is in a messy state that needs cleaning up before feature work:

- **`main` is essentially empty.** It holds only a `README` containing pasted git setup commands. Nothing else.
- **The actual app lives on branch `claude/project-scheduling-tracking-app-z1jepd`.** All ~2,200 lines of it.
- **A third branch, `claude/clutch-frosted-glass-ui-ne64kk`,** holds an unused frosted-glass CSS experiment (`clutch-glass.css`, `clutch-tokens.css`, `clutch.css`, plus previews). Not wired into the app. Keep it around but don't merge it without asking — it belongs to a different brand system.
- **GitHub Pages is not enabled.** The deploy workflow exists at `.github/workflows/deploy-pages.yml` but the Actions token cannot turn Pages on. Jeremy must do this by hand once: repo **Settings → Pages → Source → GitHub Actions**. Remind him; you cannot do it for him.

**First task, before anything else:** get the app onto `main`, make `main` the deploy branch, and drop the temporary branch name from the workflow trigger. Confirm with him before force-pushing or deleting any branch.

---

## ⚠️ A rename is pending

The name **"Line Sweep Pro" is being retired.** It was inherited from an unrelated older tool and reads as RF cable testing or a computational-geometry algorithm. A new name is being chosen in a separate conversation.

**Do not invent a new name, and do not start renaming things.** Until Jeremy gives you the final name, leave every existing string as-is. When he does hand you the name, here is the complete surface — 13 occurrences across 8 files:

| File | What needs changing |
|---|---|
| `manifest.webmanifest` | `name` and `short_name` (drives the home-screen label; keep `short_name` ≤ 12 chars) |
| `index.html` | `<title>`, `apple-mobile-web-app-title`, logo `title` and `alt` |
| `js/store.js` | `localStorage` key `line-sweep-pro:v1` |
| `service-worker.js` | cache name `line-sweep-pro-v1` |
| `css/styles.css` | header comment |
| `js/app.js` | header comment |
| `scripts/make_icons.py` | docstring; regenerate icons with the new monogram |
| `README.md` | title, description, Pages URL |
| — | the GitHub repo name itself |

**Critical:** changing the `localStorage` key orphans any data Jeremy has already entered. Either write a one-time migration that reads the old key and writes the new one, or ask him first whether a clean reset is fine. Do not silently wipe his data. Bumping the service worker cache name is desirable on rename — it forces a clean refresh.

---

## Architecture

No framework. No build step. No dependencies. Plain files loaded with `<script>` tags so the app also runs from `file://`.

```
index.html               App shell — icon rail, top bar, view host, mobile tab bar
manifest.webmanifest     PWA metadata
service-worker.js        Offline cache (cache-first for app shell)
css/styles.css           Full design system + responsive layout (~446 lines)
js/motion.js             Springy micro-interactions — FLIP, pops, staggers, counters (~157 lines)
js/store.js              State, seed data, persistence, domain logic (~378 lines)
js/app.js                All five views, inline editing, drag & drop, modal, charts (~1,119 lines)
icons/                   Generated PWA icons
scripts/make_icons.py    Icon generator — pure Python, no deps
```

**Module pattern:** each JS file is an IIFE that hangs a single object off `window` — `window.Motion`, `window.Store`, and `app.js` as the consumer. Load order in `index.html` matters: motion, then store, then app. `app.js` aliases them as `M` and `S`.

**Style:** ES5-flavored — `var`, `function` declarations, no arrow functions, no template literals, no modules. This is deliberate, for `file://` compatibility and zero-tooling simplicity. **Match it.** Do not modernize the syntax.

**State flow:** `store.js` owns everything. It loads from `localStorage`, mutates, persists, and emits to subscribers. `app.js` subscribes and re-renders. There is no virtual DOM — views clear and rebuild their container. Keep it that way.

---

## Domain model

- **Project** — `name`, `ownerId`, `groupId`, `status`, `priority`, `startDate`, `dueDate`, `progress`, `notes`, `milestones[]`, `createdAt`
- **Milestone** — `name`, `date`, `done`. Completing milestones auto-drives project progress.
- **Group** — user-defined phase bucket. Seeded: In Production / Upcoming / Completed.
- **Person** — `name`, `role`, generated `initials`, assigned `color`
- **Status** — `not_started` · `working` · `stuck` · `on_hold` · `done`
- **Priority** — `low` · `medium` · `high` · `critical`
- **Settings** — `atRiskDays` (default 3)

Risk is **derived, never tagged.** Overdue and at-risk flags compute from dates and propagate to the board, cards, and dashboard automatically. This is the product's core value — preserve it in any new feature.

---

## Design system

Current palette is a blue/orange broadcast look. All tokens are CSS custom properties at the top of `css/styles.css`:

```
--blue #0073ea   --blue-dark #1d4ed8   --orange #fb923c
--ink #1c1f3b    --ink-soft #676879
--line #e6e9ef   --bg #f6f7fb          --surface #ffffff
--radius 12px    --rail-w 76px
```

Type is Figtree with a system fallback stack. Status and priority colors live in `store.js` as reference data, not in CSS — change them there.

**Motion is a feature, not decoration.** Jeremy is a motion designer; sloppy easing is a visible defect to him. All animation goes through `js/motion.js`, is built on the Web Animations API, and must honor `prefers-reduced-motion`. If you add a new interaction, animate it, and match the existing spring feel.

**Note:** the visual direction may change with the rename. Don't invest in heavy restyling until the name lands.

---

## Working rules

**Never, without asking first:**
- Add a dependency, package manager, or build step. The zero-tooling constraint is the point.
- Introduce a backend, auth, or cloud sync. It's local-first by design.
- Convert the code to ES modules, TypeScript, or a framework.
- Change absolute vs. relative paths. Everything is relative so the GitHub Pages subpath works.
- Force-push, rewrite history, or delete a branch.
- Wipe or migrate `localStorage` data.

**Always:**
- Match the existing ES5 style and IIFE module pattern.
- Keep it working from `file://` as well as over http.
- Test both the desktop table layout and the mobile card layout — there's a real responsive breakpoint and it's easy to break one while fixing the other.
- Bump the service worker cache name when you change cached assets, or he'll get stale files.
- Commit in coherent chunks with plain-English messages.

**To run it:**
```
python3 -m http.server 8080
```
Then open `http://localhost:8080`. The service worker and installability only activate over http(s), not `file://`.

**Verification:** you cannot see the UI. After any visual or interaction change, tell Jeremy exactly what to look at and what "correct" looks like. He'll confirm or send a screenshot.

---

## Roadmap

Not yet started, roughly in priority order:

1. **Branch cleanup + Pages deploy** — get it live so he can install it on his iPhone. Do this first.
2. **The rename** — when the name arrives.
3. **Filters, sorting, and saved views** — the board has grouping and search but no filter or sort controls.
4. **CSV and calendar (`.ics`) export** of projects and milestones.
5. **Milestone dependencies and recurring projects.**
6. **Push reminders** for upcoming milestone dates.
7. **Cloud sync / multi-user** — would require a backend and auth. Large. Changes the product's character. Discuss before starting.

---

## First session

Suggested opening: confirm the branch cleanup plan with Jeremy, get the app onto `main`, fix the workflow trigger, then walk him through enabling Pages so he can put the app on his phone and actually use it. Everything else is easier to judge once he's living with it.
