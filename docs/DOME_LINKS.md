# Dome links: tunnels and walkways between domes

Owner request (2026-11-19): when a property has more than one dome, people travel between them through an underground tunnel, an above-ground enclosed walkway, or both, instead of walking across open ground. A single big dome works exactly as before (the panel section only appears with two domes or an existing link). Units are US feet and dollars; the sim keeps world units (1 unit is about 20 ft).

## Rules

1. **A link** joins two domes (any tiers), or a dome and another finished building or a walled yard. Kinds: **underground tunnel**, **above-ground walkway**, or **both**, which is two separate links, each with its own cost and effect. One link of each kind per pair.
2. **Link airlocks.** Each link end on a dome is a dedicated airlock on the shell (`Airlock.role = 'link'`), never one of the person airlocks and never the plant's service airlock. It faces the partner dome and slides along the shell until it is at least 0.3 radian from every other airlock. Each end adds an airlock cycle (`AIRLOCK_CYCLE_S` of that tier) to a trip when its dome is sealed. A building or yard end is a plain door or hatch.
3. **Tunnel.** Hidden, safe from the surface, priced per foot (the run's own culvert and excavator bill, plus lighting, cable, vent and pipe, plus shoring that grows with depth), slower to build (hours grow 2.5 percent per foot of depth). Depth is chosen from 8 ft down to the shallower dome's skirt depth (earthen 4, geodesic 20, glass 30, arcology 60). A plain crew digs 6 to 14 ft and a crew that has learned the place about 12 ft deeper, so `tunnelReach(depth, adapt)` is the skirt rule turned round: a tunnel at 18 ft or more is out of a plain crew's reach, at 30 ft or more out of anyone's. It can collapse (a charge, a flood, or on purpose) and takes a contractor to clear.
4. **Walkway.** Visible, cheaper, faster, an enclosed glazed steel run the wall model already treats as a wall (`covered_walkway`), so a raid sees it as part of one ring that includes both domes. Exposed to snow load, wind, hail, fire and ramming (`WALK_STORM`); refused across the creek or a moat without a bridge; a slope up to 4 percent rides on the ground, up to 12 percent on piers, steeper is refused.
5. **Both** is redundancy: if one is cut or collapsed the other still carries travel, supplies and the plants' shared feeder.
6. **Travel.** An open link makes a trip between two domes covered, not exposed (`tripExposed`). People, animals and carts use either; vehicles use the tunnel only. A link that is down isolates the dome as before.
6b. **Walking.** In the 3D world a walk from inside one dome to inside a linked dome goes through the open link (`HomesteadWorld._viaDomeLink`, `routeViaLink`): to the inner airlock, along the deck (a walkway at 1.6 ft, a tunnel under the terrain), out of the far airlock. The shorter open link is taken; a link that is down is not.
7. **Ring and watch.** Domes joined by an open link are one ring (`ringOf`): towers by either dome count for both (`towersCovering`).
8. **Feeder (PROPOSED).** An open dome-to-dome link carries a feeder: a weaker plant's climate, scrubbing and water shares are lifted by half of the shortfall, up to the partner's own share (`supplemented`, never lowers, never above 1).
9. **Build.** A link is laid out as an ordinary run (the family builds it, materials from the stockpile) plus a contractor fit-out paid now. Stages follow the dome dig: tunnel (excavate the trench, lay the lining, backfill) and walkway (footings, frame, glazing).
10. **Maintenance.** Wear 0.09 percent a day for a walkway, 0.02 percent for a tunnel; a storm on a worn walkway is likelier to down it. A repair is 18 percent of the fit-out and five days, a collapse 40 percent and nine.

## Tunnelers (owner addition, 2026-11-19)

A learned crew must not simply win against a shallow link.

- A dig can target an open tunnel the crew can reach (`diggable`). Those who cannot reach its depth turn back, as at a skirt.
- **Detection** uses the existing ground sensors, dogs, watch and towers (`detectChances`). A found dig raises an alert card ("Radio: ...") with the dig position (feet out along the tunnel from a named airlock), the days and hours to the breach, and which counter noticed it.
- **Answers on the card:** *send the defenders out and hold position* at the breach (the warning is the surprise), *send them out and fall back to the airlock* (a smaller crew arrives one door at a time, no surprise), *collapse the tunnel on the crew* (costs the link), *seal the airlock and let them come* (the door's own odds against a satchel, by tier), or ignore it.
- **Outcomes:** the crew driven off; a standoff (the link is shut for repair); a partial breach (an airlock forced or a section collapsed); defenders lost (`classify`). The fight is the battle sim's tunneling scene (`planBattle`, kind `tunnelers`). The card shows the odds for both orders and a one-word edge (`counterEdge`: more defenders, guards, towers, ammunition, cover, sensors or warning never lowers it).

## PROPOSED (not in the GDS or earlier decisions; the owner can cut any of these)

Link distances and caps (30 ft minimum, 1,200 ft walkway, 2,400 ft tunnel); the depth range; the pricing table `LINK`; the storm table; the feeder rule and its 0.5 factor; vehicles only in tunnels; the fall-back crew factor (0.7); the `counterEdge` formula; `standoff` closing the link; the radio line wording.

## Where

`sim/dome/linkGraph.ts` (types, graph), `links.ts` (quote, order, weather, collapse, travel, ring, feeder), `linkDefense.ts` (the dig answers), `standing.ts` (link airlocks), `tunnelers.ts` (dig target and day), `compounds.ts` (covered trips, no false hatches), `plantLive.ts` (feeder), `ui/hud/DomeLinksSection.tsx`, `ui/GateCard.tsx`, `game/fx/DomeLinks.ts`. Save v104 adds optional `domeLinks` (and `Dig.link`).
