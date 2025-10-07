import { useEffect, useRef, type RefObject } from 'react';
import docs from '@/stores/doc-store';
import type { LoadedDocs, NamedBuffer } from '@/lib/types';
import { cn } from '@/lib/utils';
import { GripVertical, Plus } from 'lucide-react';
import { draggable, dropTargetForElements, monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { Button } from './ui/button';
import { extractOutlinesWithPageResolution, loadPdfWithPdfJs, mergePdfs } from '@/lib/helpers';

interface FileDraggableListProps {
  className?: string;
  namedBuffersRef: RefObject<NamedBuffer[]>;
  pdfBufferRef: RefObject<ArrayBuffer | null>;
}

type DragData = { index: number };
const indicatorEl: HTMLElement | null = null;
const indicatorPos: 'before' | 'after' | null = null;

interface IndicatorState {
  _el?: HTMLElement;
  _pos?: 'before' | 'after';
}

const indicatorState: IndicatorState = {};

export default function FileDraggableList({ className = '', namedBuffersRef, pdfBufferRef }: FileDraggableListProps) {
  const items = docs.use.loadedDocs();
  const setItems = docs.use.setLoadedDocs();
  const addFiles = docs.use.addLoadedDocs();
  const setPdfJsDoc = docs.use.setJsDoc();
  const setLoadingOutlines = docs.use.setLoadingOutline();
  const setOutlines = docs.use.setOutlines();
  const setErrorLoadingPdf = docs.use.setErrorLoadingFiles();
  const setUpdatingPdf = docs.use.setUpdatingPdf();


  const containerRef = useRef<HTMLDivElement>(null);
  const mergeSessionRef = useRef(0);
  const debounceTimerRef = useRef<number | null>(null);
  const lastSignatureRef = useRef<string>('');

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const destroyFns: Array<() => void> = [];

    const getIndex = (el: Element | null): number => {
      if (!el) return -1;
      const indexStr = (el as HTMLElement).dataset.index;
      return indexStr ? Number(indexStr) : -1;
    };

    const rowEls = Array.from(container.querySelectorAll('[data-row="true"]')) as HTMLElement[];
    rowEls.forEach((rowEl) => {
      const handle = rowEl.querySelector('[data-handle="true"]') as HTMLElement | null;
      const destroyDraggable = draggable({
        element: rowEl,
        dragHandle: handle ?? undefined,
        getInitialData: () => ({ type: 'file-row', index: getIndex(rowEl) }),
      });
      const destroyDropTarget = dropTargetForElements({
        element: rowEl,
        getData: () => ({ type: 'file-row', index: getIndex(rowEl) }),
        canDrop: ({ source }) => source.data.type === 'file-row',
        onDrag({ location }) {
          const target = location.current.dropTargets[0]?.element as HTMLElement | undefined;
          if (!target) return;
          const pos = inferBeforeAfter(target, getClientYFromLocation(location));
          showIndicator(target, pos);
        },
        onDragLeave() {
          clearIndicator();
        },
      });
      destroyFns.push(destroyDraggable, destroyDropTarget);
    });

    const destroyMonitor = monitorForElements({
      onDragStart() {
        clearIndicator();
      },
      onDrag({ location }) {
        const targetEl = location.current.dropTargets[0]?.element as HTMLElement | undefined;
        if (!targetEl) {
          clearIndicator();
          return;
        }
        const pos = inferBeforeAfter(targetEl, getClientYFromLocation(location));
        showIndicator(targetEl, pos);
      },
      onDrop({ location, source }) {
        const srcIndex = (source.data as DragData).index;
        const targetEl = location.current.dropTargets[0]?.element as HTMLElement | undefined;
        if (srcIndex === -1 || !targetEl) {
          clearIndicator();
          (source.element as HTMLElement).style.opacity = '';
          return;
        }
        const movedKey = (source.element as HTMLElement).getAttribute('data-key') ?? '';
        const baseIndex = getIndex(targetEl);
        if (baseIndex === -1) {
          clearIndicator();
          (source.element as HTMLElement).style.opacity = '';
          return;
        }
        const pos = getIndicatorPos() ?? inferBeforeAfter(targetEl, getClientYFromLocation(location));
        const targetIndex = pos === 'after' ? baseIndex + 1 : baseIndex;
        if (targetIndex === srcIndex || targetIndex === srcIndex + 1) {
          clearIndicator();
          (source.element as HTMLElement).style.opacity = '';
          return;
        }
        const prevMap = measurePositions(container);
        const endIndex = srcIndex < targetIndex ? targetIndex - 1 : targetIndex;
        const next = reorder(items, srcIndex, endIndex);
        setItems(next);
        requestAnimationFrame(() => animateReorder(container, prevMap, movedKey));
        clearIndicator();
        (source.element as HTMLElement).style.opacity = '';
      },
    });
    destroyFns.push(destroyMonitor);

    return () => {
      destroyFns.forEach((fn) => {
        try { fn(); } catch { console.error("Could not destroy drag monitor") }
      });
      clearIndicator();
    };
  }, [items, setItems]);

  const toggleUsed = (idx: number) => {
    const next = items.map((it, i) => i === idx ? { ...it, used: !it.used } : it);
    setItems(next);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.currentTarget.files || []);
    if (files.length === 0) return;

    const now = Date.now();
    const newDocs = files.map((f, i) => ({ id: `${now}-${i}-${f.name}-${f.size}`, name: f.name, size: String(f.size), used: true }));
    const namedBuffers = await Promise.all(files.map(async (file, i) => ({
      id: newDocs[i].id,
      name: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    })));

    namedBuffers.forEach((nb) => namedBuffersRef.current.push(nb));
    addFiles(newDocs);
  }

  useEffect(() => {
    const signature = items.map(it => `${it.id}:${it.used ? '1' : '0'}`).join('|');
    if (signature === lastSignatureRef.current) return;

    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = window.setTimeout(async () => {
      lastSignatureRef.current = signature;
      const sessionId = ++mergeSessionRef.current;
      try {
        setUpdatingPdf(true);
        setLoadingOutlines(true);

        const byId = new Map<string, NamedBuffer>();
        (namedBuffersRef.current || []).forEach(nb => byId.set(nb.id, nb));
        const selected: NamedBuffer[] = [];
        for (const it of items) {
          if (!it.used) continue;
          const nb = byId.get(it.id);
          if (nb) selected.push(nb);
        }
        if (mergeSessionRef.current !== sessionId) return;
        if (selected.length === 0) {
          setOutlines([]);
          setUpdatingPdf(false);
          setPdfJsDoc(null);
          setLoadingOutlines(false);
          return;
        }

        const mergedBytes = await mergePdfs(selected);
        if (mergeSessionRef.current !== sessionId) return;

        // Keep two independent copies: one for storing as buffer, one for PDF.js worker
        const stableBytes = mergedBytes.slice();
        const workerBytes = mergedBytes.slice();
        pdfBufferRef.current = stableBytes.buffer;

        // Load merged PDF into viewer
        const mergedPdf = await loadPdfWithPdfJs(workerBytes);
        if (mergeSessionRef.current !== sessionId) return; // cancelled
        setPdfJsDoc(mergedPdf);

        // Load individual PDFs for outline extraction using safe copies
        const loadedPdfs = await Promise.all(selected.map(async (nb) => ({
          name: nb.name,
          pdf: await loadPdfWithPdfJs(nb.bytes.slice()),
        })));
        if (mergeSessionRef.current !== sessionId) return; // cancelled

        const outlines = await extractOutlinesWithPageResolution(loadedPdfs);
        if (mergeSessionRef.current !== sessionId) return; // cancelled

        setOutlines(outlines);
        setLoadingOutlines(false);
        setUpdatingPdf(false);
      } catch (err) {
        if (mergeSessionRef.current !== sessionId) return; // ignore cancelled errors
        console.error('Error loading PDF:', err);
        setErrorLoadingPdf(true);
        setLoadingOutlines(false);
        setUpdatingPdf(false);
      }
    }, 250);

    return () => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      // Do not mutate session here; next run will create a new session when it actually starts
    };
  }, [items, namedBuffersRef, pdfBufferRef]);

  return (
    <div ref={containerRef} className={cn('p-2 relative', className)} data-list-root="true">
      <div className="flex flex-col gap-1">
        {items.length === 0 && (
          <div className="text-sm text-muted-foreground px-2 py-3">No files loaded</div>
        )}
        {items.map((item, index) => (
          <div
            key={item.id ?? `${index}-${item.name}-${item.size}`}
            data-row="true"
            data-index={index}
            data-key={item.id ?? `${index}-${item.name}-${item.size}`}
            className={cn(
              'group grid grid-cols-[28px_1fr_auto_auto] items-center gap-3 px-3 py-2 rounded-md border-1 border-accent bg-primary-foreground hover:bg-muted transition-colors'
            )}
          >
            <div className="flex items-center justify-center text-muted-foreground cursor-grab active:cursor-grabbing" data-handle="true" aria-label="Drag handle">
              <GripVertical className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{item.name}</div>
              <div className="text-xs text-muted-foreground">{formatSize(item.size)}</div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary brightness-75"
                checked={item.used}
                onChange={() => toggleUsed(index)}
              />
            </label>
          </div>
        ))}
        <input className="hidden" id="pdf-upload-add" type="file" accept="application/pdf" multiple onChange={(e) => handleFileChange(e)} />
      </div>
    </div>
  );
}

function reorder(list: LoadedDocs[], startIndex: number, endIndex: number): LoadedDocs[] {
  const next = list.slice();
  const [removed] = next.splice(startIndex, 1);
  next.splice(endIndex, 0, removed);
  return next;
}

function formatSize(size: string): string {
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

function measurePositions(container: HTMLDivElement | null): Map<string, DOMRect> {
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

function animateReorder(container: HTMLDivElement | null, prev: Map<string, DOMRect>, skipKey?: string) {
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

function inferBeforeAfter(targetEl: HTMLElement, clientY?: number): 'before' | 'after' {
  if (clientY == null) return 'after';
  const rect = targetEl.getBoundingClientRect();
  const mid = rect.top + rect.height / 2;
  return clientY < mid ? 'before' : 'after';
}

function showIndicator(targetEl: HTMLElement, pos: 'before' | 'after') {
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

function clearIndicator() {
  const el = indicatorState._el;
  if (el && el.parentElement) {
    try { el.parentElement.removeChild(el); } catch { console.error("Failed to clear indicator state") }
  }
  indicatorState._el = undefined;
  indicatorState._pos = undefined;
}

function getIndicatorPos(): 'before' | 'after' | null {
  return indicatorState._pos ?? null;
}

function getClientYFromLocation(location: { current: unknown }): number | undefined {
  const curr = location.current as { input?: { clientY?: number } };
  return curr.input?.clientY;
}
