/** The Farm views, as Supplies sub-pages in layout A (the Classic Farm tab shows them under its own small tab strip). */
export type FarmView = 'season' | 'fields' | 'kitchen' | 'animals' | 'plan';
export const FARM_VIEWS: ReadonlySet<string> = new Set<FarmView>(['season', 'fields', 'kitchen', 'animals', 'plan']);
