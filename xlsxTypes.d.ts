// Type stub for SheetJS loaded via CDN <script> in index.html
// No npm package needed — window.XLSX is set by the CDN bundle

interface XLSXWorksheet {
  [cell: string]: unknown;
  '!cols'?: { wch?: number }[];
  '!ref'?: string;
}

interface XLSXWorkbook {
  SheetNames: string[];
  Sheets: Record<string, XLSXWorksheet>;
}

interface XLSXUtils {
  sheet_to_json<T = Record<string, unknown>>(ws: XLSXWorksheet, opts?: { defval?: unknown }): T[];
  json_to_sheet<T = Record<string, unknown>>(data: T[]): XLSXWorksheet;
  book_new(): XLSXWorkbook;
  book_append_sheet(wb: XLSXWorkbook, ws: XLSXWorksheet, name?: string): void;
}

interface XLSXStatic {
  read(data: Uint8Array, opts: { type: 'array' }): XLSXWorkbook;
  writeFile(wb: XLSXWorkbook, filename: string): void;
  utils: XLSXUtils;
}

declare global {
  interface Window {
    XLSX: XLSXStatic;
  }
}

export {};
