import './style.css'
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay'
import { DEMO_SONG_XML } from './demo/odeToJoy'
import { chordChart } from './lib/chords'
import { SmartListener } from './lib/listener'
import { loadFile } from './lib/loadFile'
import { parseMusicXml } from './lib/musicxml'
import { ScrollController } from './lib/scroll'
import { songDurationSeconds } from './lib/song'
import type { Song } from './lib/song'
import { songToTab } from './lib/tab'

type ViewName = 'sheet' | 'chords' | 'tab'

const $ = <T extends HTMLElement>(selector: string): T => {
  const el = document.querySelector<T>(selector)
  if (!el) throw new Error(`Missing element: ${selector}`)
  return el
}

const landing = $('#landing')
const player = $('#player')
const loadError = $('#load-error')
const playerError = $('#player-error')
const songTitle = $('#song-title')
const scoreContainer = $('#score-container')
const sheetView = $('#sheet-view')
const chordsView = $('#chords-view')
const tabView = $('#tab-view')
const fileInput = $<HTMLInputElement>('#file-input')
const speedSlider = $<HTMLInputElement>('#speed-slider')
const speedValue = $('#speed-value')
const durationInput = $<HTMLInputElement>('#duration-input')
const micLevel = $<HTMLMeterElement>('#mic-level')
const smartStatus = $('#smart-status')
const playButton = $('#play-button')

const scroller = new ScrollController(scoreContainer)
const osmd = new OpenSheetMusicDisplay(sheetView, {
  autoResize: true,
  drawTitle: true,
  drawPartNames: false,
})

let currentSong: Song | null = null
let currentView: ViewName = 'sheet'
let listener: SmartListener | null = null
let sheetRendered = false

function showError(target: HTMLElement, message: string): void {
  target.textContent = message
  target.hidden = false
}

function clearErrors(): void {
  loadError.hidden = true
  playerError.hidden = true
}

async function renderSheet(song: Song): Promise<void> {
  await osmd.load(song.musicXml)
  osmd.render()
  sheetRendered = true
}

function renderChords(song: Song): void {
  const chords = chordChart(song)
  chordsView.replaceChildren()
  if (chords.length === 0) {
    const p = document.createElement('p')
    p.textContent = 'No chords found in this song.'
    chordsView.appendChild(p)
    return
  }
  const beatsPerMeasure = song.beatsPerMeasure || 4
  for (const chord of chords) {
    const line = document.createElement('div')
    line.className = 'chord-line'
    const measure = document.createElement('span')
    measure.className = 'chord-measure'
    measure.textContent = `Bar ${Math.floor(chord.startBeats / beatsPerMeasure) + 1}`
    const symbol = document.createElement('span')
    symbol.className = 'chord-symbol'
    symbol.textContent = chord.symbol
    line.append(measure, symbol)
    chordsView.appendChild(line)
  }
}

function renderTab(song: Song): void {
  tabView.textContent = songToTab(song)
}

function setView(view: ViewName): void {
  currentView = view
  sheetView.hidden = view !== 'sheet'
  chordsView.hidden = view !== 'chords'
  tabView.hidden = view !== 'tab'
  for (const tab of document.querySelectorAll<HTMLButtonElement>('.tab')) {
    const active = tab.dataset.view === view
    tab.classList.toggle('active', active)
    tab.setAttribute('aria-selected', String(active))
  }
  scoreContainer.scrollTop = 0
  if (view === 'sheet' && currentSong && !sheetRendered) {
    renderSheet(currentSong).catch(() =>
      showError(playerError, 'Could not draw the sheet music for this song.'),
    )
  }
}

async function openSong(song: Song): Promise<void> {
  clearErrors()
  stopPlaying()
  currentSong = song
  sheetRendered = false
  scroller.setSong(song)
  songTitle.textContent = song.title
  durationInput.value = String(Math.max(10, Math.round(songDurationSeconds(song))))
  scroller.timedDuration = Number(durationInput.value)

  renderChords(song)
  renderTab(song)

  landing.hidden = true
  player.hidden = false
  setView(currentView)
  if (currentView !== 'sheet') {
    // Pre-render the sheet in the background so switching tabs is instant.
    renderSheet(song).catch(() => {})
  }
}

async function openFile(file: File): Promise<void> {
  clearErrors()
  try {
    await openSong(await loadFile(file))
  } catch (error) {
    const message =
      error instanceof Error && error.message !== 'microphone-denied'
        ? error.message
        : 'Sorry, something went wrong reading that file.'
    showError(landing.hidden ? playerError : loadError, message)
  }
}

function setMode(mode: 'manual' | 'timed' | 'smart'): void {
  stopPlaying()
  scroller.mode = mode
  $('#manual-controls').hidden = mode !== 'manual'
  $('#timed-controls').hidden = mode !== 'timed'
  $('#smart-controls').hidden = mode !== 'smart'
  for (const button of document.querySelectorAll<HTMLButtonElement>('.mode')) {
    const active = button.dataset.mode === mode
    button.classList.toggle('active', active)
    button.setAttribute('aria-pressed', String(active))
  }
}

async function startPlaying(): Promise<void> {
  clearErrors()
  if (scroller.mode === 'smart') {
    if (!currentSong) return
    listener = new SmartListener(currentSong, {
      onPosition: (beats) => scroller.setSmartPosition(beats),
      onLevel: (level) => {
        micLevel.value = level
        smartStatus.textContent = level > 0.05 ? 'Listening… play on!' : 'Listening for your playing…'
      },
      onError: (message) => showError(playerError, message),
    })
    try {
      await listener.start()
    } catch {
      listener = null
      return
    }
  }
  scroller.start()
  playButton.textContent = '⏸ Pause'
  playButton.classList.remove('primary')
}

function stopPlaying(): void {
  scroller.stop()
  listener?.stop()
  listener = null
  micLevel.value = 0
  smartStatus.textContent = 'Press Start and play along'
  playButton.textContent = '▶ Start'
  playButton.classList.add('primary')
}

// --- Wire up the UI ---

$('#demo-button').addEventListener('click', () => {
  try {
    openSong(parseMusicXml(DEMO_SONG_XML))
  } catch {
    showError(loadError, 'Could not load the demo song.')
  }
})

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (file) openFile(file)
  fileInput.value = ''
})

$('#change-song').addEventListener('click', () => {
  stopPlaying()
  player.hidden = true
  landing.hidden = false
})

for (const tab of document.querySelectorAll<HTMLButtonElement>('.tab')) {
  tab.addEventListener('click', () => setView(tab.dataset.view as ViewName))
}

for (const button of document.querySelectorAll<HTMLButtonElement>('.mode')) {
  button.addEventListener('click', () =>
    setMode(button.dataset.mode as 'manual' | 'timed' | 'smart'),
  )
}

speedSlider.addEventListener('input', () => {
  scroller.manualSpeed = Number(speedSlider.value)
  speedValue.textContent = `${speedSlider.value} px/s`
})

durationInput.addEventListener('input', () => {
  const value = Number(durationInput.value)
  if (value > 0) scroller.timedDuration = value
})

playButton.addEventListener('click', () => {
  if (scroller.running) stopPlaying()
  else startPlaying()
})

$('#restart-button').addEventListener('click', () => {
  scroller.restart()
  listener?.reset()
})

// Drag & drop anywhere on the page.
document.body.addEventListener('dragover', (event) => {
  event.preventDefault()
  landing.classList.add('drag-over')
})
document.body.addEventListener('dragleave', () => landing.classList.remove('drag-over'))
document.body.addEventListener('drop', (event) => {
  event.preventDefault()
  landing.classList.remove('drag-over')
  const file = event.dataTransfer?.files?.[0]
  if (file) openFile(file)
})
