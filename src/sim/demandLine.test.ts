import { describe, expect, it } from 'vitest';
import { demandLine } from './encounters';

describe('demandLine', () => {
  it('speaks for who the crew is: officials never "want a toll" under a white rag', () => {
    for (const k of ['requisition', 'patrol']) expect(demandLine(k)).not.toMatch(/rag|toll/);
    expect(demandLine('requisition')).toMatch(/deputy/);
    expect(demandLine('militia')).toMatch(/recruiter/);
    expect(demandLine('gang')).toMatch(/toll/);
    expect(demandLine('looters')).toMatch(/white rag/);
  });
});
