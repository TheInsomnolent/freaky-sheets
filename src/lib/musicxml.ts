/** Parse MusicXML into the shared Song model. */
import type { ChordEvent, NoteEvent, Song } from './song'

const STEP_TO_SEMITONE: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
}

function text(el: Element | null | undefined, selector: string): string {
  return el?.querySelector(selector)?.textContent?.trim() ?? ''
}

function harmonySymbol(harmony: Element): string {
  const rootStep = text(harmony, 'root > root-step')
  if (!rootStep) return ''
  const rootAlter = Number(text(harmony, 'root > root-alter') || '0')
  const accidental = rootAlter > 0 ? '#'.repeat(rootAlter) : 'b'.repeat(-rootAlter)
  const kindEl = harmony.querySelector('kind')
  const kind = kindEl?.textContent?.trim() ?? 'major'
  const kindText = kindEl?.getAttribute('text')
  let suffix = kindText ?? ''
  if (kindText == null) {
    const kindMap: Record<string, string> = {
      major: '',
      minor: 'm',
      augmented: 'aug',
      diminished: 'dim',
      dominant: '7',
      'major-seventh': 'maj7',
      'minor-seventh': 'm7',
      'diminished-seventh': 'dim7',
      'suspended-fourth': 'sus4',
      'suspended-second': 'sus2',
      power: '5',
    }
    suffix = kindMap[kind] ?? kind
  }
  return `${rootStep}${accidental}${suffix}`
}

export function parseMusicXml(xml: string): Song {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) {
    throw new Error('This file does not look like valid MusicXML.')
  }

  const title =
    text(doc.documentElement, 'work > work-title') ||
    text(doc.documentElement, 'movement-title') ||
    'Untitled'

  const notes: NoteEvent[] = []
  const chords: ChordEvent[] = []
  let tempoBpm = 0
  let beatsPerMeasure = 4
  let totalBeats = 0

  // Use the first part for the note/chord timeline.
  const part = doc.querySelector('part')
  if (!part) throw new Error('No <part> found in the MusicXML file.')

  let divisions = 1
  let cursorDivs = 0 // current time in divisions
  let lastNoteStartDivs = 0

  for (const measure of Array.from(part.querySelectorAll(':scope > measure'))) {
    for (const el of Array.from(measure.children)) {
      switch (el.tagName) {
        case 'attributes': {
          const d = Number(text(el, 'divisions'))
          if (d > 0) divisions = d
          const beats = Number(text(el, 'time > beats'))
          if (beats > 0) beatsPerMeasure = beats
          break
        }
        case 'direction': {
          const tempo = Number(el.querySelector('sound')?.getAttribute('tempo') ?? '')
          if (tempo > 0 && tempoBpm === 0) tempoBpm = tempo
          break
        }
        case 'sound': {
          const tempo = Number(el.getAttribute('tempo') ?? '')
          if (tempo > 0 && tempoBpm === 0) tempoBpm = tempo
          break
        }
        case 'harmony': {
          const symbol = harmonySymbol(el)
          if (symbol) chords.push({ startBeats: cursorDivs / divisions, symbol })
          break
        }
        case 'backup': {
          cursorDivs -= Number(text(el, 'duration')) || 0
          break
        }
        case 'forward': {
          cursorDivs += Number(text(el, 'duration')) || 0
          break
        }
        case 'note': {
          const durationDivs = Number(text(el, 'duration')) || 0
          const isChordNote = el.querySelector(':scope > chord') != null
          const startDivs = isChordNote ? lastNoteStartDivs : cursorDivs
          if (!el.querySelector(':scope > rest')) {
            const step = text(el, 'pitch > step')
            const octave = Number(text(el, 'pitch > octave'))
            const alter = Number(text(el, 'pitch > alter') || '0')
            if (step in STEP_TO_SEMITONE && Number.isFinite(octave)) {
              notes.push({
                startBeats: startDivs / divisions,
                durationBeats: durationDivs / divisions,
                midi: (octave + 1) * 12 + STEP_TO_SEMITONE[step] + alter,
              })
            }
          }
          if (!isChordNote) {
            lastNoteStartDivs = cursorDivs
            cursorDivs += durationDivs
          }
          break
        }
      }
    }
    totalBeats = Math.max(totalBeats, cursorDivs / divisions)
  }

  notes.sort((a, b) => a.startBeats - b.startBeats)
  chords.sort((a, b) => a.startBeats - b.startBeats)

  return {
    title,
    notes,
    chords,
    tempoBpm: tempoBpm || 120,
    totalBeats: totalBeats || notes.reduce((m, n) => Math.max(m, n.startBeats + n.durationBeats), 0),
    beatsPerMeasure,
    musicXml: xml,
  }
}
