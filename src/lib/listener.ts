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
): number[] {
  const chroma = new Array(12).fill(0)
  const binHz = sampleRate / fftSize
  for (let bin = 1; bin < magnitudes.length; bin++) {
    const freq = bin * binHz
    if (freq < 60 || freq > 2500) continue
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
}

export class SmartListener {
  private song: Song
  private options: SmartListenerOptions
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private stream: MediaStream | null = null
  private intervalId = 0
  private positionBeats = 0
  private confidence = 0

  constructor(song: Song, options: SmartListenerOptions) {
    this.song = song
    this.options = options
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
    this.analyser.smoothingTimeConstant = 0.6
    source.connect(this.analyser)

    const freqData = new Float32Array(this.analyser.frequencyBinCount)
    this.intervalId = window.setInterval(() => this.analyse(freqData), 150)
  }

  stop(): void {
    window.clearInterval(this.intervalId)
    this.stream?.getTracks().forEach((t) => t.stop())
    this.audioContext?.close().catch(() => {})
    this.audioContext = null
    this.analyser = null
    this.stream = null
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
    this.options.onLevel?.(Math.min(1, energy / 2))
    if (energy < 0.05) return // silence: hold the current position

    const chroma = spectrumToChroma(
      magnitudes,
      this.audioContext.sampleRate,
      this.analyser.fftSize,
    )

    // Compare the heard chroma against candidate positions from the current
    // spot up to a few beats ahead, and pick the best match.
    const windowBeats = 2
    const lookaheadBeats = 8
    let best = { score: -Infinity, beats: this.positionBeats }
    for (let ahead = 0; ahead <= lookaheadBeats; ahead += 0.5) {
      const candidate = this.positionBeats + ahead
      if (candidate > this.song.totalBeats) break
      const expected = expectedPitchClasses(this.song, candidate, candidate + windowBeats)
      const score = matchScore(chroma, expected)
      // Slightly prefer positions closer to where we already are.
      const adjusted = score - ahead * 0.02
      if (adjusted > best.score) best = { score: adjusted, beats: candidate }
    }

    if (best.score > 0.35) {
      this.confidence = Math.min(1, this.confidence + 0.25)
    } else {
      this.confidence = Math.max(0, this.confidence - 0.1)
    }

    if (this.confidence > 0.4 && best.beats > this.positionBeats) {
      // Move forward gradually; never jump more than 2 beats per update.
      const step = Math.min(2, best.beats - this.positionBeats)
      this.positionBeats += step * this.confidence
      this.options.onPosition(this.positionBeats)
    }
  }
}
