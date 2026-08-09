/** Chord chart helpers: use written chord symbols when available, otherwise
 * infer a chord per measure from the sounding pitch classes. */
import { PITCH_CLASS_NAMES } from './song'
import type { ChordEvent, Song } from './song'

const CHORD_TEMPLATES: { suffix: string; intervals: number[] }[] = [
  { suffix: '', intervals: [0, 4, 7] }, // major
  { suffix: 'm', intervals: [0, 3, 7] }, // minor
  { suffix: '7', intervals: [0, 4, 7, 10] },
  { suffix: 'maj7', intervals: [0, 4, 7, 11] },
  { suffix: 'm7', intervals: [0, 3, 7, 10] },
  { suffix: '5', intervals: [0, 7] }, // power chord
  { suffix: 'dim', intervals: [0, 3, 6] },
  { suffix: 'sus4', intervals: [0, 5, 7] },
]

/** Infer the best-matching chord symbol from a set of pitch classes. */
export function inferChord(pitchClasses: Set<number>): string {
  if (pitchClasses.size === 0) return ''
  let best = { score: -Infinity, symbol: '' }
  for (let root = 0; root < 12; root++) {
    for (const template of CHORD_TEMPLATES) {
      const chordPcs = new Set(template.intervals.map((i) => (root + i) % 12))
      let matched = 0
      for (const pc of pitchClasses) if (chordPcs.has(pc)) matched++
      const missing = chordPcs.size - matched
      const extra = pitchClasses.size - matched
      const score = matched * 2 - missing - extra * 0.5 - template.intervals.length * 0.01
      if (score > best.score) {
        best = { score, symbol: `${PITCH_CLASS_NAMES[root]}${template.suffix}` }
      }
    }
  }
  return best.symbol
}

/** Return one chord per measure: written symbols win, otherwise inferred. */
export function chordChart(song: Song): ChordEvent[] {
  if (song.chords.length > 0) return song.chords
  const beatsPerMeasure = song.beatsPerMeasure || 4
  const totalMeasures = Math.max(1, Math.ceil(song.totalBeats / beatsPerMeasure))
  const result: ChordEvent[] = []
  let previous = ''
  for (let m = 0; m < totalMeasures; m++) {
    const start = m * beatsPerMeasure
    const end = start + beatsPerMeasure
    const pcs = new Set<number>()
    for (const note of song.notes) {
      if (note.startBeats < end && note.startBeats + note.durationBeats > start) {
        pcs.add(note.midi % 12)
      }
    }
    const symbol = inferChord(pcs)
    if (symbol && symbol !== previous) {
      result.push({ startBeats: start, symbol })
      previous = symbol
    }
  }
  return result
}
