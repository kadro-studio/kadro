# Kadro

**English** · [Русский](README.ru.md)

**Kadro** (Esperanto for "frame") is a free, open-source video editor. Feature-wise it aims at Movavi Video, Filmora, CapCut and Adobe Premiere Pro, but it is written from scratch without borrowing their code.

No licences, no watermarks, no subscriptions and no accounts. The project lives on voluntary support.

**[kadro.studio](https://kadro.studio)** · **[Download for Windows](https://github.com/kadro-studio/kadro/releases/latest)**

Electron + React + TypeScript, its own WebGL2 compositor, FFmpeg for decoding and encoding, and AI models that run right on your computer. The interface is in English, Ukrainian and Russian.

## Features

**Editing**
- Multi-track timeline: add, remove and rename tracks; hide, mute, solo and lock them; drag to change track height
- Tools from professional editors: select, track select forward, ripple, roll, slip and slide edits, razor
- Snapping to clip edges, the playhead and markers; ripple delete and close gaps
- Copy, cut, paste, duplicate, paste attributes (colour, effects, mask, animation…); undo and redo
- Paste from the clipboard (Ctrl+V): files copied in Explorer, screenshots and pictures go to the media bin and onto the timeline, text becomes a title
- Named, coloured markers (draggable on the ruler), in/out points (I/O) with export of just that range, loop playback (whole project or the I/O range)
- Shift with the razor cuts every track at once; there is also a single command to split all tracks
- Cut a clip at scene changes, beat markers from the music's tempo, import .srt / .vtt subtitles
- Clip speed 0.1×–16× without pitch change, freeze frame, reverse, detach audio

**Picture**
- Move, crop, rotate and stretch (width and height separately) right in the preview with the mouse; keyframes with smooth easing
- Colour correction, lift / gamma / gain colour wheels, RGB curves, HSL selective colour (8 ranges), 3D LUT import (`.cube`), 15 film-look filters
- Your own filters: colour, curves, LUT and clip effects saved as one preset and applied to any clip
- Adjustment layers, 18 blend modes (overlay, soft light, colour dodge/burn, colour, luminosity…), chroma key, masks
- 20 shader effects and 12 shader transitions plus 22 classic transitions, in and out animations
- One-click layouts: picture-in-picture, split screen, three columns, 2×2 grid
- Stabilisation of shaky footage (vid.stab, two passes)
- Video scopes: waveform, RGB histogram, vectorscope

**Text and elements**
- 22 title styles and 24 bundled fonts with Cyrillic (OFL), gradient fill, font weight, UPPERCASE, outline, shadow, background box; system fonts are available too
- Your own fonts (TTF, OTF, WOFF): the "+" button in the font picker or just drop the file onto the window; your own title styles keep their animation and position
- 17 animated elements drawn by shaders: light leaks, film grain, bokeh, snow, rain, confetti, sparkles, fog, lens flares, VHS, old film, fireflies, a frame and backgrounds (stars, aurora, gradient, synthwave)
- 14 shapes, emoji stickers, colour mattes

**Sound**
- Volume up to 400 % with keyframes, fade in and out, three-band EQ, compressor
- Noise reduction and EBU R128 loudness normalisation (−14 / −16 / −23 LUFS), music ducking under speech
- Voice-over recording from the microphone during playback; L/R level meter

**AI (local, no cloud)**
- Automatic subtitles (Whisper) with `.srt` export
- Background removal for video and images (MODNet) with transparency

**Online library**
- Free video (Wikimedia Commons), photos, music and sound effects (Openverse) without sign-up; Pexels and Pixabay with a free personal API key
- Free licences only (CC0, public domain, CC BY / BY-SA, the Pexels and Pixabay licences); author and licence are kept in the project, and File → Credits lists them for your end titles

**Mods and the workshop**
- Your own effects, transitions and animated elements in GLSL, in `.vrmod` files — see [MODS.md](MODS.md) (in Russian); a built-in catalogue of examples, including a pack of trending effects and transitions (beat zoom, strobe, RGB shake, shine, whip pan, spin blur…)
- Import a shader from Shadertoy by link or code as an effect or an element, keeping the original author and licence
- Community workshop (opening soon; the Workshop tab and [kadro.studio/workshop](https://kadro.studio/workshop/)): effects, transitions, elements, filters, title styles, LUTs, themes and project templates install in one click and are published straight from the app — the server is in [workshop/](workshop/README.md)
- Your own LUT library and appearance themes

**Project templates**
- Like in CapCut: a finished edit with numbered slots — put in your own clips, and the effects, transitions, titles and music timing stay in place
- Any project can be saved as a template (File → Templates…): its files become slots, mods and LUTs travel inside the template, and paths to your files are never stored

**Media and projects**
- Your own TikTok video by link: downloaded once into the media bin (yt-dlp is fetched on first use from its official release and checked against its checksum)
- Import with a button or drag and drop; formats Chromium cannot play (HEVC, ProRes, AVI, MKV with AC3…) get proxies, heavy 4K files get lightweight copies for smooth playback; export always uses the originals
- `.vrproj` projects open with a double-click, autosave and crash recovery
- Automatic updates: the installed version downloads a new release in the background and installs it on restart

**Export**
- MP4 (H.264 / H.265), WebM (VP9), MOV (ProRes), GIF, MP3, WAV
- NVENC / Quick Sync / AMF hardware encoding when available
- Ready-made presets (YouTube, TikTok/Reels/Shorts, messengers, ProRes, WebM, GIF, MP3) and your own; custom video and audio bitrate, any frame height
- Preview and export are drawn by the same engine, so the result matches what you see

**Interface** — five themes (graphite, midnight, mocha, OLED, light), any accent colour, interface scale and corner radius, a custom window title bar and dialogs, English, Ukrainian and Russian, resizable panels. Any command can be bound to any key (Help → Keyboard shortcuts). Title, filter and export presets move to another computer in a `.kadropresets` file (Preferences → Mine).

## Running from source

Node.js 20+ is required.

```bash
npm install
```

Development mode (hot reload of the interface, automatic restart of the main process):

```bash
npm run dev
```

Build and run the built version:

```bash
npm run build
```

```bash
npm start
```

Windows installer (English, Ukrainian and Russian, styled like the app) and portable version (in `release/`):

```bash
npm run dist
```

Releasing: a `vX.Y.Z` release on GitHub carries `Kadro-Setup-X.Y.Z.exe`, `Kadro-Setup-X.Y.Z.exe.blockmap`, `latest.yml` and `Kadro-X.Y.Z-portable.exe`. Installed copies read `latest.yml`, download the new version (electron-updater checks its SHA-512) and install it on restart; the portable version only reports the new release. The start-up check can be turned off in Preferences.

The product name and title bar colours are set in `src/shared/brand.ts`, the installer name in `package.json` (`productName`, `build`). Icon: `build/icon.png`, from which `npm run icon` builds `build/icon.ico`; the installer artwork is drawn from `build/installer-art.html` with `npm run art`.

FFmpeg and FFprobe come with the `ffmpeg-static` and `ffprobe-static` packages. To use your own builds, set the `VR_FFMPEG` and `VR_FFPROBE` environment variables.

## Architecture

```
src/
  shared/                IPC contract (api.ts) and product name (brand.ts)
  main/                  Electron main process (Node.js)
    index.ts             window, dialogs, IPC, worker processes
    protocol.ts          media:// — serves local files with Range and CORS support
    media.ts             ffprobe, thumbnails, waveforms, proxies, stabilisation, noise reduction
    render.ts            export: frame decoders and the FFmpeg encoder, audio mixing
    mods.ts              mod installation and catalogue
    workshop.ts          workshop client (WordPress REST API, application passwords)
    updates.ts           automatic updates from GitHub releases
  worker/                decode and encode utility processes (frames bypass the main process)
  preload/index.ts       safe window.api bridge (contextIsolation + sandbox)
  renderer/              interface (React)
    core/                project model and pure logic: edits, keyframes, the scene at a given time
    engine/              WebGL2 compositor, preview, export, shader effects, scopes
    ai/                  Whisper and MODNet in a Web Worker (WebGPU, otherwise WASM)
    store/               state (zustand + immer), commands, import, enhancement tools
    components/          panels: media bin, preview, inspector, timeline, dialogs
website/                 kadro.studio (static, GitHub Pages)
workshop/                WordPress plugin for the community workshop
```

The key idea: `core/scene.ts` turns a project and a moment in time into a list of layers with all transforms, animations and transitions applied. The preview takes frames from `<video>` elements and the export takes them from FFmpeg, but both hand the layers to the same `Compositor`. Rendered export frames go to FFmpeg through stdin, and audio is mixed with FFmpeg filters from the same plan as in the preview.

## Testing

```bash
npm run typecheck
```

The end-to-end smoke test launches the built app, imports media, edits, plays, exports and reopens the project. Test files can be generated with FFmpeg itself (`node_modules/ffmpeg-static/ffmpeg`):

```bash
ffmpeg -f lavfi -i testsrc2=size=1280x720:rate=30:duration=6 -f lavfi -i sine=frequency=440:duration=6 -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest test-media/clipA.mp4
ffmpeg -f lavfi -i mandelbrot=size=1920x1080:rate=30 -f lavfi -i sine=frequency=660:duration=5 -t 5 -c:v libx264 -pix_fmt yuv420p -c:a aac test-media/clipB.mp4
ffmpeg -f lavfi -i "color=c=0x00ff00:size=1280x720:rate=30:duration=4,drawbox=x=440:y=160:w=400:h=400:color=red:t=fill" -c:v libx264 -pix_fmt yuv420p test-media/green.mp4
ffmpeg -f lavfi -i sine=frequency=220:duration=8 -c:a libmp3lame test-media/tone.mp3
ffmpeg -f lavfi -i testsrc=size=800x600:rate=1 -frames:v 1 test-media/still.png
ffmpeg -f lavfi -i smptehdbars=size=1280x720:rate=25:duration=3 -f lavfi -i sine=frequency=330:duration=3 -c:v libx265 -pix_fmt yuv420p -c:a ac3 test-media/hevc.mkv
```

```bash
npm run build && node scripts/smoke.mjs test-media smoke-out
```

## Support

Kadro is free for everyone. If you want to help: [Ko-fi](https://ko-fi.com/amormorri), [Patreon](https://www.patreon.com/cw/kadrostudio) or crypto (addresses on [kadro.studio](https://kadro.studio/#support)). Reporting bugs, spreading the word and making mods help too.

## Licence

MIT — see [LICENSE](LICENSE). FFmpeg is distributed under its own licence (LGPL/GPL) and is used as a separate program.
