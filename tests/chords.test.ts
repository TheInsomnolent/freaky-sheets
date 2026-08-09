import { describe, expect, it } from 'vitest'
import { chordChart, inferChord } from '../src/lib/chords'
import { DEMO_SONG_XML } from '../src/demo/odeToJoy'
import { parseMusicXml } from '../src/lib/musicxml'

describe('inferChord', () => {
  it('recognises major and minor triads', () => {
    expect(inferChord(new Set([0, 4, 7]))).toBe('C') // C E G
    expect(inferChord(new Set([9, 0, 4]))).toBe('Am') // A C E
    expect(inferChord(new Set([7, 11, 2]))).toBe('G') // G B D
  })

  it('recognises a power chord', () => {
    expect(inferChord(new Set([0, 7]))).toBe('C5')
  })

  it('returns empty for no notes', () => {
    expect(inferChord(new Set())).toBe('')
  })
})

describe('chordChart', () => {
  it('prefers written chord symbols when available', () => {
    const song = parseMusicXml(DEMO_SONG_XML)
    const chart = chordChart(song)
    expect(chart).toBe(song.chords)
    expect(chart[0].symbol).toBe('C')
  })

  it('infers chords from notes when no symbols exist', () => {
    const song = parseMusicXml(DEMO_SONG_XML)
    const chart = chordChart({ ...song, chords: [] })
    expect(chart.length).toBeGreaterThan(0)
    expect(chart[0].startBeats).toBe(0)
    expect(chart[0].symbol).not.toBe('')
  })
})
