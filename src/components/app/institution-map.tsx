import { dict } from "./i18n";
// Institutions placed in Web Mercator, the projection map tiles use, so a
// self-hosted tile layer lines up when MAP_TILE_URL is set. Tiles must be
// served from this site ("/tiles/{z}/{x}/{y}.png"): the CSP allows only
// same-origin images. Without tiles a whole-degree grid gives orientation.
type Point = { id: string; name: string; district: string; latitude: number | null; longitude: number | null; visits: number };
const W = 960, H = 480, PAD = 56, TILE = 256;
const world = (z: number) => TILE * 2 ** z;
const px = (lng: number, z: number) => ((lng + 180) / 360) * world(z);
const py = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * world(z);
};
const lngAt = (x: number, z: number) => (x / world(z)) * 360 - 180;
const latAt = (y: number, z: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / world(z)))) * 180) / Math.PI;
function tileTemplate() {
  const url = process.env.MAP_TILE_URL ?? "";
  return url.startsWith("/") && !url.startsWith("//") && ["{z}", "{x}", "{y}"].every((k) => url.includes(k)) ? url : null;
}
export function InstitutionMap({ points, locale, hrefFor }: { points: Point[]; locale: string; hrefFor: (p: Point) => string }) {
  const t = dict(locale).institutions;
  const placed = points.filter((p): p is Point & { latitude: number; longitude: number } => p.latitude !== null && p.longitude !== null);
  const missing = points.length - placed.length;
  if (placed.length === 0)
    return (
      <div className="rounded-xl border bg-surface px-6 py-14 text-center">
        <p className="font-medium">{t.noPoints}</p>
        <p className="mt-1 text-muted">{t.noPointsHint}</p>
      </div>
    );
  const lats = placed.map((p) => p.latitude), lngs = placed.map((p) => p.longitude);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  // Highest whole zoom (so tiles stay crisp) at which every point fits.
  let z = 12;
  while (z > 5 && (px(maxLng, z) - px(minLng, z) > W - 2 * PAD || py(minLat, z) - py(maxLat, z) > H - 2 * PAD)) z--;
  const ox = (px(minLng, z) + px(maxLng, z)) / 2 - W / 2;
  const oy = (py(minLat, z) + py(maxLat, z)) / 2 - H / 2;
  const x = (lng: number) => px(lng, z) - ox;
  const y = (lat: number) => py(lat, z) - oy;
  const tiles = tileTemplate();
  const tileList: { key: string; href: string; x: number; y: number }[] = [];
  if (tiles)
    for (let tx = Math.floor(ox / TILE); tx * TILE < ox + W; tx++)
      for (let ty = Math.floor(oy / TILE); ty * TILE < oy + H; ty++)
        tileList.push({ key: `${tx}-${ty}`, href: tiles.replace("{z}", String(z)).replace("{x}", String(tx)).replace("{y}", String(ty)), x: tx * TILE - ox, y: ty * TILE - oy });
  // Grid spacing: the widest step that still draws two lines each way.
  const range = (a: number, b: number, step: number) => {
    const out: number[] = [];
    for (let v = Math.ceil(a / step) * step; v <= b; v += step) out.push(Math.round(v * 1000) / 1000);
    return out;
  };
  const [w0, w1, s0, s1] = [lngAt(ox, z), lngAt(ox + W, z), latAt(oy + H, z), latAt(oy, z)];
  const step = [1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01].find((st) => range(w0, w1, st).length >= 2 && range(s0, s1, st).length >= 2) ?? 0.01;
  const meridians = range(w0, w1, step);
  const parallels = range(s0, s1, step);
  const districts = Object.values(
    placed.reduce<Record<string, { name: string; lat: number; lng: number; n: number }>>((acc, p) => {
      const d = (acc[p.district] ??= { name: p.district, lat: 0, lng: 0, n: 0 });
      d.lat += p.latitude;
      d.lng += p.longitude;
      d.n++;
      return acc;
    }, {}),
  );
  const visited = placed.filter((p) => p.visits > 0).length;
  // Points closer than a dot's width are spread on a small ring around their
  // centre so each stays visible and clickable.
  const clusters: { cx: number; cy: number; members: (typeof placed)[number][] }[] = [];
  for (const p of placed) {
    const [px0, py0] = [x(p.longitude), y(p.latitude)];
    const c = clusters.find((k) => Math.hypot(k.cx - px0, k.cy - py0) < 14);
    if (c) c.members.push(p);
    else clusters.push({ cx: px0, cy: py0, members: [p] });
  }
  const dots = clusters.flatMap((c) =>
    c.members.map((p, i) => {
      const n = c.members.length, a = (2 * Math.PI * i) / n - Math.PI / 2, r = n > 1 ? 11 : 0;
      return { p, cx: c.cx + r * Math.cos(a), cy: c.cy + r * Math.sin(a) };
    }),
  );
  return (
    <figure className="space-y-3">
      <div className="overflow-hidden rounded-xl border bg-surface">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="group" aria-label={t.mapLabel(placed.length, visited)}>
          <rect width={W} height={H} className="fill-surface-2/60" />
          {tileList.map((tl) => <image key={tl.key} href={tl.href} x={tl.x} y={tl.y} width={TILE} height={TILE} />)}
          {!tiles && (
            <g aria-hidden className="text-[11px]">
              {meridians.map((m) => (
                <g key={`m${m}`}>
                  <line x1={x(m)} x2={x(m)} y1={0} y2={H} className="stroke-line" strokeDasharray="2 5" />
                  <text x={x(m) + 4} y={H - 8} className="fill-muted">{m}°E</text>
                </g>
              ))}
              {parallels.map((p) => (
                <g key={`p${p}`}>
                  <line x1={0} x2={W} y1={y(p)} y2={y(p)} className="stroke-line" strokeDasharray="2 5" />
                  <text x={6} y={y(p) - 4} className="fill-muted">{p}°N</text>
                </g>
              ))}
            </g>
          )}
          <g aria-hidden>
            {districts.map((d) => (
              <text key={d.name} x={x(d.lng / d.n)} y={y(d.lat / d.n) - 24} textAnchor="middle" className="fill-ink text-[13px] font-medium" paintOrder="stroke" stroke="var(--ui-surface)" strokeWidth={4}>
                {d.name}
              </text>
            ))}
          </g>
          {dots.map(({ p, cx, cy }) => (
            <a key={p.id} href={hrefFor(p)} aria-label={t.pointTitle(p.name, p.district, p.visits)}>
              <title>{t.pointTitle(p.name, p.district, p.visits)}</title>
              <circle cx={cx} cy={cy} r={10} className="fill-transparent" />
              <circle cx={cx} cy={cy} r={6} strokeWidth={2.5} className={p.visits ? "fill-flag-navy stroke-surface" : "fill-surface stroke-flag-red"} />
            </a>
          ))}
        </svg>
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-muted">
        <span className="flex items-center gap-2"><span aria-hidden className="size-2.5 rounded-full bg-flag-navy" />{t.visitedDot}</span>
        <span className="flex items-center gap-2"><span aria-hidden className="size-2.5 rounded-full border-2 border-flag-red" />{t.notVisitedDot}</span>
        {!tiles && <span>{t.noTiles}</span>}
        {tiles && process.env.MAP_TILE_ATTRIBUTION && <span>{process.env.MAP_TILE_ATTRIBUTION}</span>}
        {missing > 0 && <span>{t.noLocation(missing)}</span>}
      </figcaption>
    </figure>
  );
}
