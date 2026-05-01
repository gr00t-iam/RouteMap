import { useState } from 'react';
import { importFile, importGoogleSheet } from '@/lib/importer';
import { geocodeBatch } from '@/lib/geocoder';
import { useApp } from '@/lib/store';
import type { Address } from '@/types';

export default function ImportPage() {
  const { addresses, setAddresses } = useApp();
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [sheetUrl, setSheetUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy('Reading file...');
    try {
      const result = await importFile(file);
      setAddresses(result.rows);
      setWarnings(result.warnings);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function onSheet() {
    if (!sheetUrl) return;
    setError(null);
    setBusy('Fetching Google Sheet...');
    try {
      const result = await importGoogleSheet(sheetUrl);
      setAddresses(result.rows);
      setWarnings(result.warnings);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function onGeocode() {
    if (addresses.length === 0) return;
    setError(null);
    setBusy('Geocoding via Census...');
    setProgress({ done: 0, total: addresses.length });
    try {
      const updated = await geocodeBatch(addresses, (done, total) => setProgress({ done, total }));
      setAddresses(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  const matched = addresses.filter((a) => a.geocodeStatus === 'matched').length;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Import Addresses</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5 space-y-3">
          <div className="text-sm font-medium">From a file</div>
          <p className="text-sm text-slate-600">Upload an .xlsx or .csv. Expected columns include "Stop #", "Store #", and an address (either an "Address" column plus City/State/ZIP, or a single "Full Address" column).</p>
          <input type="file" accept=".csv,.tsv,.xlsx,.xls" onChange={onFile} className="block text-sm" />
        </div>

        <div className="card p-5 space-y-3">
          <div className="text-sm font-medium">From Google Sheets</div>
          <p className="text-sm text-slate-600">Set the sheet's sharing to "Anyone with the link — Viewer", then paste the URL or the spreadsheet ID below.</p>
          <input className="input" placeholder="https://docs.google.com/spreadsheets/d/..." value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} />
          <button className="btn-primary" onClick={onSheet} disabled={!sheetUrl || !!busy}>Import sheet</button>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="card p-4 border-amber-300 bg-amber-50">
          <div className="text-sm font-medium text-amber-900 mb-1">Heads up</div>
          <ul className="list-disc pl-5 text-sm text-amber-900 space-y-1">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {error && (
        <div className="card p-4 border-rose-300 bg-rose-50 text-sm text-rose-900">{error}</div>
      )}

      {addresses.length > 0 && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{addresses.length.toLocaleString()} addresses imported</div>
              <div className="text-xs text-slate-500">{matched} successfully geocoded</div>
            </div>
            <button className="btn-primary" onClick={onGeocode} disabled={!!busy}>
              {busy ?? 'Geocode all (Census)'}
            </button>
          </div>
          {progress && (
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div className="h-2 bg-brand-500" style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} />
            </div>
          )}

          <div className="overflow-auto max-h-96 border rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  {['Stop #', 'Store #', 'Country', 'Name', 'Address', 'Status'].map((h) => (
                    <th key={h} className="text-left px-3 py-2 font-medium text-slate-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {addresses.slice(0, 200).map((a) => <Row key={a.id} a={a} />)}
                {addresses.length > 200 && (
                  <tr><td colSpan={6} className="px-3 py-2 text-slate-500 text-center">…showing first 200 of {addresses.length}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ a }: { a: Address }) {
  const status = a.geocodeStatus === 'matched'
    ? <span className="badge bg-emerald-100 text-emerald-800">matched{a.geocodeSource === 'nominatim' ? ' (OSM)' : ''}</span>
    : a.geocodeStatus === 'unmatched'
      ? <span className="badge bg-amber-100 text-amber-800" title={a.geocodeMessage}>unmatched</span>
      : <span className="badge">pending</span>;
  const country = a.isInternational
    ? <span className="badge bg-indigo-100 text-indigo-800" title="International — geocoded via Nominatim, routed separately">{a.country}</span>
    : <span className="badge">{a.country}</span>;
  return (
    <tr className="border-t">
      <td className="px-3 py-1.5">{a.stopNumber ?? ''}</td>
      <td className="px-3 py-1.5">{a.storeNumber ?? ''}</td>
      <td className="px-3 py-1.5">{country}</td>
      <td className="px-3 py-1.5">{a.name ?? ''}</td>
      <td className="px-3 py-1.5">{a.fullAddress}</td>
      <td className="px-3 py-1.5">{status}</td>
    </tr>
  );
}
