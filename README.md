# 🎵 Freaky Sheets

A sheet music player that automatically scrolls — upload your music and play
along while the page scrolls for you.

**Live app:** https://theinsomnolent.github.io/freaky-sheets/

## Features

- **Upload music** in the most common sharing formats:
  MusicXML (`.musicxml`, `.xml`, `.mxl`) and MIDI (`.mid`, `.midi`), or just
  drag & drop a file onto the page.
- **Three ways to display your music:**
  - 🎼 Sheet music (rendered with [OpenSheetMusicDisplay](https://opensheetmusicdisplay.org/))
  - 🎸 Chord symbols (written symbols when available, otherwise inferred from the notes)
  - 📋 Guitar tablature (generated automatically, standard tuning)
- **Three auto-scroll modes:**
  - 🎚 **Speed slider** — scrolls at a constant speed you control.
  - ⏱ **Song length** — scrolls the whole song over its expected duration
    (pre-filled from the song's tempo; you can adjust it).
  - 🎤 **Listen to me** — uses your microphone to guess where you are in the
    song and follows your playing. It is deliberately forgiving: it matches on
    pitch classes only, so delays, learner mistakes, and partial phrasings
    (like playing a power chord instead of a barre chord) still work.
    Smart mode also includes an expandable calibration/debug panel so you can
    tune thresholds/lookahead and watch live matching metrics while testing.
- **Demo song included** (Beethoven's *Ode to Joy*) so you can try everything
  without uploading anything.
- **Responsive design** with large touch targets — works on mobile, tablet and
  PC, and is easy to use for non-technical or elderly players.
- **Private by design** — everything runs in your browser; your music and
  microphone audio never leave your device.

## Development

```bash
npm install
npm run dev      # start the dev server
npm test         # run the unit tests (vitest)
npm run build    # type-check and build for production
```

## Deployment

Every push to `main` is built and deployed to GitHub Pages by the
[`deploy.yml`](.github/workflows/deploy.yml) workflow. Pull requests are
tested and built by [`ci.yml`](.github/workflows/ci.yml).

> One-time setup: in the repository settings, set **Pages → Source** to
> **GitHub Actions**.

## Roadmap

Planned for later: lyrics display, metronome, and automatic audio file
processing.
