import { useState } from 'react';
import { useApp } from './store';
import type { Technician } from './store';

const PRESET_COLORS = [
  '#3b82f6','#f97316','#a855f7','#10b981','#ec4899',
  '#f59e0b','#6366f1','#14b8a6','#ef4444','#84cc16',
  '#0ea5e9','#d946ef','#22c55e','#fb923c','#8b5cf6',
];

function randomColor(existing: string[]): string {
  const unused = PRESET_COLORS.filter((c) => !existing.includes(c));
  if (unused.length) return unused[Math.floor(Math.random() * unused.length)];
  return PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)];
}

export default function TechniciansPage() {
  const { technicians, addTechnician, removeTechnician, setTechnicians } = useApp();
  const [name, setName] = useState('');
  const [color, setColor] = useState(() => randomColor([]));
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  const handleAdd = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (technicians.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())) return;
    const id = `tech-${Date.now()}`;
    addTechnician({ id, name: trimmed, color });
    setName('');
    setColor(randomColor([...technicians.map((t) => t.color), color]));
  };

  const handleSaveEdit = (id: string) => {
    const trimmed = editName.trim();
    if (!trimmed) return;
    setTechnicians(
      technicians.map((t) => t.id === id ? { ...t, name: trimmed, color: editColor } : t)
    );
    setEditId(null);
  };

  const handleRemove = (id: string) => {
    if (!confirm('Remove this technician? Their route assignments will be cleared.')) return;
    removeTechnician(id);
  };

  const startEdit = (t: Technician) => {
    setEditId(t.id);
    setEditName(t.name);
    setEditColor(t.color);
  };

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Technicians</h1>
      <p className="text-sm text-slate-500">
        Add technicians here, then go to the <strong>Routes</strong> page to assign and optimize their stops.
      </p>

      {/* Add form */}
      <div className="card p-4 space-y-3">
        <h2 className="font-semibold text-slate-700">Add Technician</h2>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="label">Name</label>
            <input
              className="input"
              placeholder="e.g. John Smith"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
          </div>
          <div>
            <label className="label">Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-10 h-10 rounded-lg border border-slate-300 cursor-pointer p-0.5"
              />
              <div className="flex flex-wrap gap-1 max-w-[140px]">
                {PRESET_COLORS.slice(0, 10).map((c) => (
                  <button
                    key={c}
                    title={c}
                    onClick={() => setColor(c)}
                    className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                    style={{ backgroundColor: c, borderColor: color === c ? '#1e293b' : 'transparent' }}
                  />
                ))}
              </div>
            </div>
          </div>
          <button
            className="btn-primary whitespace-nowrap"
            onClick={handleAdd}
            disabled={!name.trim()}
          >
            Add
          </button>
        </div>
      </div>

      {/* Technician list */}
      {technicians.length === 0 ? (
        <div className="card p-8 text-center text-slate-400">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
          </svg>
          <p>No technicians yet. Add one above.</p>
        </div>
      ) : (
        <div className="card divide-y divide-slate-100">
          {technicians.map((t) => (
            <div key={t.id} className="px-4 py-3 flex items-center gap-3">
              {editId === t.id ? (
                <>
                  <input
                    type="color"
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    className="w-8 h-8 rounded-full border border-slate-300 cursor-pointer p-0.5 flex-shrink-0"
                  />
                  <input
                    className="input flex-1"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(t.id)}
                    autoFocus
                  />
                  <button className="btn-primary text-xs px-3" onClick={() => handleSaveEdit(t.id)}>Save</button>
                  <button className="btn-ghost text-xs px-3" onClick={() => setEditId(null)}>Cancel</button>
                </>
              ) : (
                <>
                  <div
                    className="w-8 h-8 rounded-full flex-shrink-0 border-2 border-white shadow"
                    style={{ backgroundColor: t.color }}
                  />
                  <span className="flex-1 font-medium text-slate-800">{t.name}</span>
                  <button
                    className="btn-ghost text-xs px-2"
                    onClick={() => startEdit(t)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn-ghost text-xs px-2 text-rose-500 hover:bg-rose-50"
                    onClick={() => handleRemove(t.id)}
                  >
                    Remove
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {technicians.length > 0 && (
        <p className="text-xs text-slate-400 text-center">
          {technicians.length} technician{technicians.length !== 1 ? 's' : ''} · Go to <strong>Routes</strong> to assign stops and export
        </p>
      )}
    </div>
  );
}
