/** Load an uploaded file (MusicXML, compressed MusicXML or MIDI) into a Song. */
import JSZip from 'jszip'
import { parseMidi } from './midi'
import { parseMusicXml } from './musicxml'
import type { Song } from './song'

export const ACCEPTED_EXTENSIONS = ['.musicxml', '.xml', '.mxl', '.mid', '.midi']

async function extractMxl(data: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(data)
  const containerXml = await zip.file('META-INF/container.xml')?.async('string')
  let rootPath = ''
  if (containerXml) {
    const doc = new DOMParser().parseFromString(containerXml, 'application/xml')
    rootPath = doc.querySelector('rootfile')?.getAttribute('full-path') ?? ''
  }
  if (!rootPath) {
    rootPath =
      Object.keys(zip.files).find(
        (name) => !name.startsWith('META-INF') && /\.(musicxml|xml)$/i.test(name),
      ) ?? ''
  }
  const xml = rootPath ? await zip.file(rootPath)?.async('string') : undefined
  if (!xml) throw new Error('Could not find MusicXML data inside this .mxl file.')
  return xml
}

export async function loadFile(file: File): Promise<Song> {
  const name = file.name.toLowerCase()
  const buffer = await file.arrayBuffer()
  if (name.endsWith('.mid') || name.endsWith('.midi')) {
    return parseMidi(buffer, file.name)
  }
  if (name.endsWith('.mxl')) {
    return parseMusicXml(await extractMxl(buffer))
  }
  if (name.endsWith('.musicxml') || name.endsWith('.xml')) {
    return parseMusicXml(new TextDecoder().decode(buffer))
  }
  throw new Error(
    `Sorry, "${file.name}" is not a supported file. ` +
      `Please choose a MusicXML (.musicxml, .xml, .mxl) or MIDI (.mid, .midi) file.`,
  )
}
