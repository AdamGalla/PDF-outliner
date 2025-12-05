import { useCallback, useEffect, useRef, useState } from 'react';
import {
  renderPage,
  createCanvas,
  isPdfJsCancelError,
  destroyPdfJsDoc,
} from '../lib/helpers';
import docs from '@/stores/doc-store';
import { cn } from '@/lib/utils';
import { PDFToolbar } from './pdf-toolbar';
import { Spinner } from './ui/spinner';
import { useTheme } from './theme/ThemeProvider';
import { AlertCircle, Sun, SunDim } from 'lucide-react';
import { Button } from './ui/button';
import options from '@/stores/options-store';
import { Alert, AlertTitle } from './ui/alert';

interface PDFViewerProps {
  className?: string;
}

export default function PDFViewer({
  className = '',
}: PDFViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const renderSessionIdRef = useRef(0);
  const zoomSessionIdRef = useRef(0);
  const currentPageRef = useRef(1);
  const isPanningRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1.5);

  const pdfDoc = docs.use.jsDoc();
  const currentPage = docs.use.currentPage();
  const navRequest = docs.use.navRequest();
  const errorLoadingFiles = docs.use.errorLoadingFiles();
  const updatingPdf = docs.use.updatingPdf();
  const setCurrentPage = docs.use.setCurrentPage();
  const clearNavRequest = docs.use.clearNavRequest();

  const dimDoc = options.use.dimDoc();
  const setDimDoc = options.use.setDimDoc();

  const scrollToPage = useCallback((pageNumber: number) => {
    if (!containerRef.current || !viewerRef.current) return;

    const pageIndex = pageNumber - 1;
    if (pageIndex < 0 || pageIndex >= viewerRef.current.children.length) return;

    const pageEl = viewerRef.current.children[pageIndex] as HTMLElement;
    if (!pageEl) return;
    pageEl.scrollIntoView({ behavior: 'instant', block: 'start' });
    setCurrentPage(pageNumber);
  }, [setCurrentPage]);

  const ioRef = useRef<IntersectionObserver | null>(null);

  const ensureRendered = useCallback(async (pageNum: number) => {
    if (!pdfDoc || !viewerRef.current) return;
    const viewer = viewerRef.current;
    const wrapper = viewer.children[pageNum - 1] as HTMLElement | undefined;
    if (!wrapper) return;

    let canvas = wrapper.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) {
      canvas = createCanvas();
      wrapper.innerHTML = '';
      wrapper.appendChild(canvas);
    }

    const alreadyScale = Number(canvas.dataset.renderScale || 0);
    if (Math.abs(alreadyScale - scale) < 0.01) return;

    try {
      const pageInfo = await renderPage(pdfDoc, pageNum, canvas, { scale });
      canvas.dataset.renderScale = String(scale);
      canvas.dataset.baseWidth = String(pageInfo.width / scale);
      canvas.dataset.baseHeight = String(pageInfo.height / scale);
      // Canvas size matches the rendered pixels; no additional CSS zoom needed here
      canvas.style.width = `${pageInfo.width}px`;
      canvas.style.height = `${pageInfo.height}px`;
      // Ensure wrapper height matches the rendered page height at current scale
      wrapper.style.height = `${pageInfo.height}px`;
    } catch (err) {
      if (isPdfJsCancelError(err)) return; // ignore expected cancellations
      throw err;
    }
  }, [pdfDoc, scale]);

  const setupPlaceholders = useCallback(async () => {
    if (!pdfDoc || !viewerRef.current) return;
    const sessionId = ++renderSessionIdRef.current;
    if (renderSessionIdRef.current == 1) setIsLoading(true);
    setError(null);

    try {
      const viewer = viewerRef.current;
      const fragment = document.createDocumentFragment();
      for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const pageWrapper = document.createElement('div');
        pageWrapper.className = `pdf-page mb-4 flex items-center justify-center ${dimDoc ? "brightness-75" : ""}`;
        // Placeholder height based on this page's intrinsic size
        try {
          const page = await pdfDoc.getPage(pageNum);
          const vpEach = page.getViewport({ scale: 1.0 });
          pageWrapper.dataset.baseWidth = String(vpEach.width);
          pageWrapper.dataset.baseHeight = String(vpEach.height);
          pageWrapper.style.height = `${vpEach.height * scale}px`;
        } catch {
          // Fallback if page sizing fails for some reason
          pageWrapper.style.height = `${600 * scale}px`;
        }
        fragment.appendChild(pageWrapper);
      }
      if (renderSessionIdRef.current !== sessionId) return;
      viewer!.innerHTML = '';
      viewer!.appendChild(fragment);

      // IntersectionObserver to lazily render
      if (ioRef.current) ioRef.current.disconnect();
      ioRef.current = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const idx = Array.prototype.indexOf.call(viewer!.children, entry.target);
          if (idx < 0) continue;
          // Ensure page is rendered or re-crisped at current scale when it comes into view
          void ensureRendered(idx + 1);
        }
      }, { root: containerRef.current!, rootMargin: '800px 0px', threshold: 0.01 });

      Array.from(viewer!.children).forEach((child) => ioRef.current!.observe(child));

      for (let i = 1; i <= Math.min(4, pdfDoc.numPages); i++) {
        await ensureRendered(i);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize PDF pages');
      console.error('PDF init error:', err);
    } finally {
      if (renderSessionIdRef.current === sessionId) setIsLoading(false);
    }
  }, [pdfDoc, scale, ensureRendered, dimDoc]);

  const handleScaleChange = useCallback((newScale: number) => {
    setScale(newScale)
  }, []);

  const handlePageChange = useCallback((pageNumber: number) => {
    scrollToPage(pageNumber);
  }, [scrollToPage]);

  useEffect(() => {
    if (!containerRef.current || !viewerRef.current) return;

    const container = containerRef.current;
    container.style.cursor = isPanningRef.current ? 'grabbing' : 'default';
    const handleScroll = () => {
      const containerCenter = container.scrollTop + container.clientHeight / 2;

      let closestPage = 1;
      let minDistance = Infinity;

      const children = viewerRef.current!.children;
      for (let i = 0; i < children.length; i++) {
        const el = children[i] as HTMLElement;
        const elTop = el.offsetTop;
        const elCenter = elTop + el.clientHeight / 2;
        const distance = Math.abs(elCenter - containerCenter);
        if (distance < minDistance) {
          minDistance = distance;
          closestPage = i + 1;
        }
      }

      if (closestPage !== currentPage) {
        setCurrentPage(closestPage);
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [currentPage]);

  // Respond to external navigation requests from the store (e.g., Outline clicks)
  useEffect(() => {
    if (!navRequest) return;
    const target = Math.max(1, Math.min(navRequest.page, pdfDoc?.numPages || navRequest.page));
    scrollToPage(target);
    clearNavRequest();
  }, [navRequest, scrollToPage, clearNavRequest, pdfDoc]);

  const captureCenterState = useCallback(() => {
    const container = containerRef.current;
    const viewerEl = viewerRef.current;
    if (!container || !viewerEl || viewerEl.children.length === 0) return null;
    const centerY = container.scrollTop + container.clientHeight / 2;
    const centerX = container.scrollLeft + container.clientWidth / 2;
    let chosenIndex = 0;
    let minDistance = Infinity;
    for (let i = 0; i < viewerEl.children.length; i++) {
      const el = viewerEl.children[i] as HTMLElement;
      const top = el.offsetTop;
      const h = el.clientHeight || 1;
      const elCenter = top + h / 2;
      const dist = Math.abs(elCenter - centerY);
      if (dist < minDistance) {
        minDistance = dist;
        chosenIndex = i;
      }
    }
    const el = viewerEl.children[chosenIndex] as HTMLElement;
    const top = el.offsetTop;
    const left = el.offsetLeft;
    const h = el.clientHeight || 1;
    const w = el.clientWidth || 1;
    const yRatio = (centerY - top) / h;
    const xRatio = (centerX - left) / w;
    return { pageIndex: chosenIndex, yRatio, xRatio };
  }, []);

  const restoreCenterState = useCallback((state: { pageIndex: number; yRatio: number; xRatio: number } | null) => {
    if (!state) return;
    const container = containerRef.current;
    const viewerEl = viewerRef.current;
    if (!container || !viewerEl) return;
    const { pageIndex, yRatio, xRatio } = state;
    const el = viewerEl.children[pageIndex] as HTMLElement | undefined;
    if (!el) return;
    const top = el.offsetTop;
    const left = el.offsetLeft;
    const h = el.clientHeight || 1;
    const w = el.clientWidth || 1;
    const targetCenterY = top + yRatio * h;
    const targetCenterX = left + xRatio * w;
    container.scrollTop = Math.max(0, targetCenterY - container.clientHeight / 2);
    container.scrollLeft = Math.max(0, targetCenterX - container.clientWidth / 2);
  }, []);

  const applyCssZoomInstant = useCallback((targetScale: number) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const canvases = viewer.querySelectorAll('canvas');
    canvases.forEach((canvas) => {
      const el = canvas as HTMLCanvasElement;
      const baseW = Number(el.dataset.baseWidth || (el.width / Number(el.dataset.renderScale || 1)) || el.width);
      const baseH = Number(el.dataset.baseHeight || (el.height / Number(el.dataset.renderScale || 1)) || el.height);
      const cssWidth = baseW * targetScale;
      const cssHeight = baseH * targetScale;
      el.style.width = `${cssWidth}px`;
      el.style.height = `${cssHeight}px`;
    });
  }, []);

  // On scale change: preserve center, apply instant CSS zoom, then crisp all pages in background
  useEffect(() => {
    if (!viewerRef.current) return;
    const centerState = captureCenterState();
    const sessionId = ++zoomSessionIdRef.current;
    // Update canvases instantly
    applyCssZoomInstant(scale);
    // Update wrapper heights for all pages (rendered and placeholders) based on per-page base heights
    if (viewerRef.current) {
      Array.from(viewerRef.current.children).forEach((el) => {
        const wrapper = el as HTMLElement;
        const canvas = wrapper.querySelector('canvas') as HTMLCanvasElement | null;
        if (canvas) {
          const baseH = Number(
            canvas.dataset.baseHeight ||
            (canvas.height / Number(canvas.dataset.renderScale || 1)) ||
            canvas.height
          );
          wrapper.style.height = `${baseH * scale}px`;
        } else {
          const baseH = Number(wrapper.dataset.baseHeight || 0);
          if (!Number.isNaN(baseH) && baseH > 0) {
            wrapper.style.height = `${baseH * scale}px`;
          }
        }
      });
    }

    requestAnimationFrame(() => {
      restoreCenterState(centerState);
      const viewer = viewerRef.current;
      if (!viewer) return;
      const visible: number[] = [];
      const container = containerRef.current!;
      for (let i = 0; i < viewer.children.length; i++) {
        const el = viewer.children[i] as HTMLElement;
        const top = el.offsetTop;
        const bottom = top + el.clientHeight;
        const viewTop = container.scrollTop - 800;
        const viewBottom = container.scrollTop + container.clientHeight + 800;
        if (bottom >= viewTop && top <= viewBottom) visible.push(i + 1);
      }
      (async () => {
        for (const num of visible) {
          // Re-render visible pages at target scale in background
          const wrapper = viewer.children[num - 1] as HTMLElement;
          const canvas = wrapper.querySelector('canvas') as HTMLCanvasElement | null;
          if (!canvas) continue;
          const alreadyScale = Number(canvas.dataset.renderScale || 1);
          if (Math.abs(alreadyScale - scale) < 0.01) continue;
          try {
            const pageInfo = await renderPage(pdfDoc!, num, canvas, { scale });
            canvas.dataset.renderScale = String(scale);
            canvas.dataset.baseWidth = String(pageInfo.width / scale);
            canvas.dataset.baseHeight = String(pageInfo.height / scale);
            canvas.style.width = `${pageInfo.width}px`;
            canvas.style.height = `${pageInfo.height}px`;
          } catch (err) {
            if (isPdfJsCancelError(err)) continue; // ignore and proceed to next
            throw err;
          }
        }
        // Also queue re-crisping of the rest in the background progressively
        for (let pageNum = 1; pageNum <= pdfDoc!.numPages; pageNum++) {
          if (visible.includes(pageNum)) continue;
          const wrapper = viewer.children[pageNum - 1] as HTMLElement;
          const canvas = wrapper.querySelector('canvas') as HTMLCanvasElement | null;
          if (!canvas) continue;
          const already = Number(canvas.dataset.renderScale || 1);
          if (Math.abs(already - scale) < 0.01) continue;
          try {
            const pageInfo = await renderPage(pdfDoc!, pageNum, canvas, { scale });
            canvas.dataset.renderScale = String(scale);
            canvas.dataset.baseWidth = String(pageInfo.width / scale);
            canvas.dataset.baseHeight = String(pageInfo.height / scale);
            canvas.style.width = `${pageInfo.width}px`;
            canvas.style.height = `${pageInfo.height}px`;
          } catch (err) {
            if (isPdfJsCancelError(err)) continue;
            throw err;
          }
        }
      })();
    });
  }, [applyCssZoomInstant, captureCenterState, restoreCenterState, pdfDoc]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      isPanningRef.current = true;
      container.style.cursor = 'grabbing';
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        scrollLeft: container.scrollLeft,
        scrollTop: container.scrollTop,
      };
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isPanningRef.current || !panStartRef.current) return;
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      container.scrollLeft = panStartRef.current.scrollLeft - dx;
      container.scrollTop = panStartRef.current.scrollTop - dy;
    };

    const endPan = () => {
      isPanningRef.current = false;
      panStartRef.current = null;
      if (container) container.style.cursor = 'default';
    };

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', endPan);

    return () => {
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', endPan);
    };
  }, []);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    if (pdfDoc) {
      void setupPlaceholders();
    }
  }, [pdfDoc, setupPlaceholders]);

  useEffect(() => {
    return () => {
      void destroyPdfJsDoc(pdfDoc);
    };
  }, [pdfDoc]);

  return (
    <div className={cn("relative flex flex-col h-full flex-1", className)}>
      {pdfDoc && isLoading ? <div className="absolute bg-muted inset-0 flex items-center justify-center h-full z-1">
        <div className="flex items-center gap-2">
          <Spinner className='size-8 text-primary' />
          <span className="">Loading PDF pages...</span>
        </div>
      </div> :
        <>
          {!pdfDoc && !error && !errorLoadingFiles && <div className="absolute bg-muted inset-0 flex items-center justify-center z-1">
            <div className="flex items-center gap-2">
              <Spinner className='size-8 text-primary' />
              <span className="">Merging PDFs...</span>
            </div>
          </div>
          }
          {error && !errorLoadingFiles && <div className="absolute bg-muted inset-0 flex items-center justify-center z-1">
            <div className="flex items-center gap-2">
              <AlertCircle className="size-8 text-red-600" />
              <span className="">PDF viewer cannot display your pdf,
                try to save the pdf and inspect it locally.</span>
            </div>
          </div>
          }
          {errorLoadingFiles && <div className="absolute inset-0 flex items-center bg-red-500/10 justify-center z-1">
            <div className="flex items-center gap-2">
              <AlertCircle className="size-8 text-red-600" />
              <span className="text-red-600">There has been error while merging your pdfs,
                please try with different files.</span>
            </div>
          </div>
          }
        </>
      }

      <PDFToolbar
        currentPage={currentPage}
        totalPages={pdfDoc?.numPages || 0}
        scale={scale}
        onPageChange={handlePageChange}
        onScaleChange={handleScaleChange}
        className="flex-shrink-0"
      />

      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-muted p-4"
      >
        <div ref={viewerRef} className="mx-auto w-fit min-w-fit">
        </div>
      </div>

      <Button variant="secondary" size="icon" className="absolute bottom-5 right-5"
        onClick={() => setDimDoc(!dimDoc)}
      >
        {dimDoc ? <SunDim /> : <Sun />}
      </Button>

      <div className="right-5 top-15 absolute">
        {updatingPdf &&
          <Alert variant="default">
            <Spinner />
            <AlertTitle>Updating your document</AlertTitle>
          </Alert>}
      </div>
    </div>
  );
}
