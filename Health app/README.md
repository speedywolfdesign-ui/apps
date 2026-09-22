# BTC 41 Days Transformation Tracker (PWA)

A plain **HTML + CSS + JavaScript** progressive web app for the Family Care Community
*BTC Season 1 – 41 Days Transformation Tracker* and the *BTC Activity Tracker* sheets.
No build step, no framework, no server: open `index.html` (or host the folder) and it runs.

## What it does

| Area | Detail |
|---|---|
| **Home** | The active participant's hero (day X of 41, points, consistency), a scrollable row of **other participant cards**, then their daily records listed **newest first** with day number, habit chips, score and photo thumbnails. Tap a card to switch to that person. |
| **Participants** | Several people can be tracked on one device — each has their own profile, goal, start date, records, photos, weekly check and final results. Add, switch, edit or delete them from the card row, the header chip or **More → Participants**. |
| **Navigation** | A mobile-style **bottom tab bar**: Home · Weekly · ＋ (today's record) · Export · More. "More" opens a bottom sheet with Participants, Profile, Weekly, Backup and Install. |
| **Daily record** | Everything from both printed sheets: the 5 habits (Fuel, Sleep, Water, Lunch, Steps) with a live /5 score, weight & inches, daily activity (name, %, points /10, fuel added), recipe tracker (healthy fuel + dyno laddu, "posted in group?"), fuel program (basic / personalized / advanced + 5 additional fuels), 2-day detox and notes. |
| **Progress photos** | Three fixed poses — **front facing, right facing, back side**. Tap a tile to open the in-app camera, or use the upload buttons for the gallery. Photos are downscaled to 1400 px JPEG and stored on the device. |
| **Weekly & final** | Week 1–6 (day 1–7 … 36–41) weight, inches and POOR/OKAY/GREAT feeling, with points auto-totalled from the daily ticks, plus the Day 41 final results block. |
| **Export** | Pick the **participant** and a **date range** (presets: all, last 7 days, full 41 days, week 1–6), choose which sheets to include, and attach a **before** and **after** photo. Output: print / save as PDF, download standalone HTML, download CSV, or share. |
| **Backup** | JSON backup/restore of **every participant** including photos, and a wipe-everything option. Backups written by the earlier single-profile version still restore. |
| **PWA** | Installable (manifest + icons + app shortcuts), works offline through a service worker, data stored in IndexedDB. |

The export document reproduces the printed layout: the 41-column habit grid with ✓/✗ ticks and
totals, the weekly progress check, final results, the Hindi/English activity tracker with recipes,
fuel program and detox panels, and a progress-photo sheet with the before/after pair.

## Run it

```bash
cd "Helth app"
python3 -m http.server 8000
# then open http://localhost:8000
```

A server (or any https host) is required for the service worker, the install prompt and the in-app
camera — browsers only allow `getUserMedia` on `https://` or `localhost`. Opening the file directly
still works for data entry; the app falls back to the phone's camera app when `getUserMedia` is
unavailable.

To install on a phone: open the URL in Chrome/Safari → menu → **Add to Home Screen**.

## Files

```
index.html          app shell, bottom tab bar, "More" sheet, camera and photo modals
css/style.css       all styling (green/yellow theme from the printed sheet)
js/db.js            IndexedDB: participants, records, photos (v1 databases migrate automatically)
js/photos.js        camera capture, gallery pick, downscaling, blob helpers
js/export.js        builds the printable sheets (HTML) and the CSV
js/app.js           router, views, state, export flow
manifest.json       PWA manifest (icons, shortcuts, standalone display)
sw.js               service worker (offline app shell)
icons/              app icons (192, 512, maskable, apple-touch)
```

## Notes

* All data lives **only on the device** in IndexedDB — nothing is uploaded anywhere. Use
  *Backup & restore* before clearing browser data or switching phones.
* Records, photos, weekly checks and final results are **per participant**; switching participants
  changes the whole home screen, and exports are produced for one participant at a time.
* Day numbers come from the **start date** in Profile, so set that first.
* The printed sheet labels its last two week boxes "WEEK 5 (DAY 22–28)" and "WEEK 7 (DAY 36–41)";
  the app uses the corrected, continuous ranges Week 5 = day 29–35 and Week 6 = day 36–41.
* Exports print best in **A4 landscape**; ranges longer than 21 days split the activity table into
  side-by-side columns so each sheet stays on one page.
