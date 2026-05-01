// Route optimizer.
//
// For each technician we solve a Traveling Salesman Problem (TSP) over their
// assigned stops, using:
//   1. Nearest-neighbor to build a fast initial tour.
//   2. 2-opt local search to remove crossings and improve total distance.
//
// Inputs come as a duration matrix from OSRM /table. Output is the optimal
// stop order (indices into the matrix) and total time/distance.
//
// For 2000+ stops the matrix is too large to fetch in one OSRM call, so the
// caller should already have split stops across technicians (see splitter.ts).
// A typical technician will have a few hundred stops, which is well within
// reach of a 2-opt run.

export interface OptimizeResult {
  order: number[];                  // permutation of [0..n-1]
  totalDuration: number;            // seconds (sum of leg durations)
  totalDistance: number;            // meters
  legDurations: number[];           // per-leg duration (length n-1)
  legDistances: number[];
}

/**
 * Solve TSP for the supplied n x n duration matrix. If startIndex is provided,
 * the tour starts there; otherwise it starts at index 0.
 *
 * If `endIndex` is set and !== startIndex, the optimizer treats this as an
 * "open-tour" problem (start fixed, end fixed) which is what you want when a
 * technician's depot is at a different location than their final stop. Pass
 * `endIndex === startIndex` for a closed loop.
 */
export function optimize(
  durations: number[][],
  distances: number[][],
  options: { startIndex?: number; endIndex?: number; closed?: boolean } = {}
): OptimizeResult {
  const n = durations.length;
  if (n === 0) return { order: [], totalDuration: 0, totalDistance: 0, legDurations: [], legDistances: [] };
  if (n === 1) return { order: [0], totalDuration: 0, totalDistance: 0, legDurations: [], legDistances: [] };

  const start = options.startIndex ?? 0;
  const closed = options.closed ?? false;
  const end = options.endIndex ?? (closed ? start : -1);

  // 1) Nearest-neighbor seed.
  let order = nearestNeighbor(durations, start);
  if (end >= 0 && end !== start) {
    // Move `end` to last position.
    const idx = order.indexOf(end);
    if (idx !== -1) {
      order.splice(idx, 1);
      order.push(end);
    }
  }

  // 2) 2-opt improvement.
  order = twoOpt(order, durations, { fixStart: true, fixEnd: end >= 0 && end !== start });

  // 3) If closed loop, append start at end (we don't store it twice; caller may).
  // Build leg arrays.
  const sequence = closed ? [...order, order[0]] : order;
  const legDurations: number[] = [];
  const legDistances: number[] = [];
  let totalDuration = 0, totalDistance = 0;
  for (let i = 0; i < sequence.length - 1; i++) {
    const a = sequence[i], b = sequence[i + 1];
    const d = durations[a][b], m = distances[a][b];
    legDurations.push(d);
    legDistances.push(m);
    totalDuration += d;
    totalDistance += m;
  }
  return { order, totalDuration, totalDistance, legDurations, legDistances };
}

function nearestNeighbor(d: number[][], start: number): number[] {
  const n = d.length;
  const visited = new Array<boolean>(n).fill(false);
  const order = [start];
  visited[start] = true;
  let cur = start;
  for (let step = 1; step < n; step++) {
    let best = -1, bestD = Infinity;
    for (let j = 0; j < n; j++) {
      if (!visited[j] && d[cur][j] < bestD) { bestD = d[cur][j]; best = j; }
    }
    if (best === -1) break;
    visited[best] = true;
    order.push(best);
    cur = best;
  }
  return order;
}

/**
 * Standard 2-opt with the option to keep the first/last index pinned.
 * Time complexity is roughly O(n^2) per pass; we cap at 50 passes which is
 * plenty for a few hundred stops.
 */
function twoOpt(order: number[], d: number[][], opts: { fixStart: boolean; fixEnd: boolean }): number[] {
  const n = order.length;
  if (n < 4) return order;
  const lo = opts.fixStart ? 1 : 0;
  const hi = opts.fixEnd ? n - 2 : n - 1;
  let improved = true;
  let passes = 0;
  const arr = order.slice();
  while (improved && passes < 50) {
    improved = false;
    passes++;
    for (let i = lo; i < hi - 1; i++) {
      for (let k = i + 1; k <= hi; k++) {
        const a = arr[i - 1], b = arr[i], c = arr[k], next = arr[k + 1] ?? -1;
        const before = d[a][b] + (next >= 0 ? d[c][next] : 0);
        const after = d[a][c] + (next >= 0 ? d[b][next] : 0);
        if (after + 1e-9 < before) {
          // Reverse arr[i..k]
          let l = i, r = k;
          while (l < r) { const t = arr[l]; arr[l] = arr[r]; arr[r] = t; l++; r--; }
          improved = true;
        }
      }
    }
  }
  return arr;
}
