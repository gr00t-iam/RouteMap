import { useRef, useState, useCallback } from 'react';
import Papa from 'papaparse';
import { useApp } from './store';
import type { Address } from './store';
import { geocodeBatch, geocodeSingle } from './geocoder';

// SheetJS is loaded via CDN in index.html as window.XLSX (no npm package needed)

const APP_FIELDS = ['raw', 'street', 'city', 'state', 'zip'] as const;
type AppField = typeof APP_FIELDS[number];

function autoDetectMapping(headers: string[]): Record<string, AppField> {
  const mapping: Record<string, AppField> = {};
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  for (const h of headers) {
    const l = clean(h);
    if (l.includes('street') || l === 'address' || l === 'addr' || l === 'fulladdress' || l === 'location') {
      mapping[h] = 'raw';
    } else if (l === 'city') {
      mapping[h] = 'city';
    } else if (l === 'state' || l === 'st' || l === 'province') {
      mapping[h] = 'state';
    } else if (l.includes('zip') || l.includes('postal') || l === 'postcode') {
      mapping[h] = 'zip';
    }
  }
  return mapping;
}

function rowsToAddresses(rows: Record<string, string>[], mapping: Record<string, AppField>): Address[] {
  return rows.map((row, i) => {
    const id = `addr-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`;
    const a: Address = { id, raw: '', geocodeStatus: 'pending' };
    for (const [col, field] of Object.entries(mapping)) {
      const val = String(row[col] ?? '').trim();
      if (field === 'raw' || field === 'street') a.raw = val;
      else a[field] = val;
    }
    if (!a.raw) {
      const parts = [a.street, a.city, a.state, a.zip].filter(Boolean);
      if (parts.length) a.raw = (parts as string[]).join(', ');
    }
    for (const [k, v] of Object.entries(row)) {
      if (!(k in a)) a[k] = v;
    }
    return a;
  }).filter((a) => a.raw.trim().length > 0);
}

function extractSheetId(url: string): string | null {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : null;
}
function extractGid(url: string): string {
  const m = url.match(/[#&?]gid=([0-9]+)/);
  return m ? m[1] : '0';
}

export default function ImportPage() {
  const { addresses, setAddresses, upsertAddresses } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, AppField>>({});
  const [step, setStep] = useState<'idle' | 'map' | 'preview' | 'geocoding'>('idle');
  const [progress, setProgress] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [error, setError] = useState('');
  const [gsUrl, setGsUrl] = useState('');
  const [gsLoading, setGsLoading] = useState(false);
  const [tab, setTab] = useState<'file' | 'gsheet'>('file');
  // Per-row retry state: id → { editing, text, retrying }
  const [retryState, setRetryState] = useState<Record<string, { editing: boolean; text: string; retrying: boolean }>>({});

  const loadRows = useCallback((hdrs: string[], data: Record<string, string>[]) => {
    setHeaders(hdrs); setRows(data); setMapping(autoDetectMapping(hdrs)); setStep('map'); setError('');
  }, []);

  const parseCsv = useCallback((text: string) => {
    Papa.parse<Record<string, string>>(text, {
      header: true, skipEmptyLines: true,
      complete: (res) => {
        if (!res.data.length) { setError('No rows found.'); return; }
        loadRows(res.meta.fields ?? [], res.data);
      },
      error: () => setError('Failed to parse CSV.'),
    });
  }, [loadRows]);

  const parseXlsx = useCallback((buffer: ArrayBuffer) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const XLSX = (window as any).XLSX;
    if (!XLSX) { setError('Spreadsheet parser not loaded — refresh the page and try again.'); return; }
    try {
      const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!data.length) { setError('No rows found in spreadsheet.'); return; }
      loadRows(Object.keys(data[0]), data);
    } catch {
      setError('Failed to parse spreadsheet. Try saving as CSV first.');
    }
  }, [loadRows]);

  const handleFile = useCallback(async (file: File) => {
    setError('');
    const name = file.name.toLowerCase();
    if (name.endsWith('.csv') || name.endsWith('.txt')) {
      parseCsv(await file.text());
    } else if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.xlsm')) {
      parseXlsx(await file.arrayBuffer());
    } else {
      setError('Unsupported file type. Use .csv, .xlsx, or .xls');
    }
  }, [parseCsv, parseXlsx]);

  const handleGoogleSheets = async () => {
    const sheetId = extractSheetId(gsUrl.trim());
    if (!sheetId) { setError('Invalid URL. Make sure the sheet is shared publicly.'); return; }
    const gid = extractGid(gsUrl.trim());
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
    setGsLoading(true); setError('');
    try {
      const res = await fetch(csvUrl);
      if (!res.ok) throw new Error('Could not fetch — share the sheet as "Anyone with the link can view".');
      parseCsv(await res.text());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load Google Sheet.');
    } finally { setGsLoading(false); }
  };

  const handleImport = () => {
    const hasAddr = Object.values(mapping).some((v) => v === 'raw' || v === 'street');
    if (!hasAddr) { setError('Map at least one column to "Full Address / Street".'); return; }
    const newAddrs = rowsToAddresses(rows, mapping);
    if (!newAddrs.length) { setError('No valid addresses found.'); return; }
    const existing = new Set(addresses.map((a) => a.raw.trim().toLowerCase()));
    setAddresses([...addresses, ...newAddrs.filter((a) => !existing.has(a.raw.trim().toLowerCase()))]);
    setStep('preview'); setError('');
  };

  const handleGeocode = async () => {
    setStep('geocoding'); setProgress(0);
    const pending = addresses.filter((a) => a.geocodeStatus !== 'geocoded');
    setProgressTotal(pending.length);
    const BATCH = 5;
    let buf: Address[] = [];
    await geocodeBatch(
      addresses,
      (done, total) => { setProgress(done); setProgressTotal(total); },
      (addr) => {
        buf.push(addr);
        if (buf.length >= BATCH) { upsertAddresses([...buf]); buf = []; }
      }
    );
    if (buf.length > 0) upsertAddresses([...buf]);
    setStep('preview');
  };

  const handleClearAll = () => {
    if (!confirm('Remove all imported addresses?')) return;
    setAddresses([]); setHeaders([]); setRows([]); setMapping({});
    setStep('idle'); setProgress(0);
  };

  // ── Per-row manual retry ────────────────────────────────────────────────
  const startRetryEdit = (a: Address) => {
    setRetryState((prev) => ({ ...prev, [a.id]: { editing: true, text: a.raw, retrying: false } }));
  };

  const handleRetry = async (a: Address) => {
    const state = retryState[a.id];
    const text = state?.text?.trim() || a.raw;
    setRetryState((prev) => ({ ...prev, [a.id]: { ...prev[a.id], retrying: true } }));
    const updated = await geocodeSingle(a, text);
    upsertAddresses([updated]);
    setRetryState((prev) => {
      const n = { ...prev };
      delete n[a.id];
      return n;
    });
  };

  const geocodedCount = addresses.filter((a) => a.geocodeStatus === 'geocoded').length;
  const failedCount = addresses.filter((a) => a.geocodeStatus === 'failed').length;
  const pendingCount = addresses.filter((a) => a.geocodeStatus === 'pending').length;
  const pct = progressTotal > 0 ? Math.round((progress / progressTotal) * 100) : 0;

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Import Addresses</h1>

      {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg p-3 text-sm">{error}</div>}

      {(step === 'idle' || step === 'map') && (
        <div className="card overflow-hidden">
          <div className="flex border-b border-slate-200">
            {(['file', 'gsheet'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-5 py-3 text-sm font-medium transition-colors ${tab === t ? 'border-b-2 border-blue-500 text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
                {t === 'file' ? '📂  Upload File (CSV / XLSX)' : '📊  Google Sheets URL'}
              </button>
            ))}
          </div>

          {tab === 'file' && (
            <div className="p-8 text-center cursor-pointer hover:bg-slate-50 transition-colors"
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileRef.current?.click()}>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.xlsm" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              <svg className="w-10 h-10 mx-auto text-slate-400 mb-3" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <p className="text-slate-600 font-medium">Drop a file here or click to browse</p>
              <p className="text-xs text-slate-400 mt-1">Supports <strong>.csv</strong>, <strong>.xlsx</strong>, and <strong>.xls</strong></p>
            </div>
          )}

          {tab === 'gsheet' && (
            <div className="p-6 space-y-3">
              <p className="text-sm text-slate-600">
                Paste your Google Sheets URL. The sheet must be shared as{' '}
                <strong>"Anyone with the link can view"</strong>.
              </p>
              <div className="flex gap-2">
                <input className="input flex-1" placeholder="https://docs.google.com/spreadsheets/d/..."
                  value={gsUrl} onChange={(e) => setGsUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleGoogleSheets()} />
                <button className="btn-primary whitespace-nowrap" onClick={handleGoogleSheets}
                  disabled={gsLoading || !gsUrl.trim()}>
                  {gsLoading ? 'Loading…' : 'Import'}
                </button>
              </div>
              <p className="text-xs text-slate-400">To share: File → Share → Change to "Anyone with the link" → Viewer</p>
            </div>
          )}
        </div>
      )}

      {step === 'map' && (
        <div className="card p-4 space-y-3">
          <h2 className="font-semibold text-slate-700">Map Columns
            <span className="text-xs font-normal text-slate-400 ml-2">({rows.length} rows)</span>
          </h2>
          <p className="text-xs text-slate-500">Which columns contain address parts? Auto-detected — adjust as needed.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {headers.map((h) => (
              <div key={h}>
                <label className="label truncate block" title={h}>{h}</label>
                <select className="input" value={mapping[h] ?? ''}
                  onChange={(e) => {
                    const val = e.target.value as AppField | '';
                    setMapping((p) => { const n = { ...p }; if (val) n[h] = val; else delete n[h]; return n; });
                  }}>
                  <option value="">— skip —</option>
                  <option value="raw">Full Address / Street</option>
                  <option value="city">City</option>
                  <option value="state">State</option>
                  <option value="zip">ZIP Code</option>
                </select>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-2">
            <button className="btn-primary" onClick={handleImport}>Import {rows.length} rows →</button>
            <button className="btn-ghost" onClick={() => { setStep('idle'); setError(''); }}>Cancel</button>
          </div>
        </div>
      )}

      {(step === 'preview' || step === 'geocoding') && addresses.length > 0 && (
        <div className="space-y-4">
          <div className="card p-4">
            <div className="flex flex-wrap gap-4 items-center justify-between">
              <div className="flex gap-4">
                {[
                  { label: 'Total', val: addresses.length, cls: 'text-slate-800' },
                  { label: 'Geocoded', val: geocodedCount, cls: 'text-green-600' },
                  { label: 'Pending', val: pendingCount, cls: 'text-amber-500' },
                  { label: 'Failed', val: failedCount, cls: 'text-rose-500' },
                ].map(({ label, val, cls }) => (
                  <div key={label} className="text-center min-w-[52px]">
                    <p className={`text-2xl font-bold ${cls}`}>{val}</p>
                    <p className="text-xs text-slate-500">{label}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {step !== 'geocoding' && (pendingCount > 0 || failedCount > 0) && (
                  <button className="btn-primary" onClick={handleGeocode}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                    </svg>
                    Geocode {pendingCount + failedCount} Addresses
                  </button>
                )}
                {step !== 'geocoding' && (
                  <button className="btn-ghost" onClick={() => setStep('idle')}>+ Import More</button>
                )}
                <button className="btn-danger" onClick={handleClearAll}>Clear All</button>
              </div>
            </div>
            {step === 'geocoding' && (
              <div className="mt-4 space-y-1">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Geocoding… ({progress} / {progressTotal})</span><span>{pct}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2.5">
                  <div className="bg-blue-500 h-2.5 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0 z-10">
                  <tr>
                    {['Address','City','State','ZIP','Status','Actions'].map((h) => (
                      <th key={h} className="text-left px-3 py-2 text-slate-500 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {addresses.map((a) => {
                    const rs = retryState[a.id];
                    const isFailed = a.geocodeStatus === 'failed';
                    const isPending = a.geocodeStatus === 'pending';
                    return (
                      <tr key={a.id} className={`hover:bg-slate-50 ${isFailed ? 'bg-rose-50/40' : ''}`}>
                        <td className="px-3 py-2 font-medium">
                          {rs?.editing ? (
                            <input
                              className="input text-xs py-1"
                              value={rs.text}
                              onChange={(e) => setRetryState((p) => ({ ...p, [a.id]: { ...p[a.id], text: e.target.value } }))}
                              onKeyDown={(e) => e.key === 'Enter' && handleRetry(a)}
                              autoFocus
                              placeholder="Correct address, then click Retry"
                            />
                          ) : (
                            <span className="block max-w-[220px] truncate" title={a.raw}>{a.raw || String(a.street ?? '')}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{String(a.city ?? '')}</td>
                        <td className="px-3 py-2 text-slate-600">{String(a.state ?? '')}</td>
                        <td className="px-3 py-2 text-slate-600">{String(a.zip ?? '')}</td>
                        <td className="px-3 py-2">
                          <span className={`badge ${
                            a.geocodeStatus === 'geocoded' ? 'bg-green-100 text-green-700'
                            : a.geocodeStatus === 'failed' ? 'bg-rose-100 text-rose-700'
                            : 'bg-amber-100 text-amber-700'}`}>
                            {rs?.retrying ? 'retrying…' : a.geocodeStatus}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            {/* Google Maps link for geocoded */}
                            {a.lat != null && !rs?.editing && (
                              <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a.raw || '')}`}
                                target="_blank" rel="noreferrer" className="text-blue-500 hover:underline text-xs">Maps ↗</a>
                            )}
                            {/* Edit & Retry for failed/pending */}
                            {(isFailed || isPending) && !rs?.editing && !rs?.retrying && (
                              <button onClick={() => startRetryEdit(a)}
                                className="text-xs text-amber-600 hover:text-amber-800 font-medium underline underline-offset-2">
                                Edit &amp; Retry
                              </button>
                            )}
                            {/* Quick retry (no edit) for failed */}
                            {isFailed && !rs?.editing && !rs?.retrying && (
                              <button onClick={() => handleRetry(a)}
                                className="text-xs text-rose-600 hover:text-rose-800 font-medium underline underline-offset-2">
                                Retry
                              </button>
                            )}
                            {/* Confirm retry after editing */}
                            {rs?.editing && (
                              <>
                                <button onClick={() => handleRetry(a)} disabled={rs.retrying}
                                  className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded hover:bg-blue-600">
                                  {rs.retrying ? '…' : 'Retry'}
                                </button>
                                <button onClick={() => setRetryState((p) => { const n = { ...p }; delete n[a.id]; return n; })}
                                  className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
