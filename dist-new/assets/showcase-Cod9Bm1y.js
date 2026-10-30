import { Ao as polygonArea, Bh as insideRing, Co as planPad, I as boreText, Lf as orchardSiteNote, Lp as boreTo, Ph as courtSpot, Up as boreProblem, dg as footprint, fm as PERIMETER, go as drainLineFor, og as KIT, t as terraceSite, vh as buyVehicle, vo as undrained, zo as ungatedCrossings } from "./terrace-DLXr5ugm.js";
/** The lot's frame: `du` runs downhill from the camp, `db` across the slope. */
function frameOf(camp, fall, ground) {
	const cf = Math.cos(fall), sf = Math.sin(fall);
	return {
		P: (du, db) => [camp[0] + du * cf - db * sf, camp[1] + du * sf + db * cf],
		slopeAt: (x, z) => (Math.abs(ground(x + .25, z) - ground(x - .25, z)) + Math.abs(ground(x, z + .25) - ground(x, z - .25))) / .5
	};
}
/** Stake `kind` at the nearest valid spot to `want` whose whole footprint is inside the ring `poly` (with `pad` to spare), searching the ring's bounding box on a two-unit grid, nearest the wanted point first. */
function stakeInside(io, steps, label, kind, poly, want, rots = [0], gap = 1) {
	const def = KIT[kind];
	const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
	const cand = [];
	for (let x = Math.min(...xs); x <= Math.max(...xs); x += 1.5) for (let z = Math.min(...zs); z <= Math.max(...zs); z += 1.5) cand.push([x, z]);
	cand.sort((a, b) => Math.hypot(a[0] - want[0], a[1] - want[1]) - Math.hypot(b[0] - want[0], b[1] - want[1]));
	for (const [x, z] of cand) for (const rot of rots) {
		const sp = io.findSpot(kind, x, z, rot, .6);
		if (!sp) continue;
		const r = footprint(def, sp[0], sp[1], rot);
		if (![
			[r.x0, r.z0],
			[r.x1, r.z0],
			[r.x1, r.z1],
			[r.x0, r.z1]
		].every(([cx, cz]) => insideRing(poly, cx, cz))) continue;
		if (io.game().structures.some((o) => !o.unplaced && KIT[o.kind] && KIT[o.kind].level !== "underground" && !o.kind.startsWith("bunker_") && (() => {
			const q = footprint(KIT[o.kind], o.x, o.z, o.rot);
			return r.x0 < q.x1 + gap && r.x1 > q.x0 - gap && r.z0 < q.z1 + gap && r.z1 > q.z0 - gap;
		})())) continue;
		if (io.game().perimeter.some((w) => PERIMETER[w.kind].blocks.people >= .5 && !PERIMETER[w.kind].walkway && !PERIMETER[w.kind].wallTop && solidSegments(w).some(([a, b]) => segHitsRect(a, b, r, 0)))) continue;
		if (!io.stake(kind, sp[0], sp[1], rot)) continue;
		steps.push({
			step: label,
			ok: true,
			at: sp,
			note: Math.hypot(sp[0] - want[0], sp[1] - want[1]) > .5 ? `${Math.hypot(sp[0] - want[0], sp[1] - want[1]).toFixed(1)} units from the wanted spot` : void 0
		});
		return true;
	}
	steps.push({
		step: label,
		ok: false,
		at: want,
		note: "no valid spot inside the wall"
	});
	return false;
}
var outerRingOf = (g) => {
	const rs = g.perimeter.filter((r) => r.kind === "stone_wall" || r.kind === "concrete_wall").sort((a, b) => polygonArea(b.pts) - polygonArea(a.pts));
	return rs[0] ? rs[0].pts : null;
};
/**
* The showcase as steps: a generator that yields a label at each point where the live game can hand the main thread back to the browser
* (loading screen, input) and carry on. `runMountainShowcase` runs it straight through, so the tests see the same result as the live game.
*/
function* mountainShowcaseSteps(io, opts = {}) {
	if (opts.layout === "bench") return yield* benchShowcaseSteps(io, opts);
	const steps = [], notes = [];
	const { P, slopeAt } = frameOf(io.camp, io.fall, io.ground);
	let dFace = -4, steepest = 0;
	for (let d = 0; d > -40; d -= .25) {
		const [x, z] = P(d, 0), sl = slopeAt(x, z);
		if (sl > steepest) {
			steepest = sl;
			dFace = d;
		}
	}
	let dEdge = 8;
	for (let d = Math.max(2, dFace + 3); d < 40; d += .25) {
		const [x, z] = P(d, 0);
		if (slopeAt(x, z) > .3) {
			dEdge = d;
			break;
		}
	}
	if (steepest < .9) notes.push(`no rock face found uphill of the camp (steepest ground ${steepest.toFixed(2)}): the layout uses the defaults`);
	notes.push(`camp ${io.camp.map((v) => v.toFixed(1)).join(", ")}, fall ${io.fall.toFixed(3)}; ground by du: ` + [
		-14,
		-10,
		-6,
		-2,
		2,
		6,
		10,
		14
	].map((d) => {
		const [x, z] = P(d, 0);
		return `${d}: ${io.ground(x, z).toFixed(1)} (slope ${slopeAt(x, z).toFixed(2)})`;
	}).join(", "));
	io.fund();
	yield "Surveying";
	const why = io.road();
	steps.push({
		step: "Access road (hookup)",
		ok: !why,
		note: why ?? void 0
	});
	yield "Access road";
	const S = (kind, du, db, o = {}) => {
		const [x, z] = P(du, db), label = o.label ?? kind;
		let best = null;
		for (const rot of o.rots ?? [0]) {
			const sp = io.findSpot(kind, x, z, rot, o.radius ?? 16);
			if (sp) {
				const d = Math.hypot(sp[0] - x, sp[1] - z);
				if (!best || d < best.d) best = {
					sp,
					rot,
					d
				};
			}
		}
		if (!best) {
			steps.push({
				step: label,
				ok: false,
				at: [x, z],
				note: "no valid spot within reach (slope, water, another building, the road or the camp)"
			});
			return null;
		}
		if (!io.stake(kind, best.sp[0], best.sp[1], best.rot)) {
			steps.push({
				step: label,
				ok: false,
				at: best.sp,
				note: "the game refused the spot"
			});
			return null;
		}
		steps.push({
			step: label,
			ok: true,
			at: best.sp,
			note: best.d > .5 ? `${best.d.toFixed(1)} units from the wanted spot` : void 0
		});
		return {
			x: best.sp[0],
			z: best.sp[1],
			rot: best.rot
		};
	};
	S("lodge", dEdge - 2.5, 3, {
		rots: [
			0,
			1,
			2,
			3
		],
		radius: 8,
		label: "Lodge (walkout basement)"
	});
	S("greenhouse_heated", dFace + 3, -6, { label: "Glass greenhouse" });
	S("bunker_hatch", dEdge - 7, 0, { label: "Bunker hatch" });
	yield "Buildings";
	const terr = terraceSite(io.game());
	if (terr) {
		const spots = terr.tiers.map((t) => [t.x, t.z]);
		const err = io.stakeTerraces(spots);
		steps.push({
			step: "Terraced garden beds",
			ok: !err,
			at: spots[0],
			note: err ?? `${terr.tiers.length} beds on a ${terr.slopePct} % slope`
		});
	} else steps.push({
		step: "Terraced garden beds",
		ok: false,
		note: "terraceSite found no 10-26 % fall near the home on the home block"
	});
	const concrete = opts.wall === "concrete";
	yield "Terraces";
	const fr = io.fortify({
		scope: "core",
		shape: "irregular",
		wall: concrete ? "concrete_wall" : "stone_wall",
		towers: 5,
		towerKind: concrete ? "watchtower_hex" : "watchtower_octagon",
		passage: false,
		rings: opts.rings ?? 1,
		ringWall: "stone_wall",
		ringSally: true,
		motorCourt: true
	});
	steps.push({
		step: `Fortify my ring (${concrete ? "concrete wall, hexagon towers" : "stone wall, octagon towers"}, motor court, ${opts.rings ?? 1} ring${(opts.rings ?? 1) > 1 ? "s" : ""})`,
		ok: fr.runs + fr.structures > 0,
		note: `${fr.runs} runs, ${fr.structures} structures`
	});
	io.finishAll();
	yield "Finishing";
	const ring0 = outerRingOf(io.game());
	if (ring0) {
		stakeInside(io, steps, "Vegetable bed 1", "garden", ring0, P(dFace + 7, -7));
		stakeInside(io, steps, "Vegetable bed 2", "garden", ring0, P(dFace + 10.5, -7));
		if (stakeInside(io, steps, "Orchard", "orchard", ring0, P(dFace + 3, 3))) {
			const o = io.game().structures.filter((st) => st.kind === "orchard").at(-1);
			const n = orchardSiteNote(io.game(), o.x, o.z);
			if (n) notes.push(`Orchard: ${n}`);
		}
		stakeInside(io, steps, "Solar farm", "solar_farm", ring0, P(dFace + 7.5, 5));
		stakeInside(io, steps, "Battery container", "battery_bank", ring0, P(dFace + 7.5, 1.5));
		io.finishAll();
		yield "Finishing";
	}
	const g2 = io.game();
	const outer = g2.perimeter.filter((r) => r.kind === (concrete ? "concrete_wall" : "stone_wall")).sort((a, b) => b.pts.length - a.pts.length)[0];
	if (outer) {
		const e = io.razor(outer.id);
		steps.push({
			step: "Razor wire on the outer wall",
			ok: !e,
			note: e ?? void 0
		});
	}
	const wet = undrained(g2).sort((a, b) => (b.grade ?? 0) - (a.grade ?? 0))[0];
	const line = wet ? drainLineFor(g2, wet) : null;
	if (line) {
		const r = io.drawRun("drain_channel", line);
		steps.push({
			step: "Drainage channel above the cut",
			ok: typeof r === "string",
			at: line[0],
			note: typeof r === "string" ? void 0 : r.problem
		});
	} else steps.push({
		step: "Drainage channel",
		ok: false,
		note: wet ? "no contour line for it" : "no building on a cut slope to drain"
	});
	io.finishAll();
	yield "Finishing";
	const bought = [], refused = [];
	for (const k of [
		"suv",
		"suv",
		"old_pickup",
		"motorhome",
		"atv",
		"tractor"
	]) {
		const e = io.buyVehicle(k);
		if (!e) bought.push(k);
		else refused.push(`${k}: ${e}`);
	}
	steps.push({
		step: "Fleet for the court",
		ok: bought.length > 0,
		note: `bought ${bought.join(", ") || "nothing"}${refused.length ? "; refused " + refused.join("; ") : ""}`
	});
	return {
		steps,
		frame: {
			phi: io.fall,
			dFace,
			dEdge
		},
		notes
	};
}
function runMountainShowcase(io, opts = {}) {
	const g = mountainShowcaseSteps(io, opts);
	for (;;) {
		const r = g.next();
		if (r.done) return r.value;
	}
}
/**
* The north-star layout: the compound on the bench above the rock face (the terraces, the lodge on its walkout, the solar bench), the motor court and
* the camp on the shelf below it at the foot of the face, and a rock tunnel bored up through the hill from the court's portal to the compound's gate.
* The tunnel is the only way a truck gets up: a person cannot cross the face.
*/
function* benchShowcaseSteps(io, opts) {
	const steps = [], notes = [];
	const { P, slopeAt } = frameOf(io.camp, io.fall, io.ground);
	let dFace = -4, steepest = 0;
	for (let d = 0; d > -40; d -= .25) {
		const [x, z] = P(d, 0), sl = slopeAt(x, z);
		if (sl > steepest) {
			steepest = sl;
			dFace = d;
		}
	}
	if (steepest < .9) notes.push(`no rock face found uphill of the camp (steepest ground ${steepest.toFixed(2)})`);
	io.fund();
	yield "Surveying";
	const why = io.road();
	steps.push({
		step: "Access road (hookup)",
		ok: !why,
		note: why ?? void 0
	});
	yield "Access road";
	const bore = boreTo(io.game(), io.camp, 45);
	if (!bore) {
		steps.push({
			step: "Rock tunnel",
			ok: false,
			note: "no bore the land allows from the shelf up the face"
		});
		return {
			steps,
			frame: {
				phi: io.fall,
				dFace,
				dEdge: dFace
			},
			notes
		};
	}
	const lowFirst = bore.stats.ya <= bore.stats.yb, low = lowFirst ? bore.a : bore.b, high = lowFirst ? bore.b : bore.a;
	const home = io.game().site.home;
	const C = [Math.min(home.x1 - 12, Math.max(home.x0 + 12, high[0] + 6)), Math.min(home.z1 - 12, Math.max(home.z0 + 12, high[1] - 6))];
	notes.push(`rock tunnel: ${boreText(bore.stats)}, from (${low.map((v) => v.toFixed(1)).join(", ")}) up to (${high.map((v) => v.toFixed(1)).join(", ")}); the compound is centred on (${C.map((v) => v.toFixed(1)).join(", ")})`);
	const S = (kind, du, db, o = {}) => {
		const cf = Math.cos(io.fall), sf = Math.sin(io.fall), x = C[0] + du * cf - db * sf, z = C[1] + du * sf + db * cf, label = o.label ?? kind;
		let best = null;
		for (const rot of o.rots ?? [0]) {
			const sp = io.findSpot(kind, x, z, rot, o.radius ?? 12);
			if (sp) {
				const d = Math.hypot(sp[0] - x, sp[1] - z);
				if (!best || d < best.d) best = {
					sp,
					rot,
					d
				};
			}
		}
		if (!best) {
			steps.push({
				step: label,
				ok: false,
				at: [x, z],
				note: "no valid spot within reach (slope, water, another building, the road or the camp)"
			});
			return null;
		}
		if (!io.stake(kind, best.sp[0], best.sp[1], best.rot)) {
			steps.push({
				step: label,
				ok: false,
				at: best.sp,
				note: "the game refused the spot"
			});
			return null;
		}
		steps.push({
			step: label,
			ok: true,
			at: best.sp,
			note: best.d > .5 ? `${best.d.toFixed(1)} units from the wanted spot` : void 0
		});
		return {
			x: best.sp[0],
			z: best.sp[1],
			rot: best.rot
		};
	};
	S("lodge", -3, 0, {
		rots: [
			0,
			1,
			2,
			3
		],
		radius: 8,
		label: "Lodge (walkout basement)"
	});
	S("greenhouse_heated", 3, -7, { label: "Glass greenhouse" });
	S("bunker_hatch", 0, -3, { label: "Bunker hatch" });
	yield "Buildings";
	const terr = terraceSite(io.game());
	if (terr) {
		const spots = terr.tiers.map((t) => [t.x, t.z]);
		const err = io.stakeTerraces(spots);
		steps.push({
			step: "Terraced garden beds",
			ok: !err,
			at: spots[0],
			note: err ?? `${terr.tiers.length} beds on a ${terr.slopePct} % slope`
		});
	} else steps.push({
		step: "Terraced garden beds",
		ok: false,
		note: "terraceSite found no 10-26 % fall near the home"
	});
	const concrete = opts.wall === "concrete";
	yield "Terraces";
	const fr = io.fortify({
		scope: "core",
		shape: "irregular",
		wall: concrete ? "concrete_wall" : "stone_wall",
		towers: 5,
		towerKind: concrete ? "watchtower_hex" : "watchtower_octagon",
		passage: false,
		rings: opts.rings ?? 1,
		ringWall: "stone_wall",
		ringSally: true,
		motorCourt: false,
		gate: false
	}, C);
	steps.push({
		step: `Fortify my ring (${concrete ? "concrete wall, hexagon towers" : "stone wall, octagon towers"}, round the bench)`,
		ok: fr.runs + fr.structures > 0,
		note: `${fr.runs} runs, ${fr.structures} structures`
	});
	io.finishAll();
	yield "Finishing";
	const ring1 = outerRingOf(io.game());
	if (ring1) {
		const cf = Math.cos(io.fall), sf = Math.sin(io.fall), at = (du, db) => [C[0] + du * cf - db * sf, C[1] + du * sf + db * cf];
		stakeInside(io, steps, "Vegetable bed 1 (terrace)", "garden", ring1, at(2.5, -3), [0], 1.8);
		stakeInside(io, steps, "Vegetable bed 2 (terrace)", "garden", ring1, at(6, -3), [0], 1.8);
		stakeInside(io, steps, "Orchard", "orchard", ring1, at(4, 5), [0, 1], 1.2);
		stakeInside(io, steps, "Solar farm", "solar_farm", ring1, at(-3, 5), [0], 1.8);
		stakeInside(io, steps, "Battery container", "battery_bank", ring1, at(-3, 9), [0], 1.8);
		io.finishAll();
		yield "Finishing";
	}
	const outerRun = io.game().perimeter.filter((r) => r.kind === "stone_wall" || r.kind === "concrete_wall").sort((x, y) => y.pts.length - x.pts.length)[0];
	const wallPts = [];
	if (outerRun) for (let i = 1; i < outerRun.pts.length; i++) {
		const p0 = outerRun.pts[i - 1], p1 = outerRun.pts[i], n = Math.max(1, Math.ceil(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) * 2));
		for (let k = 0; k < n; k++) wallPts.push([p0[0] + (p1[0] - p0[0]) * k / n, p0[1] + (p1[1] - p0[1]) * k / n]);
	}
	const end = [...wallPts].sort((p, q) => Math.hypot(p[0] - high[0], p[1] - high[1]) - Math.hypot(q[0] - high[0], q[1] - high[1])).find((p) => Math.hypot(p[0] - high[0], p[1] - high[1]) < 3 && boreProblem({ h: io.ground }, low, p) === null) ?? high;
	const r = io.drawRun("rock_tunnel", [low, end]);
	steps.push({
		step: "Rock tunnel (court portal to the compound wall)",
		ok: typeof r === "string",
		at: low,
		note: typeof r === "string" ? `${boreText(bore.stats)}${end === high ? "; the high portal is not on the wall" : ""}` : r.problem
	});
	const L = Math.hypot(end[0] - low[0], end[1] - low[1]), inx = (end[0] - low[0]) / L, inz = (end[1] - low[1]) / L;
	const spot = courtSpot({
		x: low[0],
		z: low[1],
		inx,
		inz
	});
	let placed = false;
	for (const dr of [
		0,
		.4,
		-.4,
		.8,
		-.8
	]) {
		const sp = io.findSpot("motor_court", spot.x - dr * inz, spot.z + dr * inx, spot.rot, 3);
		if (sp && io.stake("motor_court", sp[0], sp[1], spot.rot)) {
			steps.push({
				step: "Motor court at the portal",
				ok: true,
				at: sp,
				note: dr ? `${Math.abs(dr).toFixed(1)} units sideways` : void 0
			});
			placed = true;
			break;
		}
	}
	if (!placed) steps.push({
		step: "Motor court at the portal",
		ok: false,
		at: [spot.x, spot.z],
		note: "no valid spot outside the portal"
	});
	io.finishAll();
	yield "Finishing";
	const g2 = io.game();
	const wet = undrained(g2).sort((x, y) => (y.grade ?? 0) - (x.grade ?? 0))[0];
	const line = wet ? drainLineFor(g2, wet) : null;
	if (line) {
		const d = io.drawRun("drain_channel", line);
		steps.push({
			step: "Drainage channel above the cut",
			ok: typeof d === "string",
			at: line[0],
			note: typeof d === "string" ? void 0 : d.problem
		});
	}
	io.finishAll();
	yield "Finishing";
	const bought = [], refused = [];
	for (const k of [
		"suv",
		"suv",
		"old_pickup",
		"motorhome",
		"atv",
		"tractor"
	]) {
		const e = io.buyVehicle(k);
		if (!e) bought.push(k);
		else refused.push(`${k}: ${e}`);
	}
	steps.push({
		step: "Fleet for the court",
		ok: bought.length > 0,
		note: `bought ${bought.join(", ") || "nothing"}${refused.length ? "; refused " + refused.join("; ") : ""}`
	});
	return {
		steps,
		frame: {
			phi: io.fall,
			dFace,
			dEdge: dFace
		},
		notes
	};
}
/** The solid stretches of a run (its gates cut out), as segments. */
function solidSegments(run) {
	const out = [];
	let acc = 0;
	const gates = [...run.gates].sort((a, b) => a.at - b.at);
	for (let i = 1; i < run.pts.length; i++) {
		const a = run.pts[i - 1], b = run.pts[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
		if (len < 1e-9) continue;
		let from = 0;
		for (const g of gates) {
			const g0 = g.at - g.w / 2 - acc, g1 = g.at + g.w / 2 - acc;
			if (g1 <= from || g0 >= len) continue;
			if (g0 > from) out.push([[a[0] + (b[0] - a[0]) * from / len, a[1] + (b[1] - a[1]) * from / len], [a[0] + (b[0] - a[0]) * g0 / len, a[1] + (b[1] - a[1]) * g0 / len]]);
			from = Math.max(from, g1);
		}
		if (from < len) out.push([[a[0] + (b[0] - a[0]) * from / len, a[1] + (b[1] - a[1]) * from / len], b]);
		acc += len;
	}
	return out;
}
/** Does the segment a-b pass through the rect (shrunk by `m` on every side)? */
function segHitsRect(a, b, r, m = 0) {
	const x0 = r.x0 + m, x1 = r.x1 - m, z0 = r.z0 + m, z1 = r.z1 - m;
	if (x1 <= x0 || z1 <= z0) return false;
	const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(2, Math.ceil(L / .1));
	for (let k = 0; k <= n; k++) {
		const x = a[0] + (b[0] - a[0]) * k / n, z = a[1] + (b[1] - a[1]) * k / n;
		if (x > x0 && x < x1 && z > z0 && z < z1) return true;
	}
	return false;
}
var rectsOverlap = (a, b, m = 0) => a.x0 < b.x1 - m && a.x1 > b.x0 + m && a.z0 < b.z1 - m && a.z1 > b.z0 + m;
/** Ground slope (rise over run) at a point. */
var slopeOf = (ground, x, z) => (Math.abs(ground(x + .25, z) - ground(x - .25, z)) + Math.abs(ground(x, z + .25) - ground(x, z - .25))) / .5;
/** The wall kinds that stop a person (not patrol decks, not the pipes and channels). */
var solid = (g) => g.perimeter.filter((r) => PERIMETER[r.kind].blocks.people >= .5 && !PERIMETER[r.kind].walkway && !PERIMETER[r.kind].wallTop && r.kind !== "creek_bars" && r.pts.length > 2);
/**
* What does not fit: a wall through a building, buildings on each other, graded pads over each other at different levels, a wall set into the rock face,
* a wall across the drive with no gate. Each problem names the two things that clash. `drive` is the access road (road end first).
*/
function integrationProblems(g, drive, ground) {
	const out = [];
	const surface = g.structures.filter((st) => !st.unplaced && KIT[st.kind] && KIT[st.kind].level !== "underground");
	const fp = (st) => footprint(KIT[st.kind], st.x, st.z, st.rot);
	for (let i = 0; i < surface.length; i++) for (let j = i + 1; j < surface.length; j++) {
		const a = surface[i], b = surface[j];
		if (rectsOverlap(fp(a), fp(b), .15)) out.push({
			what: "buildings overlap",
			detail: `${a.kind} ${a.id} and ${b.kind} ${b.id}`
		});
	}
	if (ground) {
		const pads = surface.filter((st) => (st.grade ?? 0) > 0).map((st) => ({
			st,
			p: planPad(fp(st), ground, surface.filter((o) => o !== st).map(fp))
		})).filter((x) => x.p.runs.length);
		for (let i = 0; i < pads.length; i++) for (let j = i + 1; j < pads.length; j++) {
			const a = pads[i], b = pads[j];
			if (rectsOverlap(a.p.rect, b.p.rect, .05) && Math.abs(a.p.y - b.p.y) > .04) out.push({
				what: "graded pads overlap at different levels",
				detail: `${a.st.kind} ${a.st.id} (${a.p.y.toFixed(2)}) and ${b.st.kind} ${b.st.id} (${b.p.y.toFixed(2)})`
			});
		}
	}
	const walls = solid(g);
	for (const r of walls) {
		const segs = solidSegments(r);
		for (const st of surface) {
			if (st.kind === "gate_garage" || st.kind === "motor_court" || st.kind.startsWith("watchtower") || st.kind === "rise_lookout") continue;
			for (const [a, b] of segs) if (segHitsRect(a, b, fp(st), .1)) {
				out.push({
					what: "wall runs through a building",
					detail: `${r.kind} ${r.id} through ${st.kind} ${st.id}`
				});
				break;
			}
		}
		for (const st of surface.filter((s) => s.kind === "motor_court")) for (const [a, b] of segs) if (segHitsRect(a, b, fp(st), .15)) {
			out.push({
				what: "wall runs through the motor court",
				detail: `${r.kind} ${r.id} through court ${st.id}`
			});
			break;
		}
	}
	if (ground) for (const r of walls) {
		let n = 0, at = null;
		for (const [a, b] of solidSegments(r)) {
			const L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(L / .25));
			for (let q = 0; q <= k; q++) {
				const x = a[0] + (b[0] - a[0]) * q / k, z = a[1] + (b[1] - a[1]) * q / k;
				if (slopeOf(ground, x, z) > 2) {
					n++;
					at = at ?? [x, z];
				}
			}
		}
		if (n > 8) out.push({
			what: "wall stands on the rock face",
			detail: `${r.kind} ${r.id}: ${n} samples on ground steeper than 200 % (a cliff, not a riser) near (${at[0].toFixed(1)}, ${at[1].toFixed(1)})`
		});
	}
	for (const u of ungatedCrossings(g, drive)) out.push({
		what: "the drive crosses a wall with no gate",
		detail: JSON.stringify(u)
	});
	return out;
}
//#endregion
//#region src/game/showcase.ts
function showcaseIO(ctx) {
	const G = ctx.game, w = ctx.world;
	return {
		game: () => G.getState().game,
		ground: (x, z) => w.parcel.natural(x, z).h,
		camp: [w.camp.x, w.camp.z],
		fall: w.parcel.lot?.fall ?? 0,
		findSpot: (kind, x, z, rot, r) => ctx.tool.findSpot(kind, x, z, rot, r),
		stake: (kind, x, z, rot) => {
			const before = G.getState().game.structures.length;
			ctx.tool.setKind(kind);
			ctx.tool.hoverAt(x, z, rot);
			ctx.tool.placeHere();
			ctx.tool.setKind(null);
			ctx.store.getState().setUnderground(false);
			return G.getState().game.structures.length > before;
		},
		stakeTerraces: (spots) => G.getState().stakeTerraces(spots),
		fortify: (opts, center) => G.getState().fortifyRing({
			...ctx.store.getState().siteGeo ?? {},
			...center ? { center } : {}
		}, opts),
		razor: (id) => G.getState().addRazor(id),
		drawRun: (kind, pts) => {
			const before = G.getState().game.perimeter.length;
			ctx.fence.setKind(kind);
			for (const p of pts) ctx.fence.addPoint(p[0], p[1]);
			ctx.fence.finish();
			ctx.fence.setKind(null);
			const runs = G.getState().game.perimeter;
			return runs.length > before ? runs[runs.length - 1].id : { problem: ctx.game.getState().toolProblem ?? "the tool laid nothing" };
		},
		road: () => {
			const why = G.getState().hookup("drive");
			if (!why) {
				G.getState().advance(200);
				G.setState((s) => {
					const g = structuredClone(s.game);
					g.structures = [];
					g.clock.speed = 0;
					return { game: g };
				});
			}
			return why;
		},
		fund: () => G.setState((s) => {
			const g = structuredClone(s.game);
			g.money += 15e5;
			for (const k of Object.keys(g.stock)) g.stock[k] = Math.max(g.stock[k], 400);
			g.clock.speed = 0;
			g.clock.t = 850.4;
			g.clock.ticks = Math.round(g.clock.t / (.25 / 24));
			return { game: g };
		}),
		buyVehicle: (kind) => G.getState().money((g) => buyVehicle(g, kind)),
		finishAll: () => G.setState((s) => {
			const g = structuredClone(s.game);
			for (const r of g.perimeter) {
				r.done = r.hours;
				r.supplied = true;
				r.finishedAt = 0;
			}
			for (const st of g.structures) {
				st.stage = 99;
				st.done = 0;
				st.supplied = true;
				st.finishedAt = 0;
				st.permit = "ok";
			}
			g.utilities.lit = ["x"];
			return { game: g };
		})
	};
}
function buildMountainShowcase(ctx, opts = {}) {
	const io = showcaseIO(ctx), w = ctx.world;
	return {
		...w.bulk(() => runMountainShowcase(io, opts)),
		problems: integrationProblems(ctx.game.getState().game, w.access.drive, io.ground)
	};
}
/**
* The same script, time-sliced: it hands the main thread back to the browser (`pause`, which also moves the loading screen) at each step, so a
* slow machine paints and answers input instead of freezing for the seconds the script takes. Same result as the synchronous one (tested in sim/showcase.test.ts).
*/
async function buildMountainShowcaseAsync(ctx, opts, pause) {
	const io = showcaseIO(ctx), w = ctx.world;
	const gen = mountainShowcaseSteps(io, opts);
	let n = 0, rep;
	w.bulkBegin();
	try {
		for (;;) {
			const r = gen.next();
			if (r.done) {
				rep = r.value;
				break;
			}
			await pause(r.value, ++n);
		}
	} finally {
		w.bulkEnd();
	}
	return {
		...rep,
		problems: integrationProblems(ctx.game.getState().game, w.access.drive, io.ground)
	};
}
//#endregion
export { buildMountainShowcase, buildMountainShowcaseAsync };
