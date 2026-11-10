# Headlines — The Never-Ending World News Widget

A small, dark, portrait window that shows a calm, continuous waterfall of real news headlines
from around the world. New headlines enter at the top, drift downwards, and leave through the
bottom — never to return. No buttons, no menus, no scrolling, no ads, no accounts, no cost.

> **Looking for the phone app?** See **[PHONE-APP.md](PHONE-APP.md)**. It's a full-screen
> Android and iPhone app that runs the news engine itself, so no computer is needed.

This guide has six parts:

- **A.** What the app does
- **B.** What each platform actually allows
- **C.** How it is built
- **D.** The code (a map of the project)
- **E.** Installing it, step by step
- **F.** Testing status and the roadmap

---

## Part A — Product specification

**What you see**
- A dark charcoal panel (`#0a0a0b`) with crisp off-white headlines in *Inter*, a modern typeface
  bundled with the app (it works offline and needs no Google Fonts).
- Under each headline, a small, dim label naming the publisher, e.g. `ABC NEWS · AUSTRALIA`. This
  credits the source. It is the only text besides the headline.
- A soft fade at the top and bottom edges, so headlines seem to emerge and dissolve.
- No header, logo, clock, buttons, links, menus or settings.

**How it moves**
- New headlines are placed just *above* the top edge and slide down into view.
- Everything moves **down only**. In the code, the downward movement on every animation frame is
  clamped to be at least zero, so upward motion can't happen. It runs at about half a line of
  text per second.
- When a headline's top edge passes the bottom edge, it is removed for good.
- Long headlines wrap onto as many lines as they need. Very long words break instead of being
  clipped. Text size, padding and speed all scale with the widget's size.
- **The speed adapts to the supply of news.** With plenty of unseen headlines, it flows at the
  normal pace. With few left, it slows down. With none left, it eases gently to a stop and waits.
  It **never** invents a headline and **never** recycles one. It starts moving again by itself as
  soon as fresh stories arrive.
- Users can't pause it, scroll it, zoom it or click anything. Scroll, keyboard, touch and
  right-click input is ignored.

**What it shows**
- Real headlines from **80 free public feeds from 68 news outlets across 28 regions**, for
  example ABC, SBS, The Guardian, SMH, Brisbane Times, BBC, Al Jazeera, NPR, DW, France 24, CBC,
  NYT, The Hindu, Dawn, CNA, Yonhap, News24, Premium Times, Le Monde, Nature, WHO and ESPN.
- Plus **GDELT**, a free, open, key-less index of news websites worldwide. It updates every
  15 minutes and adds thousands more outlets. Each headline is credited to its own outlet.
- Coverage includes breaking news and world news, Australia, business, science, technology,
  health, environment, politics, sport, culture and entertainment.
- It shows the freshest stories first, spreads publishers and topics out, and skips anything older
  than 48 hours.

**The no-repetition promise**
- A headline is never shown twice in a session.
- Headlines that already appeared are remembered across restarts. The last 2,000 are kept on your
  device.
- When several outlets cover the same story, only the first version is shown. Later versions are
  dropped as near-duplicates, even when worded differently.

---

## Part B — Platform feasibility (the honest version)

The key fact: **home-screen widgets on phones aren't allowed to animate continuously.** Both Apple
and Google designed widgets as snapshots that refresh occasionally, to save battery. No framework
gets around this. Any app claiming a smooth, never-stopping animation inside a real iOS
home-screen widget is not telling the truth.

| Platform | True home-screen widget? | Continuous smooth downward flow? | What this project delivers |
|---|---|---|---|
| **Windows 10/11** | The Windows 11 *Widgets board* uses static Adaptive Cards (no custom animation) | ✅ Yes, in a small app window | **Desktop widget** (Electron): a frameless 3×4 portrait panel. Move it anywhere, resize it, optionally keep it on top, optionally start it at login |
| **macOS** | Desktop/Notification Centre widgets use WidgetKit (same limits as iOS) | ✅ Yes, in a small app window | **Same desktop widget** |
| **Linux** | Depends on the desktop environment | ✅ Yes | **Same desktop widget** (AppImage) |
| **Android phone/tablet** | Yes, but a widget is drawn with `RemoteViews`, which has no custom frame-by-frame animation. Automatic widget refreshes (`updatePeriodMillis`) can't run more often than every 30 minutes | ❌ Not inside a widget. ✅ Yes, full-screen | **Now:** the full-screen waterfall in Chrome, added to the home screen. **Roadmap:** a real 3×4 widget that steps headlines downward every few seconds (see Part F) |
| **iPhone/iPad** | Yes (WidgetKit), but widgets are pre-rendered snapshots. A frequently viewed widget typically gets only about 40–70 background refreshes per day | ❌ Not inside a widget. ✅ Yes, full-screen | **Now:** the full-screen waterfall added to the home screen from Safari. **Roadmap:** a WidgetKit widget showing a slowly changing snapshot of the latest headlines |

**What this means for you**
- **On a computer** you get the real thing: a true widget-style panel with the endless,
  never-pausing waterfall.
- **On a phone or tablet** you get the real waterfall while it is open full-screen. This is a
  good fit for an old phone or tablet on a stand, which becomes a "news window". The screen is
  kept awake where the browser allows it (Wake Lock needs HTTPS or localhost).
- A real phone home-screen widget can only show headlines that **change in steps** (Android every
  few seconds, iOS a few times an hour). It can't flow continuously. Part F explains how to add
  one later.

---

## Part C — Technical architecture

**Framework choice: plain JavaScript + Electron (desktop) + a tiny Node.js web service (phones/tablets)**

- **One display, everywhere.** The waterfall is a small web page with no framework: HTML, CSS and
  about 150 lines of JavaScript. Exactly the same code runs inside the desktop widget and in any
  phone, tablet or computer browser.
- **The desktop widget doesn't need a server.** The news engine runs inside the app. It fetches
  feeds directly from publishers. That's free to run, private, and has nothing to host.
- **Phones need a helper.** Browsers aren't allowed to download other websites' feeds directly
  (a browser rule called CORS). So `server/server.js` fetches the feeds and serves the page. It
  uses exactly the same engine as the desktop app.
- **Why not Flutter or React Native?** Neither can get around the widget animation limits in
  Part B, and both add a lot of setup for a beginner. Native Kotlin and Swift widgets are the
  right tools for the *stepwise* phone widgets later on. They can read headlines from the same
  service.
- **Runtime dependencies (all free, MIT licence):** `fast-xml-parser` reads the feeds, and
  Capacitor wraps the display and engine into the Android and iPhone apps.

```
 Publishers' free RSS/Atom feeds
              │  (each checked on its own schedule; ETag / If-Modified-Since)
              ▼
 core/fetcher.js ──► core/parser.js ──► shared/dedup.js ──► core/aggregator.js
 (timeouts, retries,    (RSS 2.0, RSS 1.0,   (guid, URL, text,      (numbered stream of
  rate-limit aware)      Atom; dates→UTC)     near-duplicate)        unique headlines)
                                                                        │
              ┌─────────────────────────────────────────────────────────┤
              ▼                                                         ▼
  desktop/main.js (Electron IPC)                         server/server.js  GET /api/headlines?after=N
              │                                                         │
              └──────────────► display/app.js ◄─────────────────────────┘
                                 │  shared/picker.js  (freshest first, publisher variety,
                                 │                     final no-repeat gate vs. "already shown")
                                 ▼
                               shared/engine.js  (motion model: y only increases)
```

**Headline sources.** These are publishers' own free RSS/Atom feeds, which they offer so readers
and apps can follow their headlines. Only the **headline text and the publisher's name** are
shown. The app shows no article text or images, doesn't scrape web pages and doesn't get around
paywalls. Every headline is a real, published story.

**Deduplication (no repeats).** There are two layers:
1. **Service layer** (`shared/dedup.js` inside the aggregator). This works across all
   publishers. Each item gets keys from:
   - its guid
   - its canonical URL (tracking parameters, fragments and `www.` removed)
   - its normalised text (case, punctuation, accents and curly quotes removed)

   Then an inverted word index finds near-duplicates. Two headlines count as the same story when
   - their word overlap (Jaccard similarity) is at least 0.6, **or**
   - at least 80% of the shorter headline's words appear in the longer one (5 or more words).

   When several are near-duplicates, the first one found is kept.
2. **Display layer** (`shared/picker.js`). Every headline is checked again against everything
   already shown, just before it appears. This history is saved on the device, so the guarantee
   holds even if the service restarts.

*Known trade-off:* two short headlines that differ by a single key word can look like the same
story. For example, *"Australia beat India in Test final"* and *"England beat India in Test
final"*. In that case the second one is skipped. This errs on the side of never repeating. To
tune it, change `jaccard` / `containment` in `shared/dedup.js`.

**Update system**
- Each source is checked on its own schedule, every 10–60 minutes, with random ±10% "jitter" so
  requests are spread out.
- Conditional requests mean an unchanged feed costs almost nothing.
- Up to four sources are fetched at a time, with a 15-second timeout.
- If a source fails, it waits longer before each retry (exponential back-off: 2×, 4×, … up to
  6 hours). Missing feeds (404/410) wait 6 hours. Rate limits (`Retry-After`) are respected.
- If everything fails at once, the app assumes the internet is down. It retries in about 2
  minutes and doesn't hold the failures against the sources.
- Health of each source can be checked at `/api/health`.
- All times are stored as UTC timestamps. Publisher time-zone offsets are applied correctly, and
  impossible future dates are corrected.
- The app never claims to be real-time. Headlines appear within minutes of a publisher adding them
  to its feed.

**Storage**
- In memory: the most recent 3,000 unique headlines (the stream) and a deduplication memory of
  8,000 entries.
- On the device: the last 2,000 headlines shown (`localStorage`) and the desktop window's position.
- No database and no cloud.

---

## Part D — Complete working code (project map)

```
news-waterfall/
├── package.json            scripts, dependencies, desktop packaging settings
├── config.json             desktop widget options (size, always-on-top, open at login)
├── core/                   ── the news engine (Node.js) ──
│   ├── sources.js          the 80 feeds + GDELT queries (edit to add or remove sources)
│   ├── fetcher.js          polite HTTP: timeouts, ETag, Retry-After
│   ├── parser.js           RSS 2.0 / RSS 1.0 (RDF) / Atom / GDELT JSON → headline records
│   └── aggregator.js       schedules, retries, health, dedup, numbered stream
├── shared/                 ── runs in BOTH Node and the browser ──
│   ├── normalize.js        text/URL normalisation, hashing
│   ├── dedup.js            the no-repetition engine
│   ├── picker.js           what enters next (fresh, varied, never repeated)
│   └── engine.js           the motion model (downward only)
├── display/                ── the waterfall you see ──
│   ├── index.html, style.css, app.js
│   ├── fonts/              Inter (SIL Open Font Licence)
│   ├── manifest.webmanifest, sw.js, icons   (home-screen install on phones)
├── desktop/                ── the desktop widget (Electron) ──
│   ├── main.js             window, news engine, position memory
│   └── preload.js          safe bridge between engine and display
├── server/server.js        ── the service for browsers on other devices ──
├── mobile/bridge.js        ── runs the news engine inside the phone app ──
├── scripts/build-web.js    builds the app's web content into www/
├── capacitor.config.json   phone app settings (name, ID, native HTTP)
├── android/, ios/          the native app projects (Android Studio / Xcode)
├── .github/workflows/      free cloud build of the Android app
├── build/icon.png          app icon for installers
└── test/                   automated tests (47 unit/integration, 25 browser, 10 phone-app checks)
```

---

## Part E — Installation guide (for beginners)

### 1. Install the one program you need: Node.js
1. Go to **nodejs.org** and download the **LTS** version (version 22 or newer).
2. Run the installer and accept the defaults.
3. Open a terminal:
   - **Windows:** Start menu → type `PowerShell` → open it.
   - **Mac:** press ⌘ Space → type `Terminal` → open it.
4. Check it worked by typing the following and pressing Enter. You should see a version number,
   such as `v22.x.x`:
   ```
   node -v
   ```

### 2. Open the project
1. Unzip `news-waterfall.zip`, for example into your Documents folder.
2. In the terminal, go to that folder:
   ```
   cd Documents/news-waterfall
   ```
   (On Windows you can also type `cd ` with a space, drag the folder into the window, then press
   Enter.)

### 3. Install the dependencies (one time only, takes a minute or two)
```
npm install
```

### 4. Run the desktop widget (Windows / Mac / Linux)
```
npm start
```
- A small dark panel appears near the top-right of your screen. The first headlines arrive within
  a few seconds.
- **To move it,** drag anywhere on the panel.
- **To resize it,** drag its edges or corners. It remembers its size and position.
- **To close it,** press Ctrl+Q (Windows/Linux) or ⌘Q (Mac), or close it from the taskbar or
  Dock.
- **Options** (edit `config.json`, then restart):
  - `"alwaysOnTop": true` keeps it above other windows.
  - `"openAtLogin": true` starts it when you log in.
  - `width` and `height` set the starting size.

### 5. Make an installable app for your computer
Run this on the kind of computer you're building for:
```
npm run dist
```
The installer appears in the `release/` folder:
- **Windows:** a `.exe` installer plus a portable `.exe`.
- **Mac:** a `.dmg`.
- **Linux:** an `.AppImage`.

Double-click it to install. Windows SmartScreen or macOS Gatekeeper may warn you that the app is
"unrecognised" because it isn't code-signed yet:
- **Windows:** choose *More info → Run anyway*.
- **Mac:** right-click the app → *Open*.

### 6. Use it on a phone or tablet (same Wi-Fi as your computer)
1. On the computer, run:
   ```
   npm run server
   ```
2. The terminal prints an address like `http://192.168.1.23:8787/`. Keep that window open.
3. On the phone or tablet, open that address:
   - **Android:** in Chrome.
   - **iPhone/iPad:** in Safari.
4. Add it to the home screen:
   - **iPhone/iPad:** Share button → **Add to Home Screen**. It then opens full-screen like an app.
   - **Android:** Chrome menu ⋮ → **Add to Home screen**.

     Over a plain local `http://` address, Android opens it as a browser shortcut. A full-screen
     installed app needs HTTPS (see "Public release" below).
5. To keep the screen on, use the device's own setting (Display → screen timeout), or use a
   charging stand. Guided Access on iPhone and Screen Pinning on Android lock the device to this
   one screen.

### 7. Check source health
Open `http://localhost:8787/api/health` while the server is running. It shows which feeds are
working, which are failing and why.

### 8. Run the tests
```
npm test                 # 47 automated tests, no internet needed
npm run test:browser     # 25 real-browser checks (needs Google Chrome or Microsoft Edge installed)
npm run test:app         # 10 checks of the phone app bundle with every feed simulated
```

### Public release: what it would take
- **Desktop.**
  - Code-signing removes the security warnings. This needs an Apple Developer account (paid
    yearly) for macOS, and a Windows code-signing certificate (paid).
  - Without signing, the app still works. Users just see a warning when they install it.
- **Phones away from home.** The phone version needs the news service running somewhere online
  with HTTPS.
  - Running it on your own always-on computer is free.
  - Cloud hosts sometimes offer free tiers, but terms change often. Check current pricing before
    relying on one.
  - Running costs are small: one small Node process, a few MB of memory, and a few hundred feed
    checks per hour, mostly answered with "unchanged".
- **App stores.**
  - Google Play needs a one-time developer fee. The Apple App Store needs the yearly Apple
    Developer membership.
  - Apple may reject a pure web wrapper. A native WidgetKit widget (Part F) is the stronger
    submission.
- **Publisher terms.** Before a public launch, read each publisher's RSS terms. Most allow showing
  headlines with attribution for non-commercial use. A few restrict commercial or redistributed
  use. Remove any source whose terms don't fit how you'll distribute the app.

**Free for whom?**
- **End users:** completely free in every version. No ads, no tiers, no accounts.
- **You, the developer:** the desktop app costs nothing to run. The phone version costs nothing if
  you host it yourself. Optional paid items are code-signing, app-store fees and cloud hosting.

---

## Part F — Testing status and expansion roadmap

### Tests already run (in the build environment, Node 22 + Chrome)

**47 automated tests — all passing**
- Headlines always move downwards: thousands of frame-by-frame position checks.
- Headlines enter at the top, leave at the bottom, and never re-enter.
- The feed advances on its own.
- Headlines never overlap. Re-wrapping on resize is safe.
- Speed changes are smooth, and there are no jumps after a stall.
- With no news, the flow eases to a stop, then resumes when news arrives.
- Identical, reformatted, same-URL, same-guid and near-duplicate headlines are all rejected.
  Different stories are kept.
- The history of shown headlines survives a restart.
- Parsing works for RSS 2.0, RSS 1.0, Atom and GDELT, including entities, CDATA, HTML in titles,
  time zones and future dates.
- Requests to GDELT are spaced out as it asks. Headlines are released as each source answers.
- Fresh news keeps entering on later checks. Sources are only re-checked when due. Conditional
  requests are sent.
- Back-off works for failing sources. `Retry-After` is honoured.
- Offline detection works and recovers. Timeouts and malformed feeds are handled.
- The API's cursor logic works, static files are served, and path traversal is blocked.
- The interface has no controls, links or inputs.
- No paid, keyed or restricted feeds are used. The tests also check that coverage is broad across
  regions and categories.

**25 real-browser checks — all passing**
Tested at four sizes: 3×4 phone widget size, desktop widget, tablet, and the minimum size.
- Headlines move only downwards and advance on their own.
- There's no overlap and no clipped text. Very long words wrap.
- The page contains no interactive elements, and wheel scrolling does nothing.
- New headlines are delivered and none are duplicated.
- No script errors.
- An accelerated long run had zero repeats.

**10 phone-app checks — all passing**
The real app bundle runs in an Android-sized browser, with all 88 sources simulated.
- The engine runs in-app, and the first headline appears in about 2 seconds.
- 80 or more sources are fetched and parsed.
- GDELT results are credited to their own outlets.
- Headlines move downward only.
- Fresh news keeps entering.
- Going offline and coming back is handled.
- Zero repeats, no controls, no errors.

### Not yet verified — you need to check these
1. **Live feeds.** The build environment had no access to the internet, so ingestion was tested
   with realistic recorded-format feeds, not live publisher feeds.
   - The first time you run the app, open `/api/health`.
   - Any feed whose address has changed will show as failing and is skipped automatically.
   - Fix or remove failing feeds in `core/sources.js`.
2. **The phone app on a real device.** Android's build tools couldn't be downloaded in the build
   environment, so the APK hasn't been compiled there. Build it with the GitHub workflow or
   Android Studio (see PHONE-APP.md).
3. **The Electron desktop window itself.** Electron couldn't be downloaded in the build
   environment. The desktop code passed a syntax check, but `npm start` and `npm run dist` haven't
   been run there yet.
4. **Physical devices.** Check the iPhone/iPad and Android home-screen behaviour, screen wake, and
   battery use during long sessions.
5. **Windows and macOS installers.** Check that they install, and that the app starts at login if
   you enable that option.

### Roadmap
| Stage | Work | Status |
|---|---|---|
| 1 | News engine, deduplication, waterfall display, desktop widget, phone/tablet web version, tests | ✅ Implemented |
| 2 | Verify live feeds; swap out any dead feed addresses | ⏳ Your first run |
| 3 | Deploy the service with HTTPS so phones work away from home and install full-screen | Planned |
| 3b | **Phone app** (Android + iOS via Capacitor) with the engine built in, keep-awake, full-screen, and a free cloud APK build | ✅ Implemented. Not yet run on a physical phone |
| 4 | **Android 3×4 widget** (Kotlin): an `AdapterViewFlipper` with a slide-down in/out animation and `autoStart` + `flipInterval` of about 6 s. Headlines step downward, one at a time, with no interaction needed. Data comes from `/api/headlines` through a `RemoteViewsService`, refreshed by `WorkManager` (minimum 15 min) | Planned. This is a native project (Android Studio) |
| 5 | **iOS/iPadOS widget** (SwiftUI + WidgetKit): a timeline of snapshots showing the 5–6 newest unseen headlines, refreshing within Apple's budget. Paired with the full-screen app for the continuous waterfall | Planned. Needs a Mac + Xcode |
| 6 | Code-signing, auto-update, app-store listings | Planned (paid developer accounts) |
