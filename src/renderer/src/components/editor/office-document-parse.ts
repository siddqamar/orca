import JSZip from 'jszip'
import * as XLSX from 'xlsx'

export type SpreadsheetSheet = {
  name: string
  rows: string[][]
}

export type PresentationSlide = {
  number: number
  paragraphs: string[]
}

export function decodeBase64Document(content: string): ArrayBuffer {
  const binary = atob(content)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes.buffer
}

export function parseWorkbook(buffer: ArrayBuffer): SpreadsheetSheet[] {
  const workbook = XLSX.read(buffer, { type: 'array' })
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name]
    const values = sheet
      ? XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' })
      : []
    return {
      name,
      rows: values.map((row) => row.map((value) => String(value)))
    }
  })
}

function slideNumber(path: string): number {
  return Number(/slide(\d+)\.xml$/.exec(path)?.[1] ?? Number.MAX_SAFE_INTEGER)
}

export async function parsePresentation(buffer: ArrayBuffer): Promise<PresentationSlide[]> {
  const archive = await JSZip.loadAsync(buffer)
  const paths = Object.keys(archive.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((left, right) => slideNumber(left) - slideNumber(right))

  return Promise.all(
    paths.map(async (path) => {
      const xml = await archive.file(path)!.async('string')
      const document = new DOMParser().parseFromString(xml, 'application/xml')
      const elements = Array.from(document.getElementsByTagName('*'))
      const paragraphs = elements
        .filter((element) => element.localName === 'p')
        .map((paragraph) =>
          Array.from(paragraph.getElementsByTagName('*'))
            .filter((element) => element.localName === 't')
            .map((text) => text.textContent ?? '')
            .join('')
            .trim()
        )
        .filter(Boolean)
      return { number: slideNumber(path), paragraphs }
    })
  )
}
