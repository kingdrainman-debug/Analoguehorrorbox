# CRTBOX

**Cathode-ray television emulation for picture *and* sound.**

A real-time CRT emulator that runs in a browser and ships as a standalone desktop
application. Load a video, get a television: curved glass, phosphor mask, blooming
scanlines, convergence error, a hum bar drifting up the screen — and a soundtrack that has
been through a 6 cm paper cone in a plastic box, with mains hum, flyback whine and the
crackle of a corroded connector.

Modelled on the shape of [ntsc-rs](https://ntsc.rs/), which emulates the *signal*.
CRTBOX emulates the *display*, and the machine the display was part of.

📄 **[Read the design brief](docs/BRIEF.md)** — what a CRT actually looks like, how to make
audio sound like a television, and why picture and sound have to be coupled.

---

## The idea

Every other tool in this space treats picture and sound as two unrelated effects that happen
to be applied to the same file. A television is one machine: the picture and the sound share
a chassis, a mains transformer, an aerial and a high-tension rail. When the mains ripples, a
bright bar crosses the screen *and* a hum appears in the speaker — because they are the same
ripple. When the audio stage draws current on a loud passage, the picture dims.

CRTBOX has an **A/V Link** section that makes those couplings explicit and adjustable. It is
the reason the app exists.

---

## Features

### Picture — ten stages, in the order the light meets them

| | |
|---|---|
| **Picture Controls** | Brightness, contrast, colour, tint, sharpness — the knobs on the front of the set |
| **Signal & Reception** | RF / composite / S-Video / component paths, luma and chroma bandwidth, chroma delay, dot crawl, cross-colour rainbows, ringing, multipath ghosting, snow, adjacent-channel herringbone |
| **Sync & Timebase** | Horizontal jitter with a coherence control, line tearing, flagging, head-switch band, vertical roll and hold instability, timebase wobble |
| **Tube Geometry** | Curvature, corner radius, overscan, H/V size and position, pincushion, trapezoid, yoke rotation |
| **Beam & Scanlines** | 240p / 480i / off, beam width and profile, **beam blooming** (bright lines are physically fatter), interlace flicker |
| **Phosphor & Mask** | Aperture grille, slot mask, shadow-mask triads; pitch, strength, stagger; per-channel persistence with a green-biased tilt; P22 gamut bend |
| **Halation & Bloom** | Separate tight bloom and wide *warm* halation, glass diffusion, vignette, room glare |
| **Convergence & Focus** | Per-gun RGB offsets, radial error that grows toward the corners, centre and edge defocus |
| **Tube Response** | CRT gamma, black crush, white clip, drifting hum bar, AGC pumping, PSU sag, flicker |
| **Faults & Wear** | Burn-in accumulation, dust and smears, moiré, degauss button, warm-up and power-off animation |

### Sound — the other half

| | |
|---|---|
| **Audio Source** | Mono collapse (partial or total), left / right / **difference channel** (the MTS subcarrier alone — centre-panned dialogue vanishes), NTSC/PAL region |
| **Tape Transport** | True pitch modulation via a modulated fractional delay: wow, flutter, random drift, scrape flutter, Poisson dropouts with edge clicks |
| **Speaker & Enclosure** | Band limits with selectable slopes, box resonance, cone honk, cancellation notch, a **synthesised small-box impulse response** with a size control, level-dependent cone breakup, off-axis loss, through-the-wall macro, room tail |
| **Broadcast Processing** | Compression with audible pumping, three saturation models (tape / transformer / output stage), limiter |
| **Noise Bed** | Mains hum modelled as ground loop *and* transformer (odd vs. even harmonics), **flyback whine at 15.734 / 15.625 kHz** with partials and an optional octave-down shift, tape hiss with companding breathing, RF static, mechanical rumble |
| **Crackle & Contact Faults** | Poisson events with power-law amplitudes, randomised tone per click, and a burst process for arcing joints |
| **A/V Link** | Hum bar ↔ hum, signal loss ↔ static, audio → brightness and bloom, picture glitch → dropout, degauss → thump, power state → audio |

### Workflow

- Drag and drop, or a real file dialog in the desktop build
- Draggable split preview against the untouched source
- Ten built-in presets, from a calibrated studio monitor to a set that is actively failing
- Copy/paste settings as JSON; save and load `.crtbox.json` presets
- Seeded randomiser with an *amount* control, scoped to the tab you are looking at
- Per-group bypass and per-group reset
- Keyboard: <kbd>Space</kbd> play/pause, <kbd>D</kbd> degauss, <kbd>R</kbd> randomise

### Export

| Target | Browser | Desktop |
|---|:---:|:---:|
| H.264 / HEVC `.mp4` with processed audio | — | ✅ |
| ProRes 422 HQ `.mov` with PCM audio | — | ✅ |
| Animated GIF (palette-optimised) | — | ✅ |
| WebM (VP9 + Opus), real-time capture | ✅ | ✅ |
| PNG sequence + WAV + settings, zipped | ✅ | ✅ |
| WAV only (offline audio render) | ✅ | ✅ |
| Single frame PNG | ✅ | ✅ |

The `.mp4` / `.mov` / GIF paths render **deterministically** — the video is seeked frame by
frame and the renderer stepped with a fixed `dt`, so nothing is ever dropped, and the audio
is rendered offline through the identical DSP chain and muxed by a bundled ffmpeg.

---

## Install

### Desktop (recommended)

Grab a build from the releases page, or build it yourself:

```bash
npm install
npm run dist          # current platform
npm run dist:all      # macOS, Windows and Linux
```

Output lands in `release/`. The optional `ffmpeg-static` dependency provides the bundled
encoder; without it the app still runs and still exports WebM, PNG sequences and WAV — the
`.mp4` / `.mov` / GIF targets are simply hidden. Point `CRTBOX_FFMPEG` at a binary to use
your own.

### Web

```bash
npm install
npm run dev           # http://localhost:5173
npm run build         # static bundle in dist/
```

Needs WebGL2 and AudioWorklet. Any current Chromium, Firefox or Safari will do.

---

## Command line

The desktop build renders headlessly, so it drops into a batch script:

```bash
crtbox --input clip.mp4 --output clip-crt.mp4 --preset failing

crtbox --input clip.mp4 --output out.mov \
       --format prores --fps 24 --scale 1.5 \
       --tube.humBar 0.45 --noise.flybackLevel -34 --audio.channelMode side
```

Every one of the ~160 effect parameters is addressable as `--<group>.<param>`, using exactly
the keys that appear in exported preset JSON. `crtbox --help` lists the rest.

---

## Presets

| id | |
|---|---|
| `reference` | A properly set-up studio monitor on component. Geometry and phosphor only. |
| `livingroom87` | A 21-inch consumer set fed from a VCR. Slot mask, generous overscan, oversaturated. |
| `vhs3rd` | A copy of a copy of a copy. The timebase has given up and the transport is audibly worn. |
| `rebroadcast` | Off-air through an aerial pointing the wrong way. Ghosts, herringbone, creeping static. |
| `failing` | Dry joints and a tired line-output stage. Turn the flyback whine up and leave the room. |
| `portable` | A 5-inch set on top of a fridge. Tiny tube, tiny speaker, mains hum through everything. |
| `cctv` | A monitor that has watched the same corridor for eleven years. Long persistence, heavy burn-in. |
| `arcade` | A well-driven 15 kHz tube: aperture grille, hard 240p lines, clean signal. |
| `transmission` | Something is being broadcast that should not be. |
| `lostsignal` | No lock. Full snow, full roar, and the hum still there underneath. |

---

## Development

```
src/core/params.ts        the parameter schema — single source of truth for the
                          UI, the shader uniforms, the DSP, presets and CLI flags
src/video/                WebGL2 pipeline: signal → persistence → burn-in →
                          bright → bloom/halation → tube
src/video/shaders/        GLSL, one file per pass
src/audio/engine.ts       the Web Audio graph
public/worklets/          AudioWorklet DSP (transport + noise/crackle)
electron/                 desktop shell, ffmpeg encoding, headless batch mode
scripts/smoke.mjs         headless Chromium test: shaders link, picture is lit and
                          has line structure, worklets register and make sound
scripts/shots.mjs         render preset stills for eyeballing
```

```bash
npm run typecheck
npm run build
node scripts/smoke.mjs     # after a build
```

`tsc` cannot catch a shader that fails to compile or a worklet that fails to register, which
are the two ways this app actually breaks — so the smoke test loads the built bundle in
Chromium, pushes a test pattern through the whole pipeline, and asserts the result is lit,
has contrast, and has measurable horizontal line structure. It has already caught one real
bug that every other check passed.

Adding a parameter means adding one entry to `src/core/params.ts` and reading it wherever it
is consumed. The panel, the preset format and the CLI flag come for free.

## Known limitations

- **Deterministic export preflights itself.** Before committing to a render, one frame is
  decoded and put through the pipeline and both are checked for content. If the decoder
  presents nothing, or the pipeline returns a blank frame, the export fails with an
  explanation instead of quietly writing a black file. On a container with only a software
  rasteriser (`swiftshader`), the tube pass has been observed to return blank at full output
  resolution while rendering correctly at preview resolution — the preflight catches this and
  points you at a smaller render scale or the real-time recorder.
- **Browser video export is real-time capture** via MediaRecorder, so it drops frames if the
  machine cannot keep up. Use the PNG sequence, or the desktop build, for anything going into
  an edit.
- **Offline audio depends on `decodeAudioData`.** Some containers play fine in a `<video>` but
  cannot be decoded for offline rendering. The stage is bounded by a timeout; when it fails
  the picture still exports and the app says the audio was skipped.
- **No plugin builds.** After Effects / Premiere / OpenFX are out of scope — see
  [the brief](docs/BRIEF.md#6-deliberate-non-goals).

## Licence

MIT.
