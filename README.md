# Cutroom — Windows setup without Docker
1. Install Node.js 22, MongoDB Community Server (as a running Windows service), and FFmpeg including ffprobe and the subtitles filter. Put the FFmpeg bin folder on PATH. For YouTube imports also put the standalone yt-dlp.exe on PATH. Uploads work without yt-dlp.
2. Extract this ZIP and open the cutroom folder in VS Code. Open a new terminal. Check that node -v, ffmpeg -version and ffprobe -version work.
3. Run each command in order:
```sh
npm install
npm run build
npm start
```
4. Open http://localhost:3000. For a first test upload a short MP4. The first speech analysis downloads a multilingual Whisper model and requires internet. Audio transcription and clip selection run in Node.js. Set MONGO_URL if using a separate MongoDB instance. This is a local single-user app.

## Optional Docker setup
A single-user, local MERN video editor. Install Docker Desktop, unzip the folder, open a terminal in the folder containing compose.yaml and run:
```
docker compose up --build
```
Open http://localhost:3000. The first build downloads dependencies. MongoDB and media persist in Docker volumes. Stop with Ctrl+C.

Paste a YouTube video link you can reuse, or upload an original browser-playable MP4. Link imports require internet and may fail when YouTube restricts access. Use an H.264/AAC MP4 for broad preview compatibility. Pick start and end in seconds or use Mark here while scrubbing. Reframe horizontally, enter a short caption and pick a font. Use line breaks for long captions. Save edits to reopen the project. Export MP4 renders a 720×1280 clip up to 180 seconds, with audio when the source contains it. Manual caption text replaces timed captions throughout the selected clip.

React and Vite provide the editor. Express on Node serves the API and the built frontend. MongoDB stores edit settings. FFmpeg renders the output on the server. yt-dlp imports supported videos. Local single-user use only.

## Auto Short
Leave Auto Short on import checked and paste a link or upload a video. The app downloads the multilingual Whisper base model at first use (internet required), transcribes speech on the CPU, ranks excerpts by speech density, pauses and sentence endings, and renders one vertical MP4. Click Download Auto Short MP4 when rendering finishes. The initial model download and long videos can take time. A silent video uses the opening 30 seconds without captions. Saved timings and captions can be reopened and exported again. The selector prioritizes dialogue and does not identify visual-only gameplay highlights.
