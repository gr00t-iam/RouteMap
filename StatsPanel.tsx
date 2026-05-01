import { Bar, Doughnut } from 'react-chartjs-2';
import {
  ArcElement, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Title, Tooltip,
} from 'chart.js';
import type { Address, Route, Technician } from '@/types';
import { useMemo } from 'react';

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Title, Tooltip, Legend);

interface Props {
  addresses: Address[];
  technicians: Technician[];
  routes: Route[];
}

export default function StatsPanel({ addresses, technicians, routes }: Props) {
  const techById = useMemo(() => new Map(technicians.map((t) => [t.id, t])), [technicians]);

  const totalStops = addresses.length;
  const matched = addresses.filter((a) => a.geocodeStatus === 'matched').length;
  const unmatched = addresses.filter((a) => a.geocodeStatus !== 'matched').length;
  const intlStops = addresses.filter((a) => a.isInternational).length;

  // Stops grouped by country (for the bar chart).
  const byCountry = new Map<string, number>();
  for (const a of addresses) byCountry.set(a.country, (byCountry.get(a.country) ?? 0) + 1);
  const countryEntries = Array.from(byCountry.entries()).sort((a, b) => b[1] - a[1]);

  const totalMiles = routes.reduce((s, r) => s + r.totalDistanceMeters / 1609.344, 0);
  const totalHours = routes.reduce((s, r) => s + r.totalDurationSeconds / 3600, 0);

  // Average drive distance + time *between* stops, summed across every leg of every route.
  const totalLegs = routes.reduce((s, r) => s + Math.max(0, r.stops.length - 1), 0);
  const avgLegMiles = totalLegs > 0 ? totalMiles / totalLegs : 0;
  const avgLegMinutes = totalLegs > 0 ? (totalHours * 60) / totalLegs : 0;

  // Per-tech average leg time (minutes) — for the chart below.
  const avgLegMinutesPerTech = routes.map((r) => {
    const legs = Math.max(0, r.stops.length - 1);
    return legs > 0 ? Number(((r.totalDurationSeconds / 60) / legs).toFixed(1)) : 0;
  });

  const stopsPerTech = {
    labels: routes.map((r) => techById.get(r.technicianId)?.name ?? 'Tech'),
    datasets: [{
      label: 'Stops',
      data: routes.map((r) => r.stops.length),
      backgroundColor: routes.map((r) => techById.get(r.technicianId)?.color ?? '#475569'),
    }],
  };

  const milesPerTech = {
    labels: routes.map((r) => techById.get(r.technicianId)?.name ?? 'Tech'),
    datasets: [{
      label: 'Miles',
      data: routes.map((r) => Number((r.totalDistanceMeters / 1609.344).toFixed(1))),
      backgroundColor: routes.map((r) => techById.get(r.technicianId)?.color ?? '#475569'),
    }],
  };

  const geocodeStatus = {
    labels: ['Matched', 'Unmatched / Pending'],
    datasets: [{
      data: [matched, unmatched],
      backgroundColor: ['#16a34a', '#f59e0b'],
    }],
  };

  const avgTimePerTech = {
    labels: routes.map((r) => `${techById.get(r.technicianId)?.name ?? 'Tech'}${r.country !== 'US' ? ` (${r.country})` : ''}`),
    datasets: [{
      label: 'Avg min between stops',
      data: avgLegMinutesPerTech,
      backgroundColor: routes.map((r) => techById.get(r.technicianId)?.color ?? '#475569'),
    }],
  };

  const stopsByCountry = {
    labels: countryEntries.map(([c]) => c),
    datasets: [{
      label: 'Stops',
      data: countryEntries.map(([, n]) => n),
      backgroundColor: countryEntries.map(([c]) => c === 'US' ? '#2563eb' : '#7c3aed'),
    }],
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-7 gap-3">
        <Stat label="Total Stops" value={totalStops.toLocaleString()} />
        <Stat label="Geocoded" value={`${matched}/${totalStops}`} />
        <Stat label="International" value={intlStops.toLocaleString()} />
        <Stat label="Total Miles" value={totalMiles.toFixed(0)} />
        <Stat label="Total Hours" value={totalHours.toFixed(1)} />
        <Stat label="Avg Mi / Leg" value={avgLegMiles.toFixed(1)} />
        <Stat label="Avg Min / Leg" value={avgLegMinutes.toFixed(0)} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Stops per Technician">
          <Bar data={stopsPerTech} options={{ responsive: true, plugins: { legend: { display: false } } }} />
        </ChartCard>
        <ChartCard title="Miles per Technician">
          <Bar data={milesPerTech} options={{ responsive: true, plugins: { legend: { display: false } } }} />
        </ChartCard>
        <ChartCard title="Avg Drive Time Between Stops (min)">
          <Bar data={avgTimePerTech} options={{ responsive: true, plugins: { legend: { display: false } } }} />
        </ChartCard>
        <ChartCard title="Stops by Country">
          <Bar data={stopsByCountry} options={{ responsive: true, plugins: { legend: { display: false } }, indexAxis: 'y' as const }} />
        </ChartCard>
        <ChartCard title="Geocoding Status">
          <Doughnut data={geocodeStatus} options={{ responsive: true }} />
        </ChartCard>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="text-sm font-medium mb-2">{title}</div>
      <div className="h-56">{children}</div>
    </div>
  );
}
