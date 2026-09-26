# Metra Live Network

A live map of every Metra train in the Chicago region, moving in real time on a clean schematic diagram of the whole system.

Built to sit on a second monitor like an aquarium: quiet, calm, and fun to watch for hours. Also works on a phone.

**Live site:** `https://evan-dawkins.github.io/metra-live-network/`

---

## What you see

- **All 11 Metra lines and 238 stations**, drawn as a schematic (straight lines and 45° turns) matched to Metra's own system diagram, including the Rock Island Beverly Branch, the Metra Electric South Chicago and Blue Island branches, the UP-NW McHenry Branch, and all four downtown terminals (Ogilvie, Union Station, LaSalle Street, Millennium).
- **Real trains, live.** Each train is an arrow pointing the way it's heading, with a soft fading trail showing where it has just been.
- **Service alerts** from Metra, in a small dropdown in the top bar. Lines with alerts get a tiny amber dot.
- **Clean station names at every zoom level.** Labels are placed using their real measured size and never overlap each other, the tracks, or other stations.

## What you can do

| Action | Desktop | Phone |
|---|---|---|
| Move around | Drag | Drag with one finger |
| Zoom | Scroll wheel, or `+` / `−` | Pinch |
| See the whole network | **Whole network** button, or `0` | **Fit** button |
| Focus one line | Click its name in the bottom bar | Tap its name in the bottom bar |
| Inspect a train | Click it | Tap it |
| Read alerts | Click the alerts button | Tap the alerts button |
| Light / dark mode | **Light / Dark** button, or `T` | **Light / Dark** button |
| Close things | `Esc` | Tap the map |

## Honest by design

- **Nothing is made up.** Train positions, directions, and alerts come only from Metra's live feeds. Anything the feed doesn't provide (like departure and arrival times) is shown as "Not in live feed" instead of guessed.
- **Trains never run ahead of the data.** A marker glides smoothly between two real GPS reports and stops at the newest one. Direction comes only from real GPS reports.
- **Clear status.** The top bar always says whether data is Live, Updating, Delayed, Offline, or Simulated, when it last updated, and when the next check is.
- **Simulated mode is opt-in and labelled.** If the live feed can't load, the dashboard offers fake trains so there's something to look at. They're marked "Simulated" everywhere and are never mixed with real trains.

## How it works

```
Metra's live feeds  →  Cloudflare Worker (worker.js)  →  index.html in your browser
 (protobuf, ~30 s)      decodes to clean JSON              draws the map and trains
```

- **`index.html`**: the whole dashboard in one file. No build step, no install. Open it in a browser or host it anywhere.
- **`worker.js`**: a small Cloudflare Worker that fetches Metra's GTFS-realtime **vehicle positions** and **service alerts** feeds, decodes them by hand (no libraries), and returns JSON. It's needed because browsers can't call Metra's feed directly, and Metra's license asks that apps serve the data through their own server rather than sending users to Metra's.
- The dashboard checks for new data every 30 seconds, which is how often Metra updates its feed.

## Setting up your own copy

1. **Get a Metra API key** by filling out the form at [metra.com/developers](https://metra.com/developers).
2. **Create a Cloudflare Worker**, paste in `worker.js`, and click **Deploy**.
3. **Add your key as a secret** on the Worker (Settings → Variables and Secrets) named `METRA_API_TOKEN`. The key lives only in Cloudflare, never in this repo.
4. **Point the dashboard at your Worker**: in `index.html`, change `WORKER_URL` to your Worker's address.
5. **Host the page**: turn on GitHub Pages for this repo (Settings → Pages → branch `main`, folder `/ (root)`). The dashboard is named `index.html`, so it opens straight from the site's main link. You can also just open the file in a browser.

## Files

| File | What it is |
|---|---|
| `index.html` | The dashboard |
| `worker.js` | The Cloudflare Worker (backup copy; Cloudflare is what actually runs it) |
| `README.md` | This file |

## Updating the dashboard

Replace `index.html` with the new version (Add file → Upload files, same name) and commit. GitHub Pages republishes it in about a minute, and the link stays the same.

## Notes

- Metra only. CTA 'L' trains aren't included.
- Your choice of light or dark mode isn't saved. It follows your device's setting each time the page opens.
- Train data from Metra's public GTFS-realtime feeds. This is an independent project and isn't affiliated with Metra.
