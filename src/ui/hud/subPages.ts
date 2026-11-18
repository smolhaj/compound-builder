/**
 * Layout A sub-pages (docs/UX_AUDIT.md 11.2 and 11.6): a long drawer shows one page at a time, picked with a row of chips under
 * the title, so no drawer is one long scroll. Pure: which pages each drawer has and which one shows. The panel bodies are the
 * Classic ones; each section sits in a `<Page id>` (ui/hud/SubPages.tsx), so a section is never lost, only filed.
 */
import type { DrawerId } from './drawerRegistry';

export interface PageDef { id: string; label: string; /** One line for the chip's hover card. */ blurb: string }

export const PAGES: Partial<Record<DrawerId, readonly PageDef[]>> = {
  family: [
    { id: 'people', label: 'People', blurb: 'Everyone on the place: health, morale, who is doing what' },
    { id: 'medical', label: 'Medical', blurb: 'Injuries, illness, medicine and household supplies' },
    { id: 'work', label: 'Work and money', blurb: 'Jobs, wages, the household budget' },
    { id: 'daily', label: 'Daily', blurb: 'The day plan and who does which duty' },
    { id: 'home', label: 'Home', blurb: 'Housing, quarters and the house rules' },
    { id: 'kin', label: 'Kin & guests', blurb: 'Relatives, newcomers, the weekend household' },
    { id: 'dogs', label: 'Dogs', blurb: 'The dogs and their posts' },
    { id: 'classes', label: 'Classes', blurb: 'Lessons and drills' },
  ],
  supplies: [
    { id: 'stores', label: 'Stores', blurb: 'Food, the stockpile, tools and orders' },
    { id: 'keeping', label: 'Keeping & wild', blurb: 'Keeping the pantry, hunting and fishing, wildlife on the land' },
    { id: 'season', label: 'Season', blurb: 'What is on the farm calendar now' },
    { id: 'fields', label: 'Fields', blurb: 'Fields, seed, soil and gardens' },
    { id: 'kitchen', label: 'Kitchen', blurb: 'Preserving, storage, soap and the table' },
    { id: 'animals', label: 'Animals', blurb: 'The barnyard, bees, the sugar bush, greenhouses and orchards' },
    { id: 'plan', label: 'Food plan', blurb: 'Stores in days, a year of food, spoilage, what to do' },
  ],
  utilities: [
    { id: 'heat', label: 'Heat', blurb: 'Firewood, the chimney' },
    { id: 'power', label: 'Power', blurb: 'Grid, solar, batteries, the generator' },
    { id: 'water', label: 'Water', blurb: 'Wells, storage, what ran short' },
    { id: 'vehicles', label: 'Vehicles', blurb: 'Vehicles and the garage' },
    { id: 'dome', label: 'Dome', blurb: 'Lockdown, the air clock, filtering, the closed ecology, the dome\'s own climate' },
  ],
  land: [
    { id: 'place', label: 'The place', blurb: 'Acreage, region, the way in, services' },
    { id: 'paperwork', label: 'Paperwork', blurb: 'Taxes, permits, fines' },
    { id: 'next', label: 'Next door', blurb: 'Parcels you can buy' },
  ],
  defense: [
    { id: 'score', label: 'Score', blurb: 'How hard the place is to take, and how early you would know' },
    { id: 'staff', label: 'Staff & reputation', blurb: 'Guards, armed response, the road’s read of you, light discipline' },
    { id: 'walls', label: 'Walls & towers', blurb: 'The property line, upgrades, wall tops, gates, towers, floodlights' },
    { id: 'ground', label: 'Ground', blurb: 'Terrain, tunnels, digging, the way in, linked yards' },
    { id: 'houses', label: 'Houses', blurb: 'Hardening and cover for each house' },
    { id: 'road', label: 'Road', blurb: 'What shows from the road, what people say, the roadblock' },
    { id: 'checks', label: 'Checks', blurb: 'Watching, fighting, shelter and catastrophe readiness' },
  ],
  outside: [
    { id: 'world', label: 'The world', blurb: 'What was taken, scavenging, the outside world' },
    { id: 'neighbors', label: 'Neighbors', blurb: 'Neighbors, the market, trade' },
    { id: 'security', label: 'Security', blurb: 'Prisoners, mines, how exposed you are' },
    { id: 'camps', label: 'Camps', blurb: 'People camped outside the wall on trial' },
  ],
  chronicle: [
    { id: 'family', label: 'Family', blurb: 'The family over the years, the generations' },
    { id: 'eras', label: 'Eras & milestones', blurb: 'Eras lived through and milestones reached' },
    { id: 'album', label: 'Album', blurb: 'Photos' },
    { id: 'chronicle', label: 'Chronicle', blurb: 'Births, deaths, weddings, the eras' },
  ],
  board: [
    { id: 'status', label: 'Status', blurb: 'The vitals, days with no resupply, the wave, threats, what waits on you' },
    { id: 'feed', label: 'What’s different', blurb: 'Today’s true changes since the hit' },
    { id: 'radio', label: 'Radio', blurb: 'What you heard, whether it checked out, who can go and see' },
    { id: 'log', label: 'Log', blurb: 'The latest events on the place' },
  ],
};

export const pagesOf = (d: DrawerId): readonly PageDef[] => PAGES[d] ?? [];
export const hasPages = (d: DrawerId): boolean => pagesOf(d).length > 0;

/**
 * The page to show: the one the player picked if it exists (and has something in it), else the first page that has something,
 * else the first. `nonEmpty` is the set of pages that rendered content (omit it to trust the list).
 */
export function pickPage(d: DrawerId, saved: string | undefined, nonEmpty?: ReadonlySet<string>): string | null {
  const defs = pagesOf(d);
  if (!defs.length) return null;
  const ok = (id: string) => !nonEmpty || nonEmpty.has(id);
  if (saved && defs.some(p => p.id === saved) && ok(saved)) return saved;
  return (defs.find(p => ok(p.id)) ?? defs[0]).id;
}

/** The pages worth a chip: those with something in them (the pages the player picked are kept even if empty so the row does not jump). */
export function visiblePages(d: DrawerId, nonEmpty: ReadonlySet<string> | null): readonly PageDef[] {
  const defs = pagesOf(d);
  return nonEmpty ? defs.filter(p => nonEmpty.has(p.id)) : defs;
}
