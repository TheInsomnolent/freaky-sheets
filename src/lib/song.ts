/** Shared song model used by all views and scroll modes. */

export interface NoteEvent {
  /** Start time in beats from the beginning of the song. */
  startBeats: number
  /** Duration in beats. */
  durationBeats: number
  /** MIDI note number (60 = middle C). */
  midi: number
}

export interface ChordEvent {
  /** Start time in beats from the beginning of the song. */
  startBeats: number
  /** Human readable chord symbol, e.g. "C", "Am", "G7". */
  symbol: string
}

export interface Song {
  title: string
  notes: NoteEvent[]
  chords: ChordEvent[]
  tempoBpm: number
  totalBeats: number
  beatsPerMeasure: number
  /** MusicXML source used for sheet music rendering. */
  musicXml: string
}

export const PITCH_CLASS_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
]

export function midiToName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1
  return `${PITCH_CLASS_NAMES[midi % 12]}${octave}`
}

/** Estimated song duration in seconds based on tempo. */
export function songDurationSeconds(song: Song): number {
  const bpm = song.tempoBpm > 0 ? song.tempoBpm : 120
  return (song.totalBeats / bpm) * 60
}
