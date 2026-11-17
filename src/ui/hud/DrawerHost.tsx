/** Layout A drawer chrome (docs/UX_AUDIT.md 11.2): the title row of the one visible drawer. The frame and hotkeys are in drawerHooks.ts. */
import { useDrawerStore } from '../../store/drawerStore';
import { drawerDef, type DrawerId } from './drawerRegistry';
import { T, tv } from './tokens';

export function DrawerHeader({ id }: { id: DrawerId }) {
  const close = useDrawerStore(s => s.close);
  const d = drawerDef(id);
  return <div data-testid={`drawer-head-${id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '-2px -2px 8px', paddingBottom: 6, borderBottom: `1px solid ${T.color.line}` }}>
    <span style={{ fontSize: tv.font('title'), fontWeight: T.weight.semi }}>{d.title}</span>
    <span style={{ color: tv.color('dim'), fontSize: tv.font('fine') }}>{d.key}</span>
    <button type="button" data-testid="drawer-close" aria-label={`Close ${d.title} (Esc)`} title="Close (Esc)" onClick={close}
      style={{ marginLeft: 'auto', width: 28, height: 28, border: 0, borderRadius: tv.radius('control'), background: tv.color('control'), color: tv.color('text'), cursor: 'pointer', fontSize: 14, lineHeight: 1, font: 'inherit' }}>✕</button>
  </div>;
}

