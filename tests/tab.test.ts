import { describe, expect, it } from 'vitest'
import { DEMO_SONG_XML } from '../src/demo/odeToJoy'
import { parseMusicXml } from '../src/lib/musicxml'
import { pickStringAndFret, songToTab, TUNING } from '../src/lib/tab'

describe('pickStringAndFret', () => {
  it('prefers open strings', () => {
    expect(pickStringAndFret(64)).toEqual({ string: 0, fret: 0 }) // open high e
    expect(pickStringAndFret(40)).toEqual({ string: 5, fret: 0 }) // open low E
  })

  it('chooses the lowest playable fret', () => {
    const pos = pickStringAndFret(60) // middle C -> B string fret 1
    expect(pos).toEqual({ string: 1, fret: 1 })
  })

  it('octave-shifts out-of-range notes into the guitar range', () => {
    const low = pickStringAndFret(28) // E1, an octave below the guitar
    expect(low).toEqual({ string: 5, fret: 0 })
    const high = pickStringAndFret(100)
    expect(high).not.toBeNull()
    expect(high!.fret).toBeLessThanOrEqual(15)
  })
})

describe('songToTab', () => {
  it('renders six-line systems with frets for the demo song', () => {
    const song = parseMusicXml(DEMO_SONG_XML)
    const tab = songToTab(song)
    const lines = tab.split('\n').filter((l) => l.length > 0)
    expect(lines.length % TUNING.length).toBe(0)
    expect(lines[0].startsWith('e|')).toBe(true)
    expect(lines[5].startsWith('E|')).toBe(true)
    expect(tab).toMatch(/\d/) // contains at least one fret number
  })
})
