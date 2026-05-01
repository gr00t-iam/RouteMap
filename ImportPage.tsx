import { useRef, useState, useCallback } from 'react';
import Papa from 'papaparse';
import { useApp } from './store';
import type { Address } from './store';
import { geocodeBatch } from './geocoder';

const APP_FIELDS = ['raw', 'street', 'city', 'state', 'zip'] as const;
type AppField = typeof APP_FIELDS[number];

function buildRaw(row: Record<string, string>, mapping: Record<string, AppField>): string {
  const parts: string[] = [];
  if (mapping['street'] || mapping['raw']) {
    const key = Object.keys(mapping).find((k) => mapping[k] === 'raw' || mapping[k] === 'street');
    if (key) parts.push(row[key] ?? '');
  }
  const cityKey = Object.keys(mapping).find((k) => mapping[k] === 'city');
  const stateKey = Object.keys(mapping).find((k) => mapping[k] === 'state');
  const zipKey = Object.keys(mapping).find((k) => mapping[k] === 'zip');
  if (cityKey) parts.push(row[cityKey] ?? '');
  if (stateKey && row[stateKey]) parts.push(row[stateKey] ?? '');
  if (zipKey && row[zipKey]) parts.push(row[zipKey] ?? '');
  return parts.filter(Boolean).join(', ');
}

function autoDetectMapping(headers: string[]): Record<string, AppField> {
  const mapping: Record<string, AppField> = {};
  const lower = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  for (const h of headers) {
    const l = lower(h);
    if (!mapping[h]) {
      if (l.includes('street') || l.includes('address') || l === 'addr') mapping[h] = 'raw';
      else if (l === 'city') mapping[h] = 'city';
      else if (l === 'state' || l === 'st') mapping[h] = 'state';
      else if (l.includes('zip') || l.includes('postal')) mapping[h] = 'zip';
    }
  }
  return mapping;
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

  const handleFile = useCallback((file: File) => {
    setError('');
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        if (!res.data.length) { setError('No rows found in file.'); return; }
        const hdrs = res.meta.fields ?? [];
        setHeaders(hdrs);
        setRows(res.data);
        setMapping(autoDetectMapping(hdrs));
        setStep('map');
      },
      error: () => setError('Failed to parse file.'),
    });
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleImport = async () => {
    const rawKey = Object.keys(mapping).find((k) => mapping[k] === 'raw' || mapping[k] === 'street');
    if (!rawKey) { setError('Please map at least the Address/Street column.'); return; }

    const newAddresses: Address[] = rows.map((row, i) => {
      const id = `addr-${Date.now()}-${i}`;
      const base: Address = { id, raw: '', geocodeStatus: 'pending' };
      for (const [col, field] of Object.entries(mapping)) {
        if (field === 'raw' || field === 'street') base.raw = row[col] ?? '';
        else base[field] = row[col] ?? '';
      }
      if (!base.raw) base.raw = buildRaw(row, mapping);
      // Keep all original columns as extra data
      for (const [k, v] of Object.entries(row)) base[k] = v;
      return base;
    });

    // Merge with existing, avoid duplicates by raw address
    const existingRaws = new Set(addresses.map((a) => a.raw.trim().toLowerCase()));
    const toAdd = newAddresses.filter((a) => !existingRaws.has(a.raw.trim().toLowerCase()));
    setAddresses([...addresses, ...toAdd]);
    setStep('preview');
  };

  const handleGeocode = async () => {
    setStep('geocoding');
    setProgress(0);
    const pending = addresses.filter((a) => a.geocodeStatus !== 'geocoded');
    setProgressTotal(pending.length);

    const BATCH = 5;
    let buffer: Address[] = [];

    await geocodeBatch(
      addresses,
      (done, total) => {
        setProgress(done);
        setProgressTotal(total);
      },
      (addr) => {
        buffer.push(addr);
        if (buffer.length >= BATCH) {
          upsertAddresses([...buffer]);
          buffer = [];
        }
      }
    );
    if (buffer.length > 0) upsertAddresses([...buffer]);
    setStep('preview');
  };

  const handleClear = () => {
    setAddresses([]);
    setHeaders([]);
    setRows([]);
    setMapping({});
    setStep('idle');
    setProgress(0);
  };

  const geocodedCount = addresses.filter((a) => a.geocodeStatus === 'geocoded').length;
  const failedCount = addresses.filter((a) => a.geocodeStatus === 'failed').length;
  const pendingCount = addresses.filter((a) => a.geocodeStatus === 'pending').length;

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Import Addresses</h1>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg p-3 text-sm">{error}</div>
      )}

      {/* Drop zone */}
      {(step === 'idle' || step === 'map') && (
        <div
          className="card border-2 border-dashed border-slate-300 p-8 text-center cursor-pointer hover:border-brand-500 transition-colors"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
        >
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileChange} />
          <svg className="w-10 h-10 mx-auto text-slate-400 mb-3" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <p className="text-slate-600 font-medium">Drop a CSV file here or click to browse</p>
          <p className="text-xs text-slate-400 mt-1">CSV files with address columns</p>
        </div>
      )}

      {/* Column mapping */}
      {step === 'map' && headers.length > 0 && (
        <div className="card p-4 space-y-3">
          <h2 className="font-semibold text-slate-700">Map Columns</h2>
          <p className="text-xs text-slate-500">Tell us which columns contain address parts. Auto-detected below — adjust as needed.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {headers.map((h) => (
              <div key={h}>
                <label className="label">{h}</label>
                <select
                  className="input"
                  value={mapping[h] ?? ''}
                  onChange={(e) => {
                    const val = e.target.value as AppField | '';
                    setMapping((prev) => {
                      const next = { ...prev };
                      if (val) next[h] = val;
                      else delete next[h];
                      return next;
                    });
                  }}
                >
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
            <button className="btn-primary" onClick={handleImport}>
              Import {rows.length} rows
            </button>
            <button className="btn-ghost" onClick={() => setStep('idle')}>Cancel</button>
          </div>
        </div>
      )}

      {/* Preview / geocode */}
      {(step === 'preview' || step === 'geocoding') && addresses.length > 0 && (
        <div className="space-y-4">
          {/* Status summary */}
          <div className="card p-4 flex flex-wrap gap-4 items-center justify-between">
            <div className="flex gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-slate-800">{addresses.length}</p>
                <p className="text-xs text-slate-500">Total</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{geocodedCount}</p>
                <p className="text-xs text-slate-500">Geocoded</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-amber-500">{pendingCount}</p>
                <p className="text-xs text-slate-500">Pending</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-rose-500">{failedCount}</p>
                <p className="text-xs text-slate-500">Failed</p>
              </div>
            </div>
            <div className="flex gap-2">
              {step !== 'geocoding' && pendingCount > 0 && (
                <button className="btn-primary" onClick={handleGeocode}>
                  Geocode All ({pendingCount})
                </button>
              )}
              {step !== 'geocoding' && failedCount > 0 && (
                <button className="btn-ghost" onClick={handleGeocode}>
                  Retry Failed ({failedCount})
                </button>
              )}
              <button className="btn-ghost" onClick={() => setStep('idle')}>
                Import More
              </button>
              <button className="btn-danger" onClick={handleClear}>
                Clear All
              </button>
            </div>
          </div>

          {/* Progress bar */}
          {step === 'geocoding' && (
            <div className="card p-4 space-y-2">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Geocoding addresses…</span>
                <span>{progress} / {progressTotal}</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div
                  className="bg-brand-500 h-2 rounded-full transition-all"
                  style={{ width: progressTotal ? `${(progress / progressTotal) * 100}%` : '0%' }}
                />
              </div>
            </div>
          )}

          {/* Address table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 text-slate-500 font-medium">Address</th>
                    <th className="text-left px-3 py-2 text-slate-500 font-medium">City</th>
                    <th className="text-left px-3 py-2 text-slate-500 font-medium">State</th>
                    <th className="text-left px-3 py-2 text-slate-500 font-medium">ZIP</th>
                    <th className="text-left px-3 py-2 text-slate-500 font-medium">Status</th>
                    <th className="text-left px-3 py-2 text-slate-500 font-medium">Nav</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {addresses.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 max-w-[200px] truncate">{a.raw || a.street as string}</td>
                      <td className="px-3 py-2">{a.city as string}</td>
                      <td className="px-3 py-2">{a.state as string}</td>
                      <td className="px-3 py-2">{a.zip as string}</td>
                      <td className="px-3 py-2">
                        <span className={`badge ${
                          a.geocodeStatus === 'geocoded'
                            ? 'bg-green-100 text-green-700'
                            : a.geocodeStatus === 'failed'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {a.geocodeStatus}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {a.lat != null && a.lng != null && (
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a.raw || '')}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-500 hover:underline text-xs"
                          >
                            Maps
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
