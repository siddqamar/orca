// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { decodeBase64Document, parseWorkbook } from './office-document-parse'

function toArrayBuffer(value: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (value instanceof ArrayBuffer) {
    return value
  }
  return new Uint8Array(value).buffer
}

describe('office document parsing', () => {
  it('decodes base64 without changing binary bytes', () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255])
    const base64 = Buffer.from(bytes).toString('base64')
    expect(new Uint8Array(decodeBase64Document(base64))).toEqual(bytes)
  })

  it('extracts formatted worksheet values', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Summary')
    sheet.addRow(['Name', 'Count', 'Formula'])
    sheet.addRow(['Orca', 3, { formula: 'B2*2', result: 6 }])

    const buffer = toArrayBuffer(await workbook.xlsx.writeBuffer())
    await expect(parseWorkbook(buffer)).resolves.toEqual([
      {
        name: 'Summary',
        rows: [
          ['Name', 'Count', 'Formula'],
          ['Orca', '3', '6']
        ]
      }
    ])
  })
})
