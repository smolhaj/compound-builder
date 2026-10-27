/**
 * Family → Dogs: each dog is a named member of the family (sim/pets.ts). A
 * card per dog: how it is, who it loves, who looks after it (Auto or a
 * person), the care buttons (each does the chore right now, as its person)
 * and whether it guards a post or stays inside.
 */
import type { CSSProperties, ReactNode } from 'react';
import { useGameStore } from '../store/gameStore';
import { dayIndex, type GameState } from '../sim/state';
import {
  ageText, allDogs, bondOf, careHours, careNow, COATS, coatName, dogWatch, findHomes, giveTreat, livingDogs, neuterDog, rehomeDog, setAutoCare, setCaretaker, setGuard, stageOf, temperOf,
  TRAIT_TEXT, vetNeed, type Dog, type PetDuty, type Temper,
} from '../sim/pets';

const DIM = 'rgba(238,238,238,0.6)', LINE = 'rgba(255,255,255,0.08)';
const TONE = { good: '#a8d080', warn: '#f0c070', bad: '#f08060' } as const;
const btn = (on = false, off = false): CSSProperties => ({ padding: '3px 7px', borderRadius: 6, border: 0, cursor: off ? 'not-allowed' : 'pointer', background: on ? '#d8c9a0' : '#3a3d34', color: on ? '#1c1d18' : '#eee', fontSize: 11.5, opacity: off ? 0.5 : 1 });
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const MOOD: Record<Temper, [string, keyof typeof TONE | null]> = { happy: ['happy', 'good'], content: ['content', null], restless: ['restless', 'warn'], withdrawn: ['withdrawn', 'bad'], aggressive: ['snappish', 'bad'] };

function Bar({ label, v, color, title }: { label: string; v: number; color: string; title: string }) {
  return <div title={title} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, marginTop: 2 }}>
    <span style={{ color: DIM, width: 40 }}>{label}</span>
    <div style={{ flex: 1, height: 4, background: '#333', borderRadius: 2 }}><div style={{ width: `${Math.max(0, Math.min(100, v))}%`, height: '100%', background: color, borderRadius: 2 }} /></div>
  </div>;
}

function DogCard({ game, d }: { game: GameState; d: Dog }) {
  const money = useGameStore(s => s.money);
  const day = dayIndex(game.clock.t);
  const b = bondOf(d), who = b.id ? game.people.find(p => p.id === b.id) : null;
  const t = temperOf(d), [moodWord, moodTone] = MOOD[t];
  const need = vetNeed(d, day);
  const carers = game.people.filter((p, i) => p.age >= 6 && game.personState[i]?.needs.died == null && !game.personState[i]?.needs.taken);
  const doit = (duty: PetDuty) => money(g => careNow(g, d.id, duty));
  const coat = COATS[d.breed][d.tone % 3];
  const hungry = d.hunger > 60, st = stageOf(d, day);
  const bad = hungry || d.thirst > 60 || d.health < 40;
  return <div style={{ padding: '6px 0', borderBottom: `1px solid ${LINE}` }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
      <span title={TRAIT_TEXT[d.trait]}><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 5, background: hex(coat.body), border: `2px solid ${hex(coat.trim)}`, marginRight: 6, verticalAlign: -1 }} /><b>{d.name}</b></span>
      <span style={{ color: moodTone ? TONE[moodTone] : DIM }}>{moodWord}</span>
    </div>
    <div style={{ color: DIM, fontSize: 11 }}>{coatName(d)} {d.breed}, {d.sex === 'f' ? 'female' : 'male'}, {ageText(d, day)}{st === 'puppy' ? ' (puppy)' : st === 'old' ? ' (old)' : ''} · {d.trait}{d.fixed ? ' · fixed' : ''}{d.due != null ? ' · expecting' : ''}</div>
    <Bar label="fed" v={100 - d.hunger} color={hungry ? TONE.bad : '#9cc070'} title={`Hunger ${Math.round(d.hunger)}: it eats real food from the pantry`} />
    <Bar label="health" v={d.health} color={d.health > 60 ? '#9cc070' : d.health > 30 ? '#e0b050' : '#e06a50'} title={`Health ${Math.round(d.health)}`} />
    <Bar label="mood" v={d.mood} color="#7aa0d0" title={`Mood ${Math.round(d.mood)}`} />
    <Bar label="bond" v={b.v} color="#d09ab0" title={who ? `Closest to ${who.first}` : 'Not close to anyone yet'} />
    <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{who ? `${who.first}'s dog (bond ${Math.round(b.v)})` : 'Does not have a person yet: walk it, play with it.'} · trained {Math.round(d.training)}%</div>
    {(bad || need || d.thirst > 60) && <div style={{ fontSize: 11, color: bad ? TONE.bad : TONE.warn, marginTop: 2 }}>{[hungry ? 'hungry' : '', d.thirst > 60 ? 'thirsty' : '', d.health < 40 ? 'unwell' : '', need ? `vet: ${need}` : ''].filter(Boolean).join(' · ')}</div>}
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 11 }}>
      <span style={{ color: DIM }}>Looked after by</span>
      <select value={d.caretaker ?? ''} onChange={e => money(g => setCaretaker(g, d.id, e.target.value || null))} style={{ background: '#2a2d26', color: '#eee', border: `1px solid ${LINE}`, borderRadius: 4, fontSize: 11, padding: '1px 3px', flex: 1 }}>
        <option value="">Auto (whoever is free)</option>
        {carers.map(p => <option key={p.id} value={p.id}>{p.first}{p.kid ? ` (${p.age})` : ''}</option>)}
      </select>
    </div>
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
      <button style={btn()} title="A meal from the pantry now" onClick={() => doit('feed')}>Feed</button>
      <button style={btn()} title="A treat: a little food and a lot of love" onClick={() => money(g => giveTreat(g, d.id))}>Treat</button>
      <button style={btn()} title="A walk: exercise and bonding" onClick={() => doit('walk')}>Walk</button>
      <button style={btn()} title="Fetch and tug" onClick={() => doit('play')}>Play</button>
      <button style={btn()} title="Training makes a better guard and a happier dog" onClick={() => doit('train')}>Train</button>
      <button style={btn(!!need)} title={need ? `Vaccines, worming, treatment: ${need}` : 'Nothing needed now'} onClick={() => doit('vet')}>Vet</button>
    </div>
    <div style={{ display: 'flex', gap: 4, marginTop: 4, alignItems: 'center' }}>
      <button style={btn(d.guard)} title={d.guard ? 'Guards a post at the line: warns, deters, and can be hurt in a fight. Click to keep it inside.' : 'Kept inside with the family: warns but is safe. Click to put it on guard.'} onClick={() => money(g => setGuard(g, d.id, !d.guard))}>{d.guard ? 'On guard' : 'Stays inside'}</button>
      {!d.fixed && <button style={{ ...btn(), opacity: 0.7 }} title="Spay / neuter at the vet (no puppies)" onClick={() => money(g => neuterDog(g, d.id))}>Fix</button>}
      {st === 'puppy' && <button style={{ ...btn(), opacity: 0.7 }} title="Find the puppy a good home with the neighbors (a little goodwill; the children will miss it)" onClick={() => money(g => findHomes(g, d.id))}>Find a home</button>}
      <button style={{ ...btn(), opacity: 0.7 }} title="Find it another home. Everyone will miss it." onClick={() => { if (window.confirm(`Give ${d.name} away? The family will grieve.`)) money(g => rehomeDog(g, d.id)); }}>Rehome</button>
    </div>
  </div>;
}

export function DogsPanel({ game }: { game: GameState }): ReactNode {
  const money = useGameStore(s => s.money);
  const openShop = useGameStore(s => s.openShop);
  const dogs = livingDogs(game);
  const L = game.petLife;
  const grieving = Object.entries(L?.grief ?? {}).filter(([, v]) => v > 12);
  const kibbleDays = dogs.length ? Math.floor((game.stock.kibble ?? 0) * 63000 / Math.max(1, dogs.length * 1000)) : 0;
  const hours = Math.round(careHours(game) * 10) / 10;
  const w = dogWatch(game);
  const h3: CSSProperties = { margin: '0 0 4px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, opacity: 0.65, fontWeight: 600 };
  if (!allDogs(game).length) return <div style={{ marginBottom: 10 }}>
    <div style={h3}>Dogs</div>
    <div style={{ color: DIM, fontSize: 11.5, lineHeight: 1.5 }}>No dogs. A dog is family: it needs feeding, walking, vet care and love, and it warns you of trouble at the gate.</div>
    <button style={{ ...btn(), marginTop: 4 }} onClick={() => openShop(true)}>Find a dog in the shop</button>
  </div>;
  return <div style={{ marginBottom: 10 }}>
    <div style={h3}>Dogs ({dogs.length})</div>
    {dogs.length > 0 && <div style={{ fontSize: 11, color: DIM, display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center' }}>
      <span title="Person-hours a day to feed, water, walk, play with, train and doctor the dogs">Care: {hours} h/day · {w.onPost} on guard</span>
      <button style={btn(L?.auto ?? true)} title="On: the house shares out the dog chores by itself. Off: only dogs with a named caretaker are looked after; use the buttons." onClick={() => money(g => { setAutoCare(g, !(g.petLife?.auto ?? true)); return null; })}>{(L?.auto ?? true) ? 'Auto-care on' : 'Auto-care off'}</button>
    </div>}
    {dogs.length > 0 && <div style={{ fontSize: 11, color: kibbleDays < 10 && game.disaster.tracks.stores < 0.5 ? TONE.warn : DIM }}>Dog food: {game.disaster.tracks.stores >= 0.5 ? 'comes with the groceries' : `${game.stock.kibble > 0.01 ? `${kibbleDays} days of kibble, then ` : ''}the family's own food`}</div>}
    {L?.report && L.report.tasks.some(t => !t.who) && <div style={{ fontSize: 11, color: TONE.warn }}>Left undone yesterday: {[...new Set(L.report.tasks.filter(t => !t.who).map(t => `${game.dogs.find(d => d.id === t.dog)?.name ?? '?'} (${t.duty})`))].slice(0, 4).join(', ')}. Not enough hours in the day.</div>}
    {dogs.map(d => <DogCard key={d.id} game={game} d={d} />)}
    {grieving.length > 0 && <div style={{ fontSize: 11, color: TONE.warn, marginTop: 4 }}>Grieving for {L!.lost[0]?.name ?? 'a lost dog'}: {grieving.map(([id]) => game.people.find(p => p.id === id)?.first).filter(Boolean).join(', ')}.</div>}
    {(L?.lost.length ?? 0) > 0 && <div style={{ fontSize: 11, color: DIM, marginTop: 3 }}>Remembered: {L!.lost.slice(0, 4).map(l => `${l.name} (${l.cause})`).join(' · ')}</div>}
  </div>;
}
