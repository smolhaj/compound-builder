import { useEffect, useMemo, useRef } from 'react';
import { profileChart, siteLot, terrainFacts } from '../sim/lotListing';

import type { Site } from '../sim/site';

const C = { line: 'rgba(255,255,255,0.09)', dim: 'rgba(238,238,238,0.62)', gold: '#d8c9a0', good: '#a8d080', bad: '#f0a080', ground: '#7c6a4c', groundTop: '#a89868', water: '#4d86b8' };

/** The ground's cross-section through the camp pad: land, water, the pad and the road end. */
export function ProfileSvg({ site }: { site: Site }) {
  const ch = useMemo(() => profileChart(site, 64), [site]);
  if (!ch) return null;
  const W = 300, Hh = 88, top = 14, bot = 72, L = ch.lengthM || 1;
  const range = Math.max(ch.maxM, 24);
  const X = (d: number) => 4 + (d / L) * (W - 8), Y = (m: number) => bot - (m / range) * (bot - top);
  const line = ch.pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.d).toFixed(1)},${Y(p.yM).toFixed(1)}`).join(' ');
  const area = `${line} L${X(L)},${bot + 6} L${X(0)},${bot + 6} Z`;
  const exag = ((bot - top) / range) / ((W - 8) / L);
  const lake = ch.waterM !== null ? Y(ch.waterM) : null;
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} width="100%" role="img" aria-label="Cross-section of the land" style={{ display: 'block', background: 'rgba(0,0,0,0.18)', borderRadius: 6 }}>
      {lake !== null && <rect x={X(0)} y={lake} width={X(L) - X(0)} height={bot + 6 - lake} fill={C.water} opacity={0.55} />}
      <path d={area} fill={C.ground} opacity={0.85} />
      <path d={line} fill="none" stroke={C.groundTop} strokeWidth={1.4} />
      {ch.pts.map((p, i) => p.wet && lake === null ? <circle key={i} cx={X(p.d)} cy={Y(p.yM) - 1} r={1.6} fill={C.water} /> : null)}
      {/* the camp pad */}
      <g transform={`translate(${X(ch.padAt)},${Y(ch.pts[Math.min(ch.pts.length - 1, Math.round(ch.padAt / L * (ch.pts.length - 1)))].yM)})`}>
        <path d="M0,0 L0,-9" stroke={C.gold} strokeWidth={1.2} /><path d="M0,-9 L7,-7 L0,-5 Z" fill={C.gold} />
      </g>
      <text x={4} y={Hh - 4} fontSize={9.5} fill={C.dim}>{ch.axis === 'W-E' ? 'back of the place' : 'south'}</text>
      <text x={W - 4} y={Hh - 4} fontSize={9.5} fill={C.dim} textAnchor="end">{ch.axis === 'W-E' ? 'county road' : 'north'}</text>
      <text x={W / 2} y={Hh - 4} fontSize={9.5} fill={C.dim} textAnchor="middle">{Math.round(L)} m{exag > 1.25 ? ` · height ×${exag.toFixed(1)}` : ''}</text>
      <text x={4} y={11} fontSize={9.5} fill={C.gold}>{Math.round(ch.maxM)} m</text>
    </svg>
  );
}

/** A small isometric view of the lot (shaded quads, back to front; no WebGL: the card is a button in a list). North is up-left, the road side is the right-hand edge. */
export function LotPreview({ site, width = 240, height = 120 }: { site: Site; width?: number; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const lot = useMemo(() => siteLot(site), [site]);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !lot) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = width * dpr; cv.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const f = lot.field, r = site.home, W = r.x1 - r.x0, D = r.z1 - r.z0;
    const N = 36, M = Math.max(12, Math.min(48, Math.round(N * D / W)));
    const hs: number[][] = [];
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j <= M; j++) { const row: number[] = []; for (let i = 0; i <= N; i++) { const h = f.h(r.x0 + W * i / N, r.z0 + D * j / M); row.push(h); lo = Math.min(lo, h); hi = Math.max(hi, h); } hs.push(row); }
    const lake = f.lake ? f.lake.y : null;
    // isometric: x east (right-down), z south (left-down); the ground drawn at its true height scaled so the relief reads (about 45 % of the depth)
    const cos = Math.cos(Math.PI / 6), sin = 0.5, span = Math.max(1, hi - lo);
    const k = Math.min(3, Math.max(0.6, (Math.min(W, D) * 0.45) / span)) * 0.5;
    const raw = (i: number, j: number, h: number): [number, number] => { const u = i / N * W, v = j / M * D; return [(u - v) * cos, (u + v) * sin - (h - lo) * k]; };
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [i, j] of [[0, 0], [N, 0], [0, M], [N, M]]) for (const h of [lo, hi]) { const [x, y] = raw(i, j, h); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const sc = Math.min((width - 10) / (x1 - x0), (height - 10) / (y1 - y0));
    const P = (i: number, j: number, h: number): [number, number] => { const [x, y] = raw(i, j, h); return [5 + (x - x0) * sc + ((width - 10) - (x1 - x0) * sc) / 2, 5 + (y - y0) * sc + ((height - 10) - (y1 - y0) * sc) / 2]; };
    const cr = f.creek;
    // back to front: the far corner is (0, 0), the near one (N, M)
    for (let d = 0; d < N + M - 1; d++) for (let j = Math.max(0, d - N + 1); j <= Math.min(M - 1, d); j++) {
      const i = d - j;
      const h00 = hs[j][i], h10 = hs[j][i + 1], h01 = hs[j + 1][i], h11 = hs[j + 1][i + 1], h = (h00 + h10 + h01 + h11) / 4;
      const dx = (h10 + h11 - h00 - h01) / 2 / (W / N), dz = (h01 + h11 - h00 - h10) / 2 / (D / M), slope = Math.hypot(dx, dz);
      const wet = lake !== null && h < lake + 0.02;
      const x = r.x0 + W * (i + 0.5) / N, z = r.z0 + D * (j + 0.5) / M;
      const inCreek = !!cr && Math.abs(z - cr.zAt(x)) < cr.halfWidth + 0.6 && h < cr.bedY(x) + 0.7;
      // light from the north-west: faces that fall toward the viewer (south-east) are in shade
      const lit = Math.max(0.55, Math.min(1.35, 1.0 + 0.9 * (-dx * 0.6 - dz * 0.5)));
      let col: string;
      if (wet || inCreek) col = `rgb(${Math.round(64 * lit)},${Math.round(124 * lit)},${Math.round(182 * lit)})`;
      else if (slope > 0.75) col = `rgb(${Math.round(150 * lit)},${Math.round(136 * lit)},${Math.round(118 * lit)})`;
      else if (slope > 0.3) col = `rgb(${Math.round(104 * lit)},${Math.round(120 * lit)},${Math.round(72 * lit)})`;
      else col = `rgb(${Math.round(132 * lit)},${Math.round(160 * lit)},${Math.round(92 * lit)})`;
      const lvl = (hh: number) => (wet ? Math.max(lake!, hh) : hh);
      const a = P(i, j, lvl(h00)), b = P(i + 1, j, lvl(h10)), c = P(i + 1, j + 1, lvl(h11)), e = P(i, j + 1, lvl(h01));
      ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(e[0], e[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // the camp pad
    const pad = lot.stats.pad, pp = P((pad[0] - r.x0) / W * N, (pad[1] - r.z0) / D * M, f.h(pad[0], pad[1]));
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pp[0], pp[1]); ctx.lineTo(pp[0], pp[1] - 9); ctx.stroke();
    ctx.fillStyle = '#d8c9a0'; ctx.beginPath(); ctx.arc(pp[0], pp[1] - 10, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }, [lot, site, width, height]);
  if (!lot) return null;
  return <canvas ref={ref} style={{ width: '100%', aspectRatio: `${width} / ${height}`, display: 'block', borderRadius: 6, background: 'rgba(0,0,0,0.18)' }} aria-label="A small view of the land" />;
}

/** The terrain block of a listing card: the preview, the cross-section and the plain-language rows. */
export function LotTerrain({ site }: { site: Site }) {
  if (!site.lot) return null;
  const facts = terrainFacts(site);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: `1px solid ${C.line}`, paddingTop: 6 }}>
      <LotPreview site={site} />
      <ProfileSvg site={site} />
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 10, rowGap: 3, fontSize: 12.5 }}>
        {facts.map(f => [
          <span key={f.label + 'l'} style={{ color: C.dim }}>{f.label}</span>,
          <span key={f.label + 'v'} style={{ color: f.tone === 'good' ? C.good : f.tone === 'bad' ? C.bad : '#eee' }}>{f.value}</span>,
        ])}
      </div>
    </div>
  );
}

