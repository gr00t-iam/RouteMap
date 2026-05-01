// Import addresses from .xlsx, .csv, .tsv, or a Google Sheets URL.
//
// Strategy:
//   - For .xlsx / .xls / .ods we hand the file to SheetJS (xlsx package).
//   - For .csv / .tsv we use PapaParse.
//   - For Google Sheets the user pastes a "share link" or the spreadsheet ID,
//     and we hit the public CSV export endpoint. The sheet must be set to
//     "Anyone with the link — Viewer" or shared with a service account.
//       https://docs.google.com/spreadsheets/d/<id>/export?format=csv&gid=0
//
// Column mapping is fuzzy: we look for headers like "Stop #", "Store Number",
// "Address 1", etc., normalize them, and map to our RawAddressRow shape.
// If the sheet has a single "Full Address" column we use it as oneLine.

import * as XLSX from 'xlsx-js-style';
import Papa from 'papaparse';
import { uuid } from './uuid';
import type { Address, RawAddressRow } from '@/types';

export interface ImportSummary {
  rows: Address[];
  warnings: string[];
}

/** Read a File (xlsx/csv/tsv) and produce normalized Address records. */
export async function importFile(file: File): Promise<ImportSummary> {
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
    const text = await file.text();
    return importCsvText(text, ext === 'tsv' ? '\t' : ',');
  }
  // Treat everything else as a spreadsheet.
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  return normalizeRows(json);
}

/** Read raw CSV/TSV text. */
export function importCsvText(text: string, delimiter = ','): ImportSummary {
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    delimiter,
  });
  return normalizeRows(parsed.data);
}

/** Pull a Google Sheet by URL or ID and import it as CSV. */
export async function importGoogleSheet(urlOrId: string, gid = '0'): Promise<ImportSummary> {
  const id = extractSheetId(urlOrId);
  if (!id) throw new Error('Could not parse a Google Sheets ID from that input.');
  const url = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Google Sheets fetch failed (${res.status}). Make sure the sheet is shared as "Anyone with the link - Viewer".`
    );
  }
  const text = await res.text();
  return importCsvText(text, ',');
}

function extractSheetId(s: string): string | null {
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(s)) return s;
  return null;
}

// ---- Header mapping ----

const HEADER_ALIASES: Record<keyof RawAddressRow, string[]> = {
  stopNumber: ['stop', 'stop #', 'stop number', 'stop no', 'stop_no', 'sequence', 'seq'],
  storeNumber: ['store', 'store #', 'store number', 'store no', 'store_no', 'site', 'site #', 'site number', 'location id', 'site id'],
  name: ['name', 'location', 'location name', 'site name', 'store name'],
  street: ['street', 'address', 'address 1', 'address1', 'street address', 'addr', 'addr 1'],
  city: ['city', 'town'],
  state: ['state', 'st', 'region', 'province'],
  zip: ['zip', 'zipcode', 'zip code', 'postal', 'postal code'],
  country: ['country', 'country code', 'nation'],
  oneLine: ['full address', 'one line address', 'address full', 'full', 'oneline'],
  notes: ['notes', 'note', 'comments', 'memo', 'description'],
};

// Normalize a country string ("USA", "United States", "us", "México") to a 2-letter code.
// Empty / unknown → "US" (the default working market).
const COUNTRY_NORMALIZER: Record<string, string> = {
  'us': 'US', 'usa': 'US', 'u.s.': 'US', 'u.s.a.': 'US', 'united states': 'US',
  'united states of america': 'US', 'america': 'US',
  'ca': 'CA', 'can': 'CA', 'canada': 'CA',
  'mx': 'MX', 'mex': 'MX', 'mexico': 'MX', 'méxico': 'MX',
  'gb': 'GB', 'uk': 'GB', 'u.k.': 'GB', 'united kingdom': 'GB', 'england': 'GB',
  'pr': 'PR', 'puerto rico': 'PR',                  // PR addresses geocode in Census but flag as separate region
  'au': 'AU', 'australia': 'AU',
  'de': 'DE', 'germany': 'DE',
  'fr': 'FR', 'france': 'FR',
  'jp': 'JP', 'japan': 'JP',
  'cn': 'CN', 'china': 'CN',
  'in': 'IN', 'india': 'IN',
  'br': 'BR', 'brazil': 'BR',
};

export function normalizeCountry(raw: string | undefined | null): string {
  if (!raw) return 'US';
  const k = String(raw).trim().toLowerCase();
  if (!k) return 'US';
  if (COUNTRY_NORMALIZER[k]) return COUNTRY_NORMALIZER[k];
  // If user wrote a 2-letter code we don't recognize, accept it as-is.
  if (/^[a-z]{2}$/i.test(k)) return k.toUpperCase();
  // Fallback: store the raw string uppercased so it's at least visible.
  return String(raw).trim().toUpperCase();
}

function buildMapper(headers: string[]): Record<keyof RawAddressRow, string | null> {
  const lower = headers.map((h) => h.trim().toLowerCase());
  const mapper = {} as Record<keyof RawAddressRow, string | null>;
  for (const key of Object.keys(HEADER_ALIASES) as (keyof RawAddressRow)[]) {
    mapper[key] = null;
    for (const alias of HEADER_ALIASES[key]) {
      const idx = lower.indexOf(alias);
      if (idx !== -1) { mapper[key] = headers[idx]; break; }
    }
  }
  return mapper;
}

function normalizeRows(rows: Record<string, unknown>[]): ImportSummary {
  const warnings: string[] = [];
  if (rows.length === 0) return { rows: [], warnings: ['Imported file contains no data rows.'] };
  const headers = Object.keys(rows[0]);
  const mapper = buildMapper(headers);
  const out: Address[] = [];

  for (const row of rows) {
    const get = (k: keyof RawAddressRow) => {
      const col = mapper[k];
      if (!col) return '';
      const v = row[col];
      return v === undefined || v === null ? '' : String(v).trim();
    };

    const street = get('street');
    const city = get('city');
    const state = get('state');
    const zip = get('zip');
    const oneLine = get('oneLine');
    const country = normalizeCountry(get('country'));
    const isInternational = country !== 'US';

    let fullAddress: string;
    if (oneLine) {
      fullAddress = oneLine;
    } else {
      // Append country to the address string for non-US so Nominatim has a hint.
      const parts = [street, city, state, zip];
      if (isInternational) parts.push(country);
      fullAddress = parts.filter(Boolean).join(', ');
    }

    if (!fullAddress) continue; // Skip blank rows entirely.

    out.push({
      id: uuid(),
      stopNumber: get('stopNumber') || null,
      storeNumber: get('storeNumber') || null,
      name: get('name') || null,
      street, city, state, zip, country, isInternational,
      fullAddress,
      lat: null,
      lng: null,
      geocodeStatus: 'pending',
      notes: get('notes') || undefined,
    });
  }

  if (mapper.street === null && mapper.oneLine === null) {
    warnings.push(
      'No "Address" or "Full Address" column was found. Detected headers: ' + headers.join(', ')
    );
  }
  if (mapper.stopNumber === null) warnings.push('No "Stop Number" column detected; stop numbers will be auto-assigned by route order.');
  if (mapper.storeNumber === null) warnings.push('No "Store Number" column detected; export will leave that column blank.');

  return { rows: out, warnings };
}
