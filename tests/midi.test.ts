import { describe, expect, it } from 'vitest'
import { notesToMusicXml, quantizeBeats } from '../src/lib/midi'
import { parseMusicXml } from '../src/lib/musicxml'

describe('quantizeBeats', () => {
  it('snaps to a 16th-note grid', () => {
    expect(quantizeBeats(1.01)).toBe(1)
    expect(quantizeBeats(1.13)).toBe(1.25)
    expect(quantizeBeats(0.49)).toBe(0.5)
  })
})

describe('notesToMusicXml', () => {
  it('round-trips simple notes through the MusicXML parser', () => {
    const notes = [
      { startBeats: 0, durationBeats: 1, midi: 60 }, // C4 quarter
      { startBeats: 1, durationBeats: 1, midi: 64 }, // E4 quarter
      { startBeats: 2, durationBeats: 2, midi: 67 }, // G4 half
    ]
    const xml = notesToMusicXml(notes, 'Test Song', 90)
    const song = parseMusicXml(xml)
    expect(song.title).toBe('Test Song')
    expect(song.tempoBpm).toBe(90)
    expect(song.notes).toEqual(notes)
  })

  it('emits simultaneous notes as chord notes', () => {
    const notes = [
      { startBeats: 0, durationBeats: 1, midi: 60 },
      { startBeats: 0, durationBeats: 1, midi: 64 },
      { startBeats: 0, durationBeats: 1, midi: 67 },
    ]
    const xml = notesToMusicXml(notes, 'Chord', 120)
    expect(xml.match(/<chord\/>/g)?.length).toBe(2)
    const song = parseMusicXml(xml)
    expect(song.notes.map((n) => n.midi).sort((a, b) => a - b)).toEqual([60, 64, 67])
    expect(song.notes.every((n) => n.startBeats === 0)).toBe(true)
  })

  it('fills gaps with rests and keeps measures aligned', () => {
    const notes = [{ startBeats: 6, durationBeats: 1, midi: 62 }]
    const xml = notesToMusicXml(notes, 'Gap', 120)
    const song = parseMusicXml(xml)
    expect(song.notes).toEqual(notes)
    expect(song.totalBeats).toBe(8) // padded to 2 whole measures
  })

  it('escapes special characters in the title', () => {
    const xml = notesToMusicXml([{ startBeats: 0, durationBeats: 1, midi: 60 }], 'A & B <C>', 120)
    expect(xml).toContain('A &amp; B &lt;C&gt;')
  })
})
