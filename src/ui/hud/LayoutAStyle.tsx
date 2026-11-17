import { layoutACss } from './layoutACss';

/** Layout A's stylesheet as an element. */
export function LayoutAStyle() { return <style data-testid="layout-a-style">{layoutACss()}</style>; }
