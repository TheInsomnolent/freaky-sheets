/** Smart listening mode: uses the microphone to estimate where in the song
 * the player currently is, matching heard pitch classes against the expected
 * notes. The matching is deliberately forgiving: it works on pitch classes
 * only (so a power chord matches a full barre chord), tolerates missed or
 * extra notes, and only ever moves forward at a limited rate.
 */
import type { Song } from './song'

const A4 = 440

/** Convert an FFT magnitude spectrum into a 12-bin chroma (pitch class) vector. */
export function spectrumToChroma(
  magnitudes: Float32Array,
  sampleRate: number,
  fftSize: number,
  minFreqHz = 60,
  maxFreqHz = 2500,
): number[] {
  const chroma = new Array(12).fill(0)
  const binHz = sampleRate / fftSize
  for (let bin = 1; bin < magnitudes.length; bin++) {
    const freq = bin * binHz
    if (freq < minFreqHz || freq > maxFreqHz) continue
    const magnitude = magnitudes[bin]
    if (magnitude <= 0) continue
    const midi = 69 + 12 * Math.log2(freq / A4)
    const pc = ((Math.round(midi) % 12) + 12) % 12
    chroma[pc] += magnitude
  }
  const total = chroma.reduce((a, b) => a + b, 0)
  return total > 0 ? chroma.map((v) => v / total) : chroma
}

/** Expected pitch classes sounding in a window of beats. */
export function expectedPitchClasses(song: Song, fromBeats: number, toBeats: number): Set<number> {
  const pcs = new Set<number>()
  for (const note of song.notes) {
    if (note.startBeats < toBeats && note.startBeats + note.durationBeats > fromBeats) {
      pcs.add(note.midi % 12)
    }
  }
  return pcs
}

/** Score how well a heard chroma vector matches an expected set of pitch
 * classes. Partial matches score positively so partial phrasings still count. */
export function matchScore(chroma: number[], expected: Set<number>): number {
  if (expected.size === 0) return 0
  let inside = 0
  let outside = 0
  for (let pc = 0; pc < 12; pc++) {
    if (expected.has(pc)) inside += chroma[pc]
    else outside += chroma[pc]
  }
  return inside - outside * 0.5
}

export interface SmartListenerOptions {
  onPosition: (beats: number) => void
  onLevel?: (level: number) => void
  onError?: (message: string) => void
  onDebug?: (snapshot: SmartDebugSnapshot) => void
  tuning?: Partial<SmartTuning>
}

export interface SmartTuning {
  minFreqHz: number
  maxFreqHz: number
  updateIntervalMs: number
  analyserSmoothing: number
  silenceThreshold: number
  levelScale: number
  windowBeats: number
  lookaheadBeats: number
  aheadStepBeats: number
  aheadPenalty: number
  scoreThreshold: number
  confidenceAttack: number
  confidenceDecay: number
  confidenceGate: number
  maxStepBeats: number
}

export interface SmartDebugSnapshot {
  energy: number
  level: number
  bestScore: number
  bestBeats: number
  confidence: number
  positionBeats: number
}

export const DEFAULT_SMART_TUNING: SmartTuning = {
  minFreqHz: 60,
  maxFreqHz: 2500,
  updateIntervalMs: 150,
  analyserSmoothing: 0.6,
  silenceThreshold: 0.05,
  levelScale: 2,
  windowBeats: 2,
  lookaheadBeats: 8,
  aheadStepBeats: 0.5,
  aheadPenalty: 0.02,
  scoreThreshold: 0.35,
  confidenceAttack: 0.25,
  confidenceDecay: 0.1,
  confidenceGate: 0.4,
  maxStepBeats: 2,
}

const tuningBounds: Record<keyof SmartTuning, [number, number]> = {
  minFreqHz: [20, 5000],
  maxFreqHz: [60, 10000],
  updateIntervalMs: [40, 1000],
  analyserSmoothing: [0, 0.99],
  silenceThreshold: [0, 1],
  levelScale: [0.1, 20],
  windowBeats: [0.25, 16],
  lookaheadBeats: [0.5, 64],
  aheadStepBeats: [0.125, 4],
  aheadPenalty: [0, 1],
  scoreThreshold: [0, 1],
  confidenceAttack: [0, 1],
  confidenceDecay: [0, 1],
  confidenceGate: [0, 1],
  maxStepBeats: [0.25, 16],
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function resolveSmartTuning(tuning?: Partial<SmartTuning>): SmartTuning {
  const merged = { ...DEFAULT_SMART_TUNING, ...tuning }
  const resolved = {} as SmartTuning
  for (const key of Object.keys(DEFAULT_SMART_TUNING) as (keyof SmartTuning)[]) {
    const [min, max] = tuningBounds[key]
    const value = merged[key]
    resolved[key] = Number.isFinite(value) ? clamp(value, min, max) : DEFAULT_SMART_TUNING[key]
  }
  if (resolved.maxFreqHz <= resolved.minFreqHz) {
    resolved.maxFreqHz = Math.min(10000, resolved.minFreqHz + 100)
  }
  if (resolved.lookaheadBeats < resolved.aheadStepBeats * 2) {
    resolved.lookaheadBeats = resolved.aheadStepBeats * 2
  }
  return resolved
}

export class SmartListener {
  private song: Song
  private options: SmartListenerOptions
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private stream: MediaStream | null = null
  private intervalId: number | null = null
  private freqData: Float32Array<ArrayBuffer> | null = null
  private positionBeats = 0
  private confidence = 0
  private tuning: SmartTuning

  constructor(song: Song, options: SmartListenerOptions) {
    this.song = song
    this.options = options
    this.tuning = resolveSmartTuning(options.tuning)
  }

  setTuning(tuning: Partial<SmartTuning>): void {
    const previousInterval = this.tuning.updateIntervalMs
    this.tuning = resolveSmartTuning({ ...this.tuning, ...tuning })
    if (this.analyser) this.analyser.smoothingTimeConstant = this.tuning.analyserSmoothing
    if (
      this.intervalId !== null &&
      this.analyser &&
      this.freqData &&
      this.tuning.updateIntervalMs !== previousInterval
    ) {
      window.clearInterval(this.intervalId)
      this.scheduleAnalysis()
    }
  }

  async start(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false },
      })
    } catch {
      this.options.onError?.(
        'Microphone access was blocked. Please allow microphone access and try again.',
      )
      throw new Error('microphone-denied')
    }
    this.audioContext = new AudioContext()
    const source = this.audioContext.createMediaStreamSource(this.stream)
    this.analyser = this.audioContext.createAnalyser()
    this.analyser.fftSize = 4096
    this.analyser.smoothingTimeConstant = this.tuning.analyserSmoothing
    source.connect(this.analyser)

    this.freqData = new Float32Array(this.analyser.frequencyBinCount)
    this.scheduleAnalysis()
  }

  stop(): void {
    if (this.intervalId !== null) window.clearInterval(this.intervalId)
    this.intervalId = null
    this.stream?.getTracks().forEach((t) => t.stop())
    this.audioContext?.close().catch(() => {})
    this.audioContext = null
    this.analyser = null
    this.stream = null
    this.freqData = null
  }

  reset(): void {
    this.positionBeats = 0
    this.confidence = 0
  }

  private analyse(freqData: Float32Array<ArrayBuffer>): void {
    if (!this.analyser || !this.audioContext) return
    this.analyser.getFloatFrequencyData(freqData)
    // Convert dB values to linear magnitudes.
    const magnitudes = new Float32Array(freqData.length)
    let energy = 0
    for (let i = 0; i < freqData.length; i++) {
      const mag = 10 ** (freqData[i] / 20)
      magnitudes[i] = mag
      energy += mag
    }
    const level = Math.min(1, energy / this.tuning.levelScale)
    this.options.onLevel?.(level)
    if (energy < this.tuning.silenceThreshold) {
      this.options.onDebug?.({
        energy,
        level,
        bestScore: -Infinity,
        bestBeats: this.positionBeats,
        confidence: this.confidence,
        positionBeats: this.positionBeats,
      })
      return // silence: hold the current position
    }

    const chroma = spectrumToChroma(
      magnitudes,
      this.audioContext.sampleRate,
      this.analyser.fftSize,
      this.tuning.minFreqHz,
      this.tuning.maxFreqHz,
    )

    // Compare the heard chroma against candidate positions from the current
    // spot up to a few beats ahead, and pick the best match.
    let best = { score: -Infinity, beats: this.positionBeats }
    for (let ahead = 0; ahead <= this.tuning.lookaheadBeats; ahead += this.tuning.aheadStepBeats) {
      const candidate = this.positionBeats + ahead
      if (candidate > this.song.totalBeats) break
      const expected = expectedPitchClasses(this.song, candidate, candidate + this.tuning.windowBeats)
      const score = matchScore(chroma, expected)
      // Slightly prefer positions closer to where we already are.
      const adjusted = score - ahead * this.tuning.aheadPenalty
      if (adjusted > best.score) best = { score: adjusted, beats: candidate }
    }

    if (best.score > this.tuning.scoreThreshold) {
      this.confidence = Math.min(1, this.confidence + this.tuning.confidenceAttack)
    } else {
      this.confidence = Math.max(0, this.confidence - this.tuning.confidenceDecay)
    }

    if (this.confidence > this.tuning.confidenceGate && best.beats > this.positionBeats) {
      // Move forward gradually; never jump more than 2 beats per update.
      const step = Math.min(this.tuning.maxStepBeats, best.beats - this.positionBeats)
      this.positionBeats += step * this.confidence
      this.options.onPosition(this.positionBeats)
    }
    this.options.onDebug?.({
      energy,
      level,
      bestScore: best.score,
      bestBeats: best.beats,
      confidence: this.confidence,
      positionBeats: this.positionBeats,
    })
  }

  private scheduleAnalysis(): void {
    if (!this.freqData) return
    const freqData = this.freqData
    this.intervalId = window.setInterval(
      () => this.analyse(freqData),
      this.tuning.updateIntervalMs,
    )
  }
}
