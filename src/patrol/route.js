// Waypoints sit inside the inspected aisle. The extra space beyond the collision
// envelope allows the tracker to round a corner before its pelvis reaches it.
const within = (x, y) => x >= -0.5 && x <= 6.55 && y >= -0.45 && y <= 3.05;
const distance = (a, b) => Math.hypot(a[1] - b[1], a[2] - b[2]);
function blocked(a, b, racks) {
  return racks.some(([, x, y, hx, hy]) => {
    let lo = 0,
      hi = 1;
    for (const [start, end, min, max] of [
      [a[1], b[1], x - hx - 0.65, x + hx + 0.65],
      [a[2], b[2], y - hy - 0.65, y + hy + 0.65],
    ]) {
      const d = end - start;
      if (Math.abs(d) < 1e-9) {
        if (start < min || start > max) return false;
        continue;
      }
      const p = (min - start) / d,
        q = (max - start) / d;
      lo = Math.max(lo, Math.min(p, q));
      hi = Math.min(hi, Math.max(p, q));
    }
    return lo <= hi;
  });
}
export function allowed(node, racks) {
  return within(node[1], node[2]) && !blocked(node, node, racks);
}
export function plan(stops, layout) {
  const dock = layout.route.find((n) => n[0] === "dock"),
    via = layout.route.filter((n) => n[3] === 0);
  let current = dock;
  const result = [];
  for (const end of [...stops, dock]) {
    const nodes = [current, ...via, end],
      last = nodes.length - 1,
      cost = nodes.map(() => Infinity),
      prev = [],
      open = new Set(nodes.keys());
    cost[0] = 0;
    while (open.size) {
      const i = [...open].reduce((a, b) => (cost[a] < cost[b] ? a : b));
      if (!Number.isFinite(cost[i]) || i === last) break;
      open.delete(i);
      for (const j of open) {
        const next = cost[i] + distance(nodes[i], nodes[j]);
        if (next < cost[j] && !blocked(nodes[i], nodes[j], layout.racks)) {
          cost[j] = next;
          prev[j] = i;
        }
      }
    }
    if (!Number.isFinite(cost[last])) return null;
    const leg = [];
    for (let j = last; j !== 0; j = prev[j]) leg.unshift(nodes[j]);
    result.push(...leg);
    current = end;
  }
  return result;
}
