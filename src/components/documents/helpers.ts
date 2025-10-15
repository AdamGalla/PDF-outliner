import type { LoadedDocs } from "@/lib/types";

interface IndicatorState {
  _el?: HTMLElement;
  _pos?: 'before' | 'after';
}

const indicatorState: IndicatorState = {};

export function reorder(list: LoadedDocs[], startIndex: number, endIndex: number): LoadedDocs[] {
  const next = list.slice();
  const [removed] = next.splice(startIndex, 1);
  next.splice(endIndex, 0, removed);
  return next;
}

export function formatSize(size: string): string {
  const n = Number(size);
  if (Number.isNaN(n) || n < 0) return size;
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

export function measurePositions(container: HTMLDivElement | null): Map<string, DOMRect> {
  const map = new Map<string, DOMRect>();
  if (!container) return map;
  const rows = Array.from(container.querySelectorAll('[data-row="true"]')) as HTMLElement[];
  rows.forEach((row) => {
    const key = row.getAttribute('data-key') ?? '';
    if (!key) return;
    map.set(key, row.getBoundingClientRect());
  });
  return map;
}

export function animateReorder(container: HTMLDivElement | null, prev: Map<string, DOMRect>, skipKey?: string) {
  if (!container) return;
  const rows = Array.from(container.querySelectorAll('[data-row="true"]')) as HTMLElement[];
  rows.forEach((row) => {
    const key = row.getAttribute('data-key') ?? '';
    if (skipKey && key === skipKey) {
      row.style.transform = '';
      row.style.transition = '';
      return;
    }
    if (!key) return;
    const previous = prev.get(key);
    if (!previous) return;
    const current = row.getBoundingClientRect();
    const deltaY = previous.top - current.top;
    const deltaX = previous.left - current.left;
    if (deltaX === 0 && deltaY === 0) return;
    row.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
    row.style.transition = 'transform 0s';
    requestAnimationFrame(() => {
      row.style.transform = '';
      row.style.transition = 'transform 180ms ease-out';
    });
  });
}

export function inferBeforeAfter(targetEl: HTMLElement, clientY?: number): 'before' | 'after' {
  if (clientY == null) return 'after';
  const rect = targetEl.getBoundingClientRect();
  const mid = rect.top + rect.height / 2;
  return clientY < mid ? 'before' : 'after';
}

export function showIndicator(targetEl: HTMLElement, pos: 'before' | 'after') {
  const root = (targetEl.closest('[data-list-root="true"]') as HTMLElement | null) ?? targetEl.ownerDocument?.body ?? null;
  if (!root) return;

  const hostRect = root.getBoundingClientRect();
  const rowRect = targetEl.getBoundingClientRect();
  const y = pos === 'before' ? (rowRect.top - hostRect.top) : (rowRect.bottom - hostRect.top);
  const left = Math.max(0, rowRect.left - hostRect.left - 8);
  const right = Math.max(0, hostRect.right - rowRect.right - 8);

  let el = indicatorState._el;
  if (!el) {
    el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.height = '3px';
    el.style.background = 'var(--color-primary, #6e56cf)';
    el.style.pointerEvents = 'none';
    el.style.borderRadius = '2px';
    indicatorState._el = el;
    root.appendChild(el);
  }
  el.style.left = `${left}px`;
  el.style.right = `${right}px`;
  el.style.top = `${y - 1}px`;
  indicatorState._pos = pos;
  const knob = el.querySelector('[data-knob="true"]') as HTMLElement | null;
  if (knob) {
    knob.style.left = '0px';
    knob.style.top = '0px';
  }
}

export function clearIndicator() {
  const el = indicatorState._el;
  if (el && el.parentElement) {
    try { el.parentElement.removeChild(el); } catch { console.error("Failed to clear indicator state") }
  }
  indicatorState._el = undefined;
  indicatorState._pos = undefined;
}

export function getIndicatorPos(): 'before' | 'after' | null {
  return indicatorState._pos ?? null;
}

export function getClientYFromLocation(location: { current: unknown }): number | undefined {
  const curr = location.current as { input?: { clientY?: number } };
  return curr.input?.clientY;
}
