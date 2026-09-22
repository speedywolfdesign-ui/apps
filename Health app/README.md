# BTC 41 Days Transformation Tracker (PWA)

A plain **HTML + CSS + JavaScript** progressive web app for the Family Care Community
*BTC Season 1 – 41 Days Transformation Tracker* and the *BTC Activity Tracker* sheets.
No build step, no framework, no server: open `index.html` (or host the folder) and it runs.

## What it does

| Area | Detail |
|---|---|
| **Home (before registering)** | A single call to action: **Register for the 41 Day Challenge**, with the three steps spelled out, plus the events carousel. Nothing else is shown until someone is registered. |
| **Events** | Community events — **Teams call, Google Meet, Zoom, in person or other**. The creator adds a title, date, start/end time, the meeting link, details and an optional image. They are ordered by the next date first and appear as a **carousel on Home**, ending with a **Show all** tile that opens the events page (upcoming, then past). Tapping one opens its details with a **Join** button; the create / edit form and the details both open in a modal above everything else. |
| **Home (after registering)** | The participant's hero, the events carousel, then the two things they use every day as big buttons: **41 Day Challenge** (habit tracker, day X of 41) and **BTC Activity Tracker** (activity, recipes and fuel program, day X of 21). Each shows a progress bar, how many days are logged and whether today is already done. Below that: stats, other participant cards, and the daily records newest first with a chip per tracker. |
| **Registration** | Name, gender, age, height and starting weight, plus club, operator, coach, season, start date and goal — then the three before photos (front, side, back). The photos are shown back as a **preview** with a confirmation tick box; the form will not submit until the details, the three photos and the confirmation are all there. |
| **One person per device** | Registration happens **once**. There is no second profile and no switching: opening the registration form again just says who is registered. To track someone else, or to restart the 41 days, use **Profile → Delete registration and start over**, which clears the profile, every record and all six photos (events are kept) and brings back the register screen. Take a backup first if you want to keep a copy. |
| **Navigation** | A mobile-style **bottom tab bar**: Home · Weekly · ＋ · Export · More. ＋ asks which of the two daily forms to open (and sends an unregistered person to registration). The header chip opens the profile. "More" opens a bottom sheet with Events, Profile, Weekly, Backup and Install. Every page except Home shows a **back arrow and the page name** in the top-left. |
| **Forms** | Inside a form the tab bar is replaced by a fixed **Cancel / Save** bar, so saving is always one thumb-reach away. |
| **41 Day Challenge** (daily) | The 5 habits (Fuel, Sleep, Water, Lunch, Steps) with a live /5 score, weight, inches lost and notes. Filled in every day for 41 days. |
| **BTC Activity Tracker** (21 days) | Daily activity (name, %, points /10, fuel added), recipe tracker (healthy fuel + dyno laddu, "posted in group?"), fuel program (basic / personalized / advanced + 5 additional fuels) and the 2-day detox. A separate form, reached from its own home button. |
| **One record per day** | Both forms write into the same day's record without touching each other's fields, so the export sheets stay complete. Each form links across to the other for the same date. |
| **Proof photos** | Three fixed poses — **front, side, back** — captured **twice only**: the **before** set when a participant registers (required to add them), and the **after** set at export time. Tap a tile for the in-app camera, or upload from the gallery. Photos are downscaled to 1400 px JPEG and stored on the device. Daily records do not ask for photos. |
| **Weekly & final** | Week 1–6 (day 1–7 … 36–41) weight, inches and POOR/OKAY/GREAT feeling, with points auto-totalled from the daily ticks, plus the Day 41 final results block. |
| **Export** | Pick a **date range** (presets: all, last 7 days, full 41 days, week 1–6), choose which sheets to include, and click or upload **all three after photos** — the photo sheet will not print until the full before/after proof is there. Output: print / save as PDF, download standalone HTML, download CSV, or share. |
| **Backup** | JSON backup/restore of the registered person including photos and all events, and a wipe-everything option. Backups from earlier versions still restore; if one holds several people, Home says so and offers to remove the extras rather than dropping them silently. |
| **PWA** | Installable (manifest + icons + app shortcuts), works offline through a service worker, data stored in IndexedDB. |

The export document reproduces the printed layout: the 41-column habit grid with ✓/✗ ticks and
totals, the weekly progress check, final results, the Hindi/English activity tracker with recipes,
fuel program and detox panels, and a proof sheet pairing the before and after shot of each of the three poses.
The participant's gender, age, height, starting weight and start date are printed on every sheet header.

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
js/db.js            IndexedDB: participants, records, before/after photos, events
                    (v1/v2 databases and older per-day photos migrate automatically)
js/events.js        events: types, the create/edit and details modals, carousel and list
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
* One person is registered per device. Records, photos, weekly checks and final results all belong to
  them; to track someone else, delete the registration from Profile and register again.
* Day numbers come from the **start date** in Profile, so set that first.
* The printed sheet labels its last two week boxes "WEEK 5 (DAY 22–28)" and "WEEK 7 (DAY 36–41)";
  the app uses the corrected, continuous ranges Week 5 = day 29–35 and Week 6 = day 36–41.
* Exports print best in **A4 landscape**; ranges longer than 21 days split the activity table into
  side-by-side columns so each sheet stays on one page.
