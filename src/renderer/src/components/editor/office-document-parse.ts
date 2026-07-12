import ExcelJS from 'exceljs'

export type SpreadsheetSheet = {
  name: string
  rows: string[][]
}

export function decodeBase64Document(content: string): ArrayBuffer {
  const binary = atob(content)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes.buffer
}

function stringifyCellValue(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) {
    return ''
  }
  if (typeof value !== 'object') {
    return String(value)
  }
  if ('text' in value) {
    return String(value.text)
  }
  if ('result' in value) {
    return String(value.result ?? '')
  }
  if ('richText' in value) {
    return value.richText.map((part) => part.text).join('')
  }
  return JSON.stringify(value)
}

export async function parseWorkbook(buffer: ArrayBuffer): Promise<SpreadsheetSheet[]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const sheets: SpreadsheetSheet[] = []

  workbook.eachSheet((sheet) => {
    const rows: string[][] = []
    sheet.eachRow({ includeEmpty: true }, (row) => {
      const values: string[] = []
      for (let column = 1; column <= sheet.columnCount; column += 1) {
        values.push(stringifyCellValue(row.getCell(column).value))
      }
      rows.push(values)
    })
    sheets.push({
      name: sheet.name,
      rows
    })
  })

  return sheets
}
