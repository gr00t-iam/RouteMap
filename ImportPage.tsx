// ImportPage.tsx

import { useRef, useState, useCallback } from 'react';
import Papa from 'papaparse';
import { useApp } from './store';
import type { Address } from './store';
import { geocodeBatch, geocodeSingle } from './geocoder';

// ... [existing code ...]

// Define mapping options including "Skip"
const MAPPING_OPTIONS = [
  { value: 'skip', label: '— Skip / Ignore —' },
  { value: 'raw', label: 'Raw Address' },
  { value: 'street', label: 'Street' },
  { value: 'city', label: 'City' },
  { value: 'state', label: 'State' },
  { value: 'zip', label: 'Zip Code' },
  { value: 'storeNumber', label: 'Store Number' },
] as const;

export default function ImportPage() {
  // ... [existing state definitions]
  
  // Helper to handle mapping changes
  const handleMappingChange = (header: string, value: string) => {
    setMapping((prev) => ({
      ...prev,
      [header]: value === 'skip' ? '' : value, // Store as empty string if skipped
    }));
  };

  // Update loadRows to handle skipped columns
  const loadRows = useCallback((headers: string[], rows: Record<string, string>[]) => {
    setHeaders(headers);
    setRows(rows);
    setStep('map');
    
    // Initialize mapping for headers not already mapped
    const newMapping = { ...mapping };
    headers.forEach((h) => {
      if (!newMapping[h] && h !== 'skip') {
        newMapping[h] = ''; // Default to skip/empty
      }
    });
    setMapping(newMapping);
  }, [mapping]);

  // ... [existing CSV/Excel parsing logic]

  // Update the mapping view rendering
  return (
    <div className="p-4 space-y-4">
      {/* ... [existing upload and preview steps] ... */}
      
      {step === 'map' && (
        <div className="card p-4 space-y-4">
          <h2 className="font-semibold text-slate-700">Map Columns</h2>
          <p className="text-sm text-slate-500">
            Map your spreadsheet columns to the required fields. Select <strong>"— Skip / Ignore —"</strong> for any columns you do not need (e.g., Serial Numbers).
          </p>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {headers.map((header) => (
              <div key={header} className="flex flex-col gap-1">
                <label className="label">{header}</label>
                <select
                  value={mapping[header] ?? 'skip'}
                  onChange={(e) => handleMappingChange(header, e.target.value)}
                  className="input"
                >
                  {MAPPING_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={() => setStep('preview')}
              className="btn btn-primary"
            >
              Next: Preview Data &rarr;
            </button>
          </div>
        </div>
      )}
      {/* ... [rest of component] */}
    </div>
  );
}
