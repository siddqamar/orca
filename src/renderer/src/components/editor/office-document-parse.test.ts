// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { decodeBase64Document, parsePresentation, parseWorkbook } from './office-document-parse'

describe('office document parsing', () => {
  it('decodes base64 without changing binary bytes', () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255])
    const base64 = Buffer.from(bytes).toString('base64')
    expect(new Uint8Array(decodeBase64Document(base64))).toEqual(bytes)
  })

  it('extracts formatted worksheet values', () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['Name', 'Count'],
        ['Orca', 3]
      ]),
      'Summary'
    )
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    expect(parseWorkbook(buffer)).toEqual([
      {
        name: 'Summary',
        rows: [
          ['Name', 'Count'],
          ['Orca', '3']
        ]
      }
    ])
  })

  it('orders slides numerically and joins text runs into paragraphs', async () => {
    const archive = new JSZip()
    archive.file(
      'ppt/slides/slide10.xml',
      '<p:sld xmlns:p="p" xmlns:a="a"><a:p><a:r><a:t>Last</a:t></a:r></a:p></p:sld>'
    )
    archive.file(
      'ppt/slides/slide2.xml',
      '<p:sld xmlns:p="p" xmlns:a="a"><a:p><a:r><a:t>Hello </a:t></a:r><a:r><a:t>world</a:t></a:r></a:p></p:sld>'
    )
    const buffer = await archive.generateAsync({ type: 'arraybuffer' })
    await expect(parsePresentation(buffer)).resolves.toEqual([
      { number: 2, paragraphs: ['Hello world'] },
      { number: 10, paragraphs: ['Last'] }
    ])
  })
})
