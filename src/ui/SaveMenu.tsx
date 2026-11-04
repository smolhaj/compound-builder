import { useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { exportJson } from '../sim/save/migrations';
import { readSaveFile, saveFileName } from '../sim/save/saveFile';
import { saveGame, AUTOSAVE } from '../sim/save/saveSystem';
import type { GameState } from '../sim/state';
import { DIM, LINE, TONE, btn, panel } from './hud/style';

/** Top-bar "Save" button: a small menu with Export save / Import save (a one-line message on a bad file, a confirm before replacing). */
export function SaveMenu() {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<GameState | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const close = () => { setOpen(false); setMsg(null); setIncoming(null); };

  const doExport = () => {
    const game = useGameStore.getState().game;
    const url = URL.createObjectURL(new Blob([exportJson(game)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = saveFileName(game); a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    close();
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const r = readSaveFile(await f.text(), f.size);
    if (r.ok) { setMsg(null); setIncoming(r.state); } else { setIncoming(null); setMsg(r.message); }
  };
  const replace = () => {
    if (!incoming) return;
    const st = useGameStore.getState();
    st.load(incoming);
    st.openSetup(false);
    void saveGame(AUTOSAVE, incoming);
    close();
  };

  return (
    <span style={{ position: 'relative' }}>
      <button style={btn(open)} title="Export or import a save file" onClick={() => open ? close() : setOpen(true)}>Save</button>
      {open && <div style={{ ...panel, position: 'absolute', top: 'calc(100% + 8px)', left: 0, width: 190, display: 'flex', flexDirection: 'column', gap: 6, whiteSpace: 'normal', background: 'rgba(20,22,18,0.95)', border: `1px solid ${LINE}` }}>
        {incoming ? <>
          <span>Replace this game with the {incoming.lineage.family} save?</span>
          <span style={{ display: 'flex', gap: 6 }}><button style={btn(true)} onClick={replace}>Replace</button><button style={btn()} onClick={close}>Cancel</button></span>
        </> : <>
          <button style={btn()} onClick={doExport}>Export save</button>
          <button style={btn()} onClick={() => file.current?.click()}>Import save</button>
          {msg && <span style={{ color: TONE.bad, fontSize: 11.5 }}>{msg}</span>}
          {!msg && <span style={{ color: DIM, fontSize: 11 }}>.json file</span>}
        </>}
        <input ref={file} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={e => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
      </div>}
    </span>
  );
}
