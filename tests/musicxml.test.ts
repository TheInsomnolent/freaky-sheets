import { describe, expect, it } from 'vitest'
import { DEMO_SONG_XML } from '../src/demo/odeToJoy'
import { parseMusicXml } from '../src/lib/musicxml'

describe('parseMusicXml', () => {
  it('parses the demo song', () => {
    const song = parseMusicXml(DEMO_SONG_XML)
    expect(song.title).toBe('Ode to Joy (demo)')
    expect(song.tempoBpm).toBe(100)
    expect(song.beatsPerMeasure).toBe(4)
    expect(song.totalBeats).toBe(64) // 16 measures of 4/4
    expect(song.notes.length).toBeGreaterThan(50)
    expect(song.chords.length).toBe(16)
    expect(song.chords[0]).toEqual({ startBeats: 0, symbol: 'C' })
    expect(song.chords[2].symbol).toBe('Am')
  })

  it('starts the demo melody on E4', () => {
    const song = parseMusicXml(DEMO_SONG_XML)
    expect(song.notes[0]).toEqual({ startBeats: 0, durationBeats: 1, midi: 64 })
  })

  it('rejects invalid XML', () => {
    expect(() => parseMusicXml('not xml at all <<<')).toThrow()
  })

  it('rejects XML without a part', () => {
    expect(() => parseMusicXml('<score-partwise></score-partwise>')).toThrow(/part/)
  })
})
