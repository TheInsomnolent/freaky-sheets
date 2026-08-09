/** Auto-scroll controller with three modes:
 *  - manual: constant speed set by a slider
 *  - timed:  scrolls the whole song over a target duration
 *  - smart:  position (in beats) supplied by the microphone listener
 */
import type { Song } from './song'

export type ScrollMode = 'manual' | 'timed' | 'smart'

export class ScrollController {
  private container: HTMLElement
  private rafId = 0
  private lastTime = 0
  private smartBeats = 0
  private song: Song | null = null

  mode: ScrollMode = 'manual'
  /** Manual speed in pixels per second. */
  manualSpeed = 30
  /** Timed mode target duration in seconds. */
  timedDuration = 120
  running = false

  constructor(container: HTMLElement) {
    this.container = container
  }

  setSong(song: Song): void {
    this.song = song
    this.smartBeats = 0
  }

  /** Called by the smart listener with the estimated position in beats. */
  setSmartPosition(beats: number): void {
    this.smartBeats = beats
  }

  private maxScroll(): number {
    return Math.max(0, this.container.scrollHeight - this.container.clientHeight)
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.lastTime = performance.now()
    const step = (time: number) => {
      if (!this.running) return
      const dt = Math.min(0.1, (time - this.lastTime) / 1000)
      this.lastTime = time
      this.tick(dt)
      this.rafId = requestAnimationFrame(step)
    }
    this.rafId = requestAnimationFrame(step)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.rafId)
  }

  /** Jump back to the top of the song. Does not change the running state:
   * if the scroller is running it continues from the top, and if it is
   * paused the caller can resume it with start(). */
  restart(): void {
    this.container.scrollTop = 0
    this.smartBeats = 0
  }

  private tick(dt: number): void {
    const max = this.maxScroll()
    if (max <= 0) return
    switch (this.mode) {
      case 'manual': {
        this.container.scrollTop += this.manualSpeed * dt
        break
      }
      case 'timed': {
        const speed = max / Math.max(1, this.timedDuration)
        this.container.scrollTop += speed * dt
        break
      }
      case 'smart': {
        if (!this.song || this.song.totalBeats <= 0) return
        const target = (this.smartBeats / this.song.totalBeats) * max
        // Ease towards the target so scrolling stays smooth and forgiving.
        const diff = target - this.container.scrollTop
        if (diff > 0) this.container.scrollTop += diff * Math.min(1, dt * 2)
        break
      }
    }
  }
}
