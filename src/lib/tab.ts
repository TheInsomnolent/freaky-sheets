/** Generate simple guitar tablature (standard tuning) from a note timeline. */
import type { Song } from './song'

/** Standard guitar tuning, high E string first (top line of the tab). */
export const TUNING = [
  { name: 'e', midi: 64 },
  { name: 'B', midi: 59 },
  { name: 'G', midi: 55 },
  { name: 'D', midi: 50 },
  { name: 'A', midi: 45 },
  { name: 'E', midi: 40 },
]

const MAX_FRET = 15

/** Choose the string/fret with the lowest playable fret for a MIDI note.
 * Notes outside the guitar range are shifted by octaves until they fit. */
export function pickStringAndFret(midi: number): { string: number; fret: number } | null {
  let m = midi
  while (m < TUNING[TUNING.length - 1].midi) m += 12
  while (m > TUNING[0].midi + MAX_FRET) m -= 12
  let best: { string: number; fret: number } | null = null
  for (let s = 0; s < TUNING.length; s++) {
    const fret = m - TUNING[s].midi
    if (fret >= 0 && fret <= MAX_FRET && (best === null || fret < best.fret)) {
      best = { string: s, fret }
    }
  }
  return best
}

/** Render ASCII tablature, one group of 6 lines per system. */
export function songToTab(song: Song, measuresPerLine = 4): string {
  const beatsPerMeasure = song.beatsPerMeasure || 4
  const slotsPerBeat = 2 // eighth-note grid keeps the tab compact
  const slotsPerMeasure = beatsPerMeasure * slotsPerBeat
  const totalMeasures = Math.max(1, Math.ceil(song.totalBeats / beatsPerMeasure))

  // grid[string][slot] = fret text
  const totalSlots = totalMeasures * slotsPerMeasure
  const grid: string[][] = TUNING.map(() => Array(totalSlots).fill(''))
  for (const note of song.notes) {
    const pos = pickStringAndFret(note.midi)
    if (!pos) continue
    const slot = Math.min(totalSlots - 1, Math.round(note.startBeats * slotsPerBeat))
    if (grid[pos.string][slot] === '') grid[pos.string][slot] = String(pos.fret)
  }

  const lines: string[] = []
  for (let m0 = 0; m0 < totalMeasures; m0 += measuresPerLine) {
    const mEnd = Math.min(totalMeasures, m0 + measuresPerLine)
    for (let s = 0; s < TUNING.length; s++) {
      let line = `${TUNING[s].name}|`
      for (let m = m0; m < mEnd; m++) {
        for (let slot = m * slotsPerMeasure; slot < (m + 1) * slotsPerMeasure; slot++) {
          const cell = grid[s][slot]
          line += cell === '' ? '--' : cell.padEnd(2, '-')
        }
        line += '|'
      }
      lines.push(line)
    }
    lines.push('')
  }
  return lines.join('\n')
}
