# SignBridge — Sign ⇄ Text ⇄ Speech

Plain HTML/CSS/JS. No build step.

## Run

Camera and microphone need `localhost` or `https`, so serve the folder:

```bash
cd "/Users/aghaste/Documents/WEB app/sign language" && python3 -m http.server 8080
```

Then open http://localhost:8080 in Chrome or Edge.

## Publish on GitLab Pages

`.gitlab-ci.yml` copies the app into `public/` and deploys it on every push to the default branch.

1. Create an empty project on gitlab.com.
2. Push this folder to it (replace the URL with your project's):

   ```bash
   git init -b main
   git add .
   git commit -m "SignBridge"
   git remote add origin https://gitlab.com/<your-username>/<project-name>.git
   git push -u origin main
   ```

3. Wait for the `pages` job under **Build → Pipelines**, then open the link shown in
   **Deploy → Pages** (usually `https://<your-username>.gitlab.io/<project-name>/`).

If the site asks visitors to sign in, turn off **Use unique domain** / set Pages visibility to
*Everyone* under **Settings → General → Visibility**.

## Features

- **Sign → Speech**: webcam + MediaPipe Hand Landmarker (loaded from CDN). A rule-based classifier
  reads finger positions and types all 26 ASL letters (J and Z by tracking the movement), plus
  🤟 "I love you" and open hand (5) = space. On phones, a button over the video switches between
  the front and back camera. Hold a sign until the ring fills. Each word is spoken
  when you add a space; **Speak** reads the whole message.
- **Speech → Sign**: speak into the mic (Web Speech API) or type. The text is fingerspelled as
  animated hand drawings; "I love you" uses its own sign.
- **Alphabet**: all 26 ASL letters. Click one to hear it.

## Files

- `index.html` — layout
- `style.css` — styles (light/dark)
- `signs.js` — draws each handshape as SVG
- `app.js` — camera detection, classifier, speech synthesis and recognition, playback

## Tuning detection

Thresholds live in `classify()` in `app.js`; J and Z are in `detectMotion()`. The closed-fist
letters (A, S, T, N, M, E) differ only in where the thumb sits, so they are the least reliable —
good lighting and facing the palm square to the camera help.
