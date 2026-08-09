/** Convert a parsed MIDI file into the shared Song model, generating simple
 * MusicXML so the sheet music view can render uploaded MIDI files. */
import { Midi } from '@tonejs/midi'
import { PITCH_CLASS_NAMES } from './song'
import type { NoteEvent, Song } from './song'

const SHARP_TO_STEP: Record<string, { step: string; alter: number }> = {}
for (const [i, name] of PITCH_CLASS_NAMES.entries()) {
  SHARP_TO_STEP[name] = name.includes('#')
    ? { step: name[0], alter: 1 }
    : { step: name, alter: 0 }
  void i
}

/** Quantize beats to a 16th-note grid to keep the generated notation readable. */
export function quantizeBeats(beats: number): number {
  return Math.round(beats * 4) / 4
}

interface TimedNote {
  startBeats: number
  durationBeats: number
  midi: number
}

/** Generate a minimal single-part MusicXML document from quantized notes. */
export function notesToMusicXml(
  notes: TimedNote[],
  title: string,
  tempoBpm: number,
  beatsPerMeasure = 4,
): string {
  const divisions = 4 // 16th note resolution
  const measureDivs = beatsPerMeasure * divisions

  // Group notes by start time so simultaneous notes become <chord> notes.
  const byStart = new Map<number, TimedNote[]>()
  for (const n of notes) {
    const key = Math.round(n.startBeats * divisions)
    const group = byStart.get(key)
    if (group) group.push(n)
    else byStart.set(key, [n])
  }
  const starts = [...byStart.keys()].sort((a, b) => a - b)

  const lastEnd = notes.reduce(
    (m, n) => Math.max(m, Math.round((n.startBeats + n.durationBeats) * divisions)),
    measureDivs,
  )
  const measureCount = Math.max(1, Math.ceil(lastEnd / measureDivs))

  const noteXml = (n: TimedNote, durDivs: number, isChord: boolean): string => {
    const name = PITCH_CLASS_NAMES[n.midi % 12]
    const { step, alter } = SHARP_TO_STEP[name]
    const octave = Math.floor(n.midi / 12) - 1
    const durationTags: Record<number, string> = {
      1: '16th',
      2: 'eighth',
      3: 'eighth',
      4: 'quarter',
      6: 'quarter',
      8: 'half',
      12: 'half',
      16: 'whole',
    }
    const type = durationTags[durDivs] ?? (durDivs > 16 ? 'whole' : '16th')
    const dotted = durDivs === 3 || durDivs === 6 || durDivs === 12
    return [
      '<note>',
      isChord ? '<chord/>' : '',
      '<pitch>',
      `<step>${step}</step>`,
      alter ? `<alter>${alter}</alter>` : '',
      `<octave>${octave}</octave>`,
      '</pitch>',
      `<duration>${durDivs}</duration>`,
      `<type>${type}</type>`,
      dotted ? '<dot/>' : '',
      '</note>',
    ].join('')
  }

  const restXml = (durDivs: number): string =>
    `<note><rest/><duration>${durDivs}</duration></note>`

  // Build a monophonic-with-chords stream: fill gaps with rests, clip overlaps.
  const events: string[][] = Array.from({ length: measureCount }, () => [])
  let cursor = 0
  const pushIntoMeasures = (xmlForSpan: (span: number) => string, from: number, to: number) => {
    let pos = from
    while (pos < to) {
      const measureIndex = Math.floor(pos / measureDivs)
      const measureEnd = (measureIndex + 1) * measureDivs
      const span = Math.min(to, measureEnd) - pos
      events[measureIndex].push(xmlForSpan(span))
      pos += span
    }
  }

  for (const startKey of starts) {
    const group = byStart.get(startKey)!
    if (startKey < cursor) continue // skip overlapping starts already covered
    if (startKey > cursor) pushIntoMeasures((span) => restXml(span), cursor, startKey)
    const durDivs = Math.max(
      1,
      Math.min(
        Math.round(Math.max(...group.map((n) => n.durationBeats)) * divisions),
        measureDivs,
      ),
    )
    const measureIndex = Math.floor(startKey / measureDivs)
    const clipped = Math.min(durDivs, (measureIndex + 1) * measureDivs - startKey)
    events[measureIndex].push(
      group.map((n, i) => noteXml(n, clipped, i > 0)).join(''),
    )
    cursor = startKey + clipped
  }
  if (cursor < measureCount * measureDivs) {
    pushIntoMeasures((span) => restXml(span), cursor, measureCount * measureDivs)
  }

  const measuresXml = events
    .map((parts, i) => {
      const attrs =
        i === 0
          ? `<attributes><divisions>${divisions}</divisions>` +
            `<time><beats>${beatsPerMeasure}</beats><beat-type>4</beat-type></time>` +
            `<clef><sign>G</sign><line>2</line></clef></attributes>` +
            `<direction placement="above"><direction-type><metronome>` +
            `<beat-unit>quarter</beat-unit><per-minute>${Math.round(tempoBpm)}</per-minute>` +
            `</metronome></direction-type><sound tempo="${Math.round(tempoBpm)}"/></direction>`
          : ''
      return `<measure number="${i + 1}">${attrs}${parts.join('')}</measure>`
    })
    .join('')

  const safeTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<score-partwise version="3.1">` +
    `<work><work-title>${safeTitle}</work-title></work>` +
    `<part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list>` +
    `<part id="P1">${measuresXml}</part>` +
    `</score-partwise>`
  )
}

export function parseMidi(data: ArrayBuffer, fileName: string): Song {
  const midi = new Midi(data)
  const tempoBpm = midi.header.tempos[0]?.bpm ?? 120
  const beatsPerMeasure = midi.header.timeSignatures[0]?.timeSignature?.[0] ?? 4

  const notes: NoteEvent[] = []
  for (const track of midi.tracks) {
    if (track.channel === 9) continue // skip drum tracks
    for (const note of track.notes) {
      notes.push({
        startBeats: quantizeBeats(note.ticks / midi.header.ppq),
        durationBeats: Math.max(0.25, quantizeBeats(note.durationTicks / midi.header.ppq)),
        midi: note.midi,
      })
    }
    if (notes.length > 0) break // use the first non-empty melodic track
  }
  if (notes.length === 0) throw new Error('No notes found in this MIDI file.')
  notes.sort((a, b) => a.startBeats - b.startBeats || a.midi - b.midi)

  const title = midi.header.name || fileName.replace(/\.[^.]+$/, '')
  const totalBeats = notes.reduce((m, n) => Math.max(m, n.startBeats + n.durationBeats), 0)
  const musicXml = notesToMusicXml(notes, title, tempoBpm, beatsPerMeasure)

  return { title, notes, chords: [], tempoBpm, totalBeats, beatsPerMeasure, musicXml }
}
