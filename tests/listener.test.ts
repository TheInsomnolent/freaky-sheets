import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SMART_TUNING,
  expectedPitchClasses,
  matchScore,
  resolveSmartTuning,
  spectrumToChroma,
} from '../src/lib/listener'
import { DEMO_SONG_XML } from '../src/demo/odeToJoy'
import { parseMusicXml } from '../src/lib/musicxml'

describe('spectrumToChroma', () => {
  it('maps a pure tone to its pitch class', () => {
    const sampleRate = 44100
    const fftSize = 4096
    const magnitudes = new Float32Array(fftSize / 2)
    const binHz = sampleRate / fftSize
    const a4Bin = Math.round(440 / binHz)
    magnitudes[a4Bin] = 1
    const chroma = spectrumToChroma(magnitudes, sampleRate, fftSize)
    expect(chroma[9]).toBeCloseTo(1) // A
    expect(chroma[0]).toBeCloseTo(0)
  })
})

describe('expectedPitchClasses', () => {
  it('returns the pitch classes sounding in a window', () => {
    const song = parseMusicXml(DEMO_SONG_XML)
    const pcs = expectedPitchClasses(song, 0, 2) // first two beats: E4 E4
    expect(pcs.has(4)).toBe(true)
    expect(pcs.size).toBe(1)
  })
})

describe('matchScore', () => {
  it('rewards matching notes and is forgiving of partial phrasings', () => {
    const expected = new Set([0, 4, 7]) // C major
    const fullMatch = new Array(12).fill(0)
    fullMatch[0] = 0.4
    fullMatch[4] = 0.3
    fullMatch[7] = 0.3
    const powerChord = new Array(12).fill(0)
    powerChord[0] = 0.6
    powerChord[7] = 0.4
    const wrong = new Array(12).fill(0)
    wrong[1] = 0.5
    wrong[6] = 0.5
    expect(matchScore(fullMatch, expected)).toBeCloseTo(1)
    expect(matchScore(powerChord, expected)).toBeCloseTo(1) // subset still matches fully
    expect(matchScore(wrong, expected)).toBeLessThan(0)
  })

  it('scores zero when nothing is expected', () => {
    expect(matchScore(new Array(12).fill(0.1), new Set())).toBe(0)
  })
})

describe('resolveSmartTuning', () => {
  it('fills defaults and applies provided values', () => {
    const resolved = resolveSmartTuning({ silenceThreshold: 0.12, lookaheadBeats: 12 })
    expect(resolved.silenceThreshold).toBe(0.12)
    expect(resolved.lookaheadBeats).toBe(12)
    expect(resolved.confidenceGate).toBe(DEFAULT_SMART_TUNING.confidenceGate)
  })

  it('clamps out-of-range values and keeps maxFreq above minFreq', () => {
    const resolved = resolveSmartTuning({
      silenceThreshold: -2,
      confidenceAttack: 4,
      minFreqHz: 5000,
      maxFreqHz: 100,
      aheadStepBeats: 3,
      lookaheadBeats: 0.5,
    })
    expect(resolved.silenceThreshold).toBe(0)
    expect(resolved.confidenceAttack).toBe(1)
    expect(resolved.maxFreqHz).toBeGreaterThan(resolved.minFreqHz)
    expect(resolved.lookaheadBeats).toBeGreaterThanOrEqual(resolved.aheadStepBeats)
  })
})
