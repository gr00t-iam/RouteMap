import { useState } from 'react';
import { useApp } from '@/lib/store';
import { splitEqual, splitGeographic, splitManual, splitMixed } from '@/lib/splitter';
import type { SplitStrategy } from '@/types';

const STRATEGIES: { value: SplitStrategy; label: string; help: string }[] = [
  { value: 'equal', label: 'Equally by stop count', help: 'Round-robin assignment so every tech gets the same number of stops.' },
  { value: 'geographic', label: 'By geographic zone', help: 'k-means cluster on coordinates so each tech covers one contiguous area.' },
  { value: 'manual', label: 'Manual drag-and-drop', help: 'Start with no assignment; you drag stops onto technicians.' },
  { value: 'mixed', label: 'Mixed (auto + adjust)', help: 'Auto-cluster geographically, then drag individual stops to fine-tune.' },
];

export default function TechniciansPage() {
  const { addresses, technicians, addTechnician, removeTechnician, splitStrategy, setSplitStrategy, assignment, setAssignment, moveStop } = useApp();
  const [newName, setNewName] = useState('');
  const addrById = new Map(addresses.map((a) => [a.id, a]));

  function applyStrategy(strategy: SplitStrategy) {
    setSplitStrategy(strategy);
    const fn = { equal: splitEqual, geographic: splitGeographic, manual: splitManual, mixed: splitMixed }[strategy];
    setAssignment(fn(addresses, technicians));
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Technicians & Split</h1>

      <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-4">
        <div className="card p-5 space-y-4">
          <div className="text-sm font-medium">Add technician</div>
          <div className="flex gap-2">
            <input className="input" placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button
              className="btn-primary"
              onClick={() => { if (newName.trim()) { addTechnician(newName.trim()); setNewName(''); } }}
            >
              Add
            </button>
          </div>
          <div className="space-y-2">
            {technicians.length === 0 && <div className="text-sm text-slate-500">No technicians yet.</div>}
            {technicians.map((t) => (
              <div key={t.id} className="flex items-center justify-between p-2 rounded-md border">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-full" style={{ background: t.color }} />
                  <span className="text-sm">{t.name}</span>
                  <span className="badge">{(assignment.get(t.id) ?? []).length} stops</span>
                </div>
                <button className="btn-ghost text-rose-600" onClick={() => removeTechnician(t.id)}>Remove</button>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5 space-y-4">
          <div className="text-sm font-medium">Split strategy</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {STRATEGIES.map((s) => (
              <button
                key={s.value}
                onClick={() => applyStrategy(s.value)}
                className={`text-left p-3 rounded-lg border ${splitStrategy === s.value ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'}`}
              >
                <div className="font-medium text-sm">{s.label}</div>
                <div className="text-xs text-slate-600 mt-1">{s.help}</div>
              </button>
            ))}
          </div>

          <div>
            <div className="text-sm font-medium mb-2">Assignment</div>
            {technicians.length === 0 && (
              <div className="text-sm text-slate-500">Add technicians first, then pick a strategy.</div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {technicians.map((t) => {
                const stops = assignment.get(t.id) ?? [];
                return (
                  <div
                    key={t.id}
                    className="border rounded-lg p-3"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData('text/plain');
                      if (id) moveStop(id, t.id);
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="inline-block w-3 h-3 rounded-full" style={{ background: t.color }} />
                      <div className="text-sm font-medium">{t.name}</div>
                      <span className="badge">{stops.length}</span>
                    </div>
                    <div className="max-h-48 overflow-auto space-y-1">
                      {stops.slice(0, 100).map((id) => {
                        const a = addrById.get(id);
                        if (!a) return null;
                        return (
                          <div
                            key={id}
                            draggable
                            onDragStart={(e) => e.dataTransfer.setData('text/plain', id)}
                            className="text-xs p-1.5 rounded border bg-white hover:bg-slate-50 cursor-grab"
                          >
                            <span className="font-mono text-[10px] text-slate-500">#{a.stopNumber ?? '—'}</span>{' '}
                            <span className="font-medium">{a.storeNumber ? `Store ${a.storeNumber}` : a.name || ''}</span>
                            <div className="text-slate-500 truncate">{a.fullAddress}</div>
                          </div>
                        );
                      })}
                      {stops.length > 100 && <div className="text-xs text-slate-500">...and {stops.length - 100} more</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
