/** Built-in demo song: Beethoven's "Ode to Joy" (public domain melody),
 * with chord symbols, so users can try the app without uploading anything. */

// Compact notation: [step+octave(+#), durationInDivisions] with divisions = 4
// (quarter = 4, dotted quarter = 6, eighth = 2, half = 8).
type N = [string, number]

const PHRASE_A: N[] = [
  ['E4', 4], ['E4', 4], ['F4', 4], ['G4', 4],
  ['G4', 4], ['F4', 4], ['E4', 4], ['D4', 4],
  ['C4', 4], ['C4', 4], ['D4', 4], ['E4', 4],
]
const ENDING_1: N[] = [['E4', 6], ['D4', 2], ['D4', 8]]
const ENDING_2: N[] = [['D4', 6], ['C4', 2], ['C4', 8]]
const PHRASE_B: N[] = [
  ['D4', 4], ['D4', 4], ['E4', 4], ['C4', 4],
  ['D4', 4], ['E4', 2], ['F4', 2], ['E4', 4], ['C4', 4],
  ['D4', 4], ['E4', 2], ['F4', 2], ['E4', 4], ['D4', 4],
  ['C4', 4], ['D4', 4], ['G3', 8],
]

const MELODY: N[] = [
  ...PHRASE_A, ...ENDING_1,
  ...PHRASE_A, ...ENDING_2,
  ...PHRASE_B,
  ...PHRASE_A, ...ENDING_2,
]

// One chord symbol per measure (4/4).
const CHORDS = [
  'C', 'G', 'Am', 'G',
  'C', 'G', 'Am', 'C',
  'G', 'C', 'C', 'G',
  'C', 'G', 'Am', 'C',
]

const TYPE_FOR_DURATION: Record<number, string> = {
  2: 'eighth',
  4: 'quarter',
  6: 'quarter',
  8: 'half',
}

function chordXml(symbol: string): string {
  const minor = symbol.endsWith('m') && !symbol.endsWith('dim')
  const root = minor ? symbol.slice(0, -1) : symbol
  const kind = minor ? 'minor' : 'major'
  return (
    `<harmony><root><root-step>${root}</root-step></root>` +
    `<kind>${kind}</kind></harmony>`
  )
}

function buildDemoXml(): string {
  const divisions = 4
  const measureDivs = 16
  const measures: string[] = []
  let current = ''
  let filled = 0
  let measureIndex = 0

  const openMeasure = () => {
    const attrs =
      measureIndex === 0
        ? `<attributes><divisions>${divisions}</divisions>` +
          `<key><fifths>0</fifths></key>` +
          `<time><beats>4</beats><beat-type>4</beat-type></time>` +
          `<clef><sign>G</sign><line>2</line></clef></attributes>` +
          `<direction placement="above"><direction-type><metronome>` +
          `<beat-unit>quarter</beat-unit><per-minute>100</per-minute>` +
          `</metronome></direction-type><sound tempo="100"/></direction>`
        : ''
    const chord = CHORDS[measureIndex % CHORDS.length]
    current = `<measure number="${measureIndex + 1}">${attrs}${chordXml(chord)}`
  }

  openMeasure()
  for (const [pitch, dur] of MELODY) {
    if (filled >= measureDivs) {
      measures.push(`${current}</measure>`)
      measureIndex++
      filled = 0
      openMeasure()
    }
    const step = pitch[0]
    const octave = pitch[pitch.length - 1]
    const type = TYPE_FOR_DURATION[dur]
    const dot = dur === 6 ? '<dot/>' : ''
    current +=
      `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch>` +
      `<duration>${dur}</duration><type>${type}</type>${dot}</note>`
    filled += dur
  }
  measures.push(`${current}</measure>`)

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<score-partwise version="3.1">` +
    `<work><work-title>Ode to Joy (demo)</work-title></work>` +
    `<identification><creator type="composer">Ludwig van Beethoven</creator></identification>` +
    `<part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list>` +
    `<part id="P1">${measures.join('')}</part>` +
    `</score-partwise>`
  )
}

export const DEMO_SONG_XML = buildDemoXml()
