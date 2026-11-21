# Arcology security and sealing (design note, 2026-11-21)

Goal (owner): no enemy can get into a closed arcology, and it is airtight against weather, fallout and full submersion while closed. This note says what the
game draws and models today, and lists what is NOT modeled in rules so the owner can decide.

## Layers of defense (outside in)

1. **Approach.** One county road ends at the apron; the road re-plan keeps the last stretch straight (`vehiclePort.ts`, `approachRoute`). Nothing else leads to the dome.
2. **Apron.** Poured concrete, anti-ram bollards across its mouth (12 on the arcology), a camera mast, floodlights and a gatehouse that watches the apron.
3. **Entrance module.** ONE module: the person airlock and the vehicle sally port are two parallel chambers sharing a party wall, one roofline, one housing. One entrance
   for a raid (`entrancesOf`). The arcology has no second entrance; the escape tunnel is its sealed, egress-only emergency exit.
4. **Interlocks.** Every chamber has an outer and an inner door that are never open together (state lamps: red sealed, amber cycling, green open; locking bars on the leaves).
   The person chamber and the port chamber never connect to each other.
5. **Inner lane.** A poured lane from the inner gate to a pad, kept clear of props.

## Penetrations of the shell and how each is sealed

| Penetration | Where | Sealing (drawn) | In the rules? |
|---|---|---|---|
| Filtered intake | inside the armored, roofed plant yard | armored stack, two filter canisters, locked hatch, status lamp, armored duct to a flanged collar on the shell | air quality only (`sim/dome/intake.ts`); no valve rule |
| Exhaust | plant yard | same yard; not separately drawn | no |
| Power and water feeds, data conduit | buried sleeves under the footing | sealed sleeves (underground view only) | no isolation rule |
| Person airlock, sally port | entrance module | two-door chambers on interlocks | yes: sally hold, airlock cycle |
| Link airlocks | dedicated chambers | same two-door chamber look | yes (links) |
| Escape tunnel hatch | tunnel | not drawn as egress-only | partly |
| Roof hatches | none on the arcology (removed) | n/a | n/a |

The plant yard is armored and roofed: armored walls as tall as the plant, a closed roof, no gate; it is entered only from inside through its own service airlock.
The shell base is continuous: a concrete foundation ring, an armored base ring and, for the arcology, a bolted anchor flange ring round the foot.

## Not modeled in rules yet (needs an owner decision, not invented here)

- Flood and submersion: the anchor flange is a look only. There is no ballast, buoyancy or flood rule.
- Penetration isolation: no isolation-valve state for intake, exhaust, feeds or conduit; a penetration cannot fail or be closed on a command.
- Kill zone: no rule clears vegetation within about 40 ft of the shell base or the apron, and the world's shrubs still grow close to the dome in screenshots.
- Vehicle barrier at the road's end beyond the apron bollards, and camera and floodlight coverage as a detection rule.
- Escape tunnel hatch as an interlocked, egress-only exit.
