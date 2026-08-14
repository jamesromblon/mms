// @vitest-environment node

import { strFromU8, unzipSync } from 'fflate'
import { expect, test } from 'vitest'
import { buildProductExportRows, buildProductsWorkbook } from '../lib/productExport'

test('builds a typed and formatted Excel product export', async () => {
  const generatedAt = new Date('2026-08-15T09:30:00.000Z')
  const blob = await buildProductsWorkbook({
    products: [{
      name: '=Unsafe Product Name',
      sku: 'ARG-001',
      seller: 'ArgoPH',
      category: 'Electronics',
      price: '₱1,990.00',
      stock: '12',
      status: 'Active',
      updatedAt: '2026-08-14T00:00:00.000Z',
      updated: 'Aug 14, 2026',
    }],
    filters: { status: 'Active', category: 'Electronics' },
    generatedAt,
  })
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const workbook = unzipSync(bytes)
  const sheet = strFromU8(workbook['xl/worksheets/sheet1.xml'])
  const styles = strFromU8(workbook['xl/styles.xml'])
  const sharedStrings = strFromU8(workbook['xl/sharedStrings.xml'])

  expect(blob).toBeInstanceOf(Blob)
  expect([...bytes.slice(0, 2)]).toEqual([0x50, 0x4b])
  expect(Object.keys(workbook)).toContain('xl/workbook.xml')
  expect(Object.keys(workbook)).toContain('xl/sharedStrings.xml')
  expect(sharedStrings).toContain('Argo Marketplace Product Catalog')
  expect(sharedStrings).toContain('Applied filters: Status: Active · Category: Electronics')
  expect(sheet).toContain('state="frozen"')
  expect(sheet).toContain('r="E6"')
  expect(sheet).toContain('r="F6"')
  expect(sheet).not.toContain('<f>')
  expect(styles).toContain('[$₱-en-PH]#,##0.00')
  expect(styles).toContain('yyyy-mm-dd')
})

test('normalizes product export values for Excel cell types', () => {
  const [row] = buildProductExportRows([{
    name: 'Coffee Beans',
    price: '₱425.00',
    stock: '68',
    updated: 'Aug 10, 2026',
  }])

  expect(row.price).toBe(425)
  expect(row.stock).toBe(68)
  expect(row.updated).toBeInstanceOf(Date)
})
