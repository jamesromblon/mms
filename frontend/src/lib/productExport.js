const EXCEL_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const cleanText = (value) => String(value ?? "").replace(/\r?\n/g, " ");

const toNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const toDate = (value) => {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
};

const toFilenameDate = (date) => date.toISOString().slice(0, 10);

const toGeneratedLabel = (date) => new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
}).format(date);

const textCell = (value, overrides = {}) => ({
  value: cleanText(value),
  type: String,
  format: "@",
  fontFamily: "Calibri",
  fontSize: 10,
  borderStyle: "thin",
  borderColor: "#E2E8F0",
  alignVertical: "center",
  ...overrides,
});

const emptyRow = () => Array.from({ length: 8 }, () => null);

export const buildProductExportRows = (products) => products.map((item) => ({
  name: item.name,
  sku: item.sku,
  seller: item.seller,
  category: item.category,
  price: toNumber(item.price),
  stock: toNumber(item.stock),
  status: item.status,
  updated: toDate(item.updatedAt || item.updated),
  updatedLabel: item.updated || "—",
}));

export async function buildProductsWorkbook({ products, filters = {}, generatedAt = new Date() }) {
  const { default: writeExcelFile } = await import("write-excel-file/universal");
  const rows = buildProductExportRows(products);
  const filterLabels = [
    filters.query && `Search: ${filters.query}`,
    filters.status && filters.status !== "All Statuses" && `Status: ${filters.status}`,
    filters.category && filters.category !== "All Categories" && `Category: ${filters.category}`,
  ].filter(Boolean);
  const titleCell = textCell("Argo Marketplace Product Catalog", {
    columnSpan: 8,
    height: 28,
    backgroundColor: "#0F172A",
    textColor: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    borderStyle: "none",
  });
  const summaryCell = (value) => textCell(value, {
    columnSpan: 8,
    textColor: "#64748B",
    fontStyle: "italic",
    borderStyle: "none",
  });
  const headers = [
    "Product", "SKU", "Seller", "Category", "Price (PHP)", "Stock", "Status", "Updated",
  ].map((value) => textCell(value, {
    height: 23,
    backgroundColor: "#2563EB",
    textColor: "#FFFFFF",
    fontWeight: "bold",
    align: "center",
    borderColor: "#1D4ED8",
  }));
  const sheetData = [
    [titleCell, ...Array.from({ length: 7 }, () => null)],
    [summaryCell(`Generated ${toGeneratedLabel(generatedAt)} · ${rows.length} product${rows.length === 1 ? "" : "s"}`), ...Array.from({ length: 7 }, () => null)],
    [summaryCell(filterLabels.length ? `Applied filters: ${filterLabels.join(" · ")}` : "Applied filters: None"), ...Array.from({ length: 7 }, () => null)],
    emptyRow(),
    headers,
    ...rows.map((row) => [
      textCell(row.name, { wrap: true }),
      textCell(row.sku),
      textCell(row.seller),
      textCell(row.category),
      {
        value: row.price,
        type: Number,
        format: "[$₱-en-PH]#,##0.00",
        fontFamily: "Calibri",
        fontSize: 10,
        borderStyle: "thin",
        borderColor: "#E2E8F0",
        align: "right",
        alignVertical: "center",
      },
      {
        value: row.stock,
        type: Number,
        format: "#,##0",
        fontFamily: "Calibri",
        fontSize: 10,
        borderStyle: "thin",
        borderColor: "#E2E8F0",
        align: "right",
        alignVertical: "center",
      },
      textCell(row.status, { align: "center" }),
      row.updated
        ? {
          value: row.updated,
          type: Date,
          format: "yyyy-mm-dd",
          fontFamily: "Calibri",
          fontSize: 10,
          borderStyle: "thin",
          borderColor: "#E2E8F0",
          align: "center",
          alignVertical: "center",
        }
        : textCell(row.updatedLabel, { align: "center" }),
    ]),
  ];

  return writeExcelFile(
    sheetData,
    {
      sheet: "Products",
      columns: [
        { width: 34 }, { width: 20 }, { width: 26 }, { width: 22 },
        { width: 16 }, { width: 12 }, { width: 18 }, { width: 15 },
      ],
      orientation: "landscape",
      stickyRowsCount: 5,
      dateFormat: "yyyy-mm-dd",
      showGridLines: false,
    },
    { fontFamily: "Calibri", fontSize: 10 },
  ).toBlob();
}

export async function exportProductsWorkbook(options) {
  const blob = await buildProductsWorkbook(options);
  const fileBlob = new Blob([blob], { type: EXCEL_MIME_TYPE });
  const url = URL.createObjectURL(fileBlob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `argo-marketplace-products-${toFilenameDate(options.generatedAt || new Date())}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
