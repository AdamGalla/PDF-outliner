import { useEffect, useRef, type RefObject } from 'react';
import docs from '@/stores/doc-store';
import type { LoadedDocs, NamedBuffer } from '@/lib/types';
import { cn } from '@/lib/utils';
import { GripVertical } from 'lucide-react';
import { draggable, dropTargetForElements, monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { extractOutlinesWithPageResolution, loadPdfWithPdfJs, mergePdfs, destroyPdfJsDoc } from '@/lib/helpers';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { animateReorder, clearIndicator, formatSize, getClientYFromLocation, getIndicatorPos, inferBeforeAfter, measurePositions, reorder, showIndicator } from './helpers';

interface FileDraggableListProps {
  className?: string;
  namedBuffersRef: RefObject<NamedBuffer[]>;
  pdfBufferRef: RefObject<ArrayBuffer | null>;
}

type DragData = { index: number };



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
  const perFileDocCacheRef = useRef<Map<string, { pdf: PDFDocumentProxy; name: string }>>(new Map());

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

        const mergedPdf = await loadPdfWithPdfJs(workerBytes);
        if (mergeSessionRef.current !== sessionId) return; // cancelled
        setPdfJsDoc(mergedPdf);

        // Load or reuse per-file PDF.js docs for outline extraction
        const loadedPdfs = await Promise.all(selected.map(async (nb) => {
          const cached = perFileDocCacheRef.current.get(nb.id);
          if (cached) return { name: cached.name, pdf: cached.pdf };
          const pdf = await loadPdfWithPdfJs(nb.bytes.slice());
          perFileDocCacheRef.current.set(nb.id, { pdf, name: nb.name });
          return { name: nb.name, pdf };
        }));
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
    };
  }, [items, namedBuffersRef, pdfBufferRef, setErrorLoadingPdf,
    setLoadingOutlines, setOutlines, setPdfJsDoc, setUpdatingPdf]);

  // Cleanup cached per-file docs on unmount
  useEffect(() => {
    return () => {
      const entries = Array.from(perFileDocCacheRef.current.values());
      perFileDocCacheRef.current.clear();
      entries.forEach(({ pdf }) => void destroyPdfJsDoc(pdf));
    };
  }, []);

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
              'group grid grid-cols-[28px_1fr_auto_auto] items-center gap-3 px-3 py-2 rounded-md border-1 border-border bg-primary-foreground hover:bg-muted transition-colors'
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
