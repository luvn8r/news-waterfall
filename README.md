# Headlines — a never-ending waterfall of world news

This app shows real headlines from 80 free feeds by 68 news outlets, plus GDELT's worldwide news index
(thousands more outlets). They flow gently **downwards**, forever. There are no buttons, no scrolling,
no ads, no accounts, and it costs nothing.

**Phone app (Android + iPhone):** see **[docs/PHONE-APP.md](docs/PHONE-APP.md)**. It includes a
free cloud build that makes the Android install file for you.

## Quick start (needs Node.js 22+ from nodejs.org)

```
npm install          # one time
npm start            # desktop widget (Windows / macOS / Linux)
npm run android      # phone app → opens in Android Studio
npm run server       # browser version for other devices on your Wi-Fi
npm test             # automated tests
```

The full beginner guide is in **[docs/GUIDE.md](docs/GUIDE.md)**. It covers what the app does,
platform limits, the architecture, installation, packaging, test status and the roadmap.

Licences: the code is MIT. The Inter font is under the SIL OFL (see `display/fonts`). Headlines
belong to their publishers and are shown with the publisher's name.
