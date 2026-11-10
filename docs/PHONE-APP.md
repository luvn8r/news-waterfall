# Headlines — the phone app

A full-screen app for Android phones and tablets, and later iPhone and iPad. It shows a
never-ending, downward-flowing stream of the newest headlines from news outlets around the world.

There's nothing to tap. Open it and the world's headlines flow. The screen stays on while it's
open, and the status bar is hidden.

## What's inside

- **The news engine runs inside the app.** It doesn't need a computer, server, account or
  subscription. The app reads publishers' free feeds directly over Wi-Fi or mobile data.
- **Sources:**
  - 80 named publisher feeds from 68 outlets in 28 regions, including ABC, SBS, The Guardian, the
    Sydney Morning Herald, Brisbane Times, BBC, Al Jazeera, The Hindu, Dawn, CNA, Yonhap,
    News24, Premium Times, PBS, CBC, Le Monde, Kyiv Independent, Nature and WHO.
  - **GDELT**, a free, open index that watches news websites across the world. It updates every
    15 minutes and covers thousands of outlets, not just the big names.
  - Each headline is labelled with its own outlet, for example `BRISBANETIMES.COM.AU · AUSTRALIA`.
- **Newest first, never repeated.** Different wordings of the same story from different outlets
  are shown once. Headlines you've already seen stay hidden after you close and reopen the app.
  When news runs low, the flow slows. If there's nothing new at all, it stops and waits rather
  than repeating anything.

## Honest limits

- **"Every free outlet in the world" isn't literally possible.** There are tens of thousands of
  outlets, in many languages, and most don't offer a feed. This app gets as close as is free and
  legitimate: the hand-picked feeds plus GDELT's worldwide index. GDELT covers English-language
  outlets of every size and quality. To show only the named publishers, delete the `GDELT` lines
  in `core/sources.js`.
- **It flows only while the app is open on screen.** Phones pause apps in the background. When
  you return, it checks for news straight away.
- **Data use.** It downloads a few megabytes per hour (feeds are compressed). Wi-Fi is best for
  all-day use.
- **Screen burn-in.** On OLED screens left on for days, use a moderate brightness.

---

## Get it onto your Android phone

There are two ways to do this. **Option A** needs no installs on your computer. **Option B**
uses Android Studio.

### Option A — let GitHub build it for you (free, all in a web browser)
1. Create a free account at **github.com**.
2. Click **+ → New repository**. Name it `headlines`, choose **Private**, then click **Create**.
3. Upload the project. The easiest way is **GitHub Desktop** (free, at desktop.github.com):
   1. Choose *File → Add local repository* and pick the unzipped `news-waterfall` folder.
      Choose "create a repository" if it asks.
   2. Click **Publish repository**.

   The web page's *uploading an existing file* link also works, but it only accepts 100 files
   at a time.
4. On GitHub, open your repository → the **Actions** tab. The **Build Android app** run starts
   by itself and takes about 5–10 minutes. You can also start it yourself with **Run workflow**.
5. When it shows a green tick, click the run, scroll to **Artifacts** and download
   **Headlines-android-app**. You get a `.zip` with `app-debug.apk` inside.
6. Install it on your phone:
   1. Send the `.apk` to your phone, for example by email to yourself, Google Drive or a USB
      cable.
   2. Tap it. Android will ask to allow installs from that app, for example Files or Chrome.
      Allow it, then tap **Install**.
   3. Android may show a *"Play Protect"* warning because the app isn't from the Play Store.
      Choose **Install anyway**. It's your own app.
7. Open **Headlines** from your app drawer. That's it.

### Option B — build it on your computer with Android Studio
1. Install **Node.js 22 LTS** (from nodejs.org) and **Android Studio** (free, from
   developer.android.com/studio). Accept the default setup. It downloads the Android tools for
   you.
2. Unzip the project, open a terminal in the folder, and run:
   ```
   npm install
   npm run android
   ```
   This prepares the app and opens it in Android Studio. The first time, wait for
   "Gradle sync" to finish (bottom status bar).
3. Put the app on your phone, either way:
   - **Plug the phone in by USB.** First turn on *Developer options* (Settings → About phone →
     tap **Build number** 7 times). Then turn on *USB debugging*. Choose your phone at the top
     of Android Studio and press the green **▶ Run** button.
   - **Or make the file:** choose *Build → Build App Bundle(s) / APK(s) → Build APK(s)*, then
     click **locate**. Copy `app-debug.apk` to the phone and install it as in Option A, step 6.

## iPhone and iPad
The iOS project is included (`ios/`). Building it needs a **Mac with Xcode** (free). Run
`npm install` and then `npm run ios`. Choose your iPhone at the top of Xcode and press ▶. You'll
sign in with your Apple ID: a free account lets you install on your own device for 7 days at a
time. Keeping it installed permanently, or putting it on the App Store, needs the paid Apple
Developer Program.

## Updating the news sources
Edit `core/sources.js`. Then either push to GitHub (Option A rebuilds automatically) or run
`npm run android` again (Option B).

## Tests
```
npm test           # 47 automated tests (engine, deduplication, motion, parsing, GDELT, offline)
npm run test:app   # 10 checks of the real app bundle in a phone-sized browser, with all feeds simulated
```
