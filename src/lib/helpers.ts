
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNull,
  PDFNumber,
  PDFRef,
  PDFString,
} from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import type { PageViewport, PDFPageProxy, RenderTask } from 'pdfjs-dist';

export interface PDFOutline {
  title: string;
  to: number; // page index
  bold?: boolean;
  italic?: boolean;
  children?: PDFOutline[];
}

interface OutlineBuildResult {
  firstRef?: PDFRef;
  lastRef?: PDFRef;
  count: number;
}

/**
 * Add outlines (bookmarks) to a PDF.
 */
export async function setOutline(doc: PDFDocument, outlines: readonly PDFOutline[]): Promise<void> {
  // Remove old outlines first
  const oldOutlinesRef = doc.catalog.get(PDFName.of('Outlines'));
  if (oldOutlinesRef) {
    doc.catalog.delete(PDFName.of('Outlines'));
    // Optionally, delete oldOutlinesRef from context if needed:
    // doc.context.delete(oldOutlinesRef);
  }

  const pageRefs = getPageRefs(doc);

  const outlinesRef = doc.context.nextRef();
  const outlinesDict = doc.context.obj({
    Type: PDFName.of('Outlines'),
  });
  doc.context.assign(outlinesRef, outlinesDict);

  const { firstRef, lastRef, count } = buildOutlineLevel(doc, outlinesRef, outlines, pageRefs);

  if (firstRef && lastRef) {
    outlinesDict.set(PDFName.of('First'), firstRef);
    outlinesDict.set(PDFName.of('Last'), lastRef);
    outlinesDict.set(PDFName.of('Count'), PDFNumber.of(count));
  }

  doc.catalog.set(PDFName.of('Outlines'), outlinesRef);
}

function buildOutlineLevel(
  doc: PDFDocument,
  parentRef: PDFRef,
  outlines: readonly PDFOutline[],
  pageRefs: PDFRef[],
): OutlineBuildResult {
  let prevRef: PDFRef | undefined;
  let firstRef: PDFRef | undefined;
  let lastRef: PDFRef | undefined;
  let totalCount = 0;

  for (let i = 0; i < outlines.length; i++) {
    const outline = outlines[i];
    const thisRef = doc.context.nextRef();

    if (!firstRef) firstRef = thisRef;
    if (i === outlines.length - 1) lastRef = thisRef;

    const dict = doc.context.obj({
      Title: PDFString.of(outline.title),
      Parent: parentRef,
      Dest: destinationArray(doc, pageRefs[outline.to]),
    });

    // Link with previous
    if (prevRef) {
      dict.set(PDFName.of('Prev'), prevRef);
      const prevDict = doc.context.lookup(prevRef, PDFDict);
      prevDict.set(PDFName.of('Next'), thisRef);
    }

    // style flags
    let flags = 0;
    if (outline.italic) flags |= 1;
    if (outline.bold) flags |= 2;
    if (flags) dict.set(PDFName.of('F'), PDFNumber.of(flags));

    // children
    if (outline.children?.length) {
      const childResult = buildOutlineLevel(doc, thisRef, outline.children, pageRefs);
      if (childResult.firstRef && childResult.lastRef) {
        dict.set(PDFName.of('First'), childResult.firstRef);
        dict.set(PDFName.of('Last'), childResult.lastRef);
        dict.set(PDFName.of('Count'), PDFNumber.of(childResult.count));
      }
      totalCount += childResult.count;
    }

    totalCount++;
    doc.context.assign(thisRef, dict);
    prevRef = thisRef;
  }

  return { firstRef, lastRef, count: totalCount };
}

function destinationArray(doc: PDFDocument, pageRef: PDFRef): PDFArray {
  const arr = PDFArray.withContext(doc.context);
  arr.push(pageRef);
  arr.push(PDFName.of('XYZ'));
  arr.push(PDFNull);
  arr.push(PDFNull);
  arr.push(PDFNull);
  return arr;
}

function getPageRefs(pdfDoc: PDFDocument): PDFRef[] {
  const refs: PDFRef[] = [];
  const pageCount = pdfDoc.getPageCount();
  for (let i = 0; i < pageCount; i++) {
    const page = pdfDoc.getPage(i);
    refs.push(page.ref);
  }
  return refs;
}

/**
 * Extract existing outlines (bookmarks) from a PDF document.
 */
export function extractOutlines(doc: PDFDocument): PDFOutline[] {
  const outlinesRef = doc.catalog.get(PDFName.of('Outlines'));
  if (!outlinesRef) {
    return []; // No outlines found
  }

  const outlinesDict = doc.context.lookup(outlinesRef, PDFDict);
  if (!outlinesDict) {
    return [];
  }

  const firstRef = outlinesDict.get(PDFName.of('First'));
  if (!firstRef || !(firstRef instanceof PDFRef)) {
    return [];
  }

  const pageRefs = getPageRefs(doc);
  return extractOutlineLevel(doc, firstRef, pageRefs);
}

function extractOutlineLevel(
  doc: PDFDocument,
  firstRef: PDFRef,
  pageRefs: PDFRef[],
): PDFOutline[] {
  const outlines: PDFOutline[] = [];
  let currentRef: PDFRef | undefined = firstRef;

  while (currentRef) {
    const outlineDict: PDFDict | undefined = doc.context.lookup(currentRef, PDFDict);
    if (!outlineDict) {
      break;
    }

    // Extract title
    const titleObj = outlineDict.get(PDFName.of('Title'));
    let title: string = 'Untitled';
    if (titleObj) {
      try {
        const anyTitle = titleObj as unknown as { asString?: () => string };
        title = typeof anyTitle.asString === 'function' ? anyTitle.asString() : String(titleObj);
      } catch {
        title = 'Untitled';
      }
      title = normalizePdfOutlineTitle(title);
    }

    // Extract destination and find page index
    const destObj = outlineDict.get(PDFName.of('Dest'));
    let pageIndex = 0;

    if (destObj) {
      const destArray = destObj as PDFArray;
      const pageRef = destArray.get(0) as PDFRef;
      pageIndex = pageRefs.findIndex(ref => ref.toString() === pageRef.toString());
      if (pageIndex === -1) pageIndex = 0;
    }

    // Extract style flags
    const flagsObj = outlineDict.get(PDFName.of('F'));
    let bold = false;
    let italic = false;

    if (flagsObj) {
      const flags = (flagsObj as PDFNumber).asNumber();
      bold = !!(flags & 2);
      italic = !!(flags & 1);
    }

    // Extract children if they exist
    let children: PDFOutline[] | undefined;
    const firstChildRef = outlineDict.get(PDFName.of('First'));
    if (firstChildRef && firstChildRef instanceof PDFRef) {
      children = extractOutlineLevel(doc, firstChildRef, pageRefs);
    }

    const outline: PDFOutline = {
      title,
      to: pageIndex,
      bold,
      italic,
      children,
    };

    outlines.push(outline);

    // Move to next outline
    const nextRef: PDFRef | undefined = outlineDict.get(PDFName.of('Next')) as PDFRef | undefined;
    currentRef = nextRef;
  }

  return outlines;
}

// Some PDFs store outline titles as UTF-16 (BE/LE). When mis-decoded, BOM bytes
// can appear as Latin-1 characters (þÿ / ÿþ) and NUL bytes can be interleaved.
// This normalizer strips those artifacts so titles render correctly.
function normalizePdfOutlineTitle(raw: string): string {
  let s = raw;
  // Remove zero-width no-break space (actual BOM if present)
  s = s.replace(/\uFEFF/g, '');
  // Remove leading Latin-1 BOM artifacts (þÿ or ÿþ)
  s = s.replace(/^(?:\u00FE\u00FF|\u00FF\u00FE)/, '');
  // Drop any repeated BOM-pair artifacts inside
  s = s.replace(/(?:\u00FE\u00FF|\u00FF\u00FE)/g, '');
  // Remove interleaved NUL bytes from UTF-16 seen as Latin-1
  s = s.replace(/\u0000/g, '');
  return s;
}

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs';

// PDF rendering interfaces and types
export interface PDFRenderOptions {
  scale?: number;
  rotation?: number;
  backgroundColor?: string;
}

export interface PDFPageInfo {
  pageNumber: number;
  width: number;
  height: number;
  scale: number;
  canvas: HTMLCanvasElement;
  viewport: PageViewport;
  renderTask: RenderTask;
}

/**
 * Load a PDF document using PDF.js
 */
export async function loadPdfWithPdfJs(arrayBuffer: ArrayBuffer): Promise<pdfjsLib.PDFDocumentProxy> {
  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer,
    cMapUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/',
    cMapPacked: true,
  });

  return await loadingTask.promise;
}

// Detect if an error represents a PDF.js rendering cancellation
export function isPdfJsCancelError(err: unknown): boolean {
  const anyErr = err as any;
  const name = typeof anyErr?.name === 'string' ? anyErr.name : '';
  const message = typeof anyErr?.message === 'string' ? anyErr.message : String(anyErr ?? '');
  const lower = message.toLowerCase();
  return name.includes('RenderingCancelled') || lower.includes('cancel');
}

// Cancel any in-flight render on this canvas and wait for it to settle
export async function cancelActiveRender(canvas: HTMLCanvasElement): Promise<void> {
  const currentTask: RenderTask | undefined = (canvas as any).__pdfjsRenderTask as RenderTask | undefined;
  if (currentTask) {
    try { currentTask.cancel(); } catch { /* noop */ }
    try { await currentTask.promise; } catch { /* expected on cancel */ }
  }
}

/**
 * Render a single PDF page to a canvas element
 */
export async function renderPage(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  options: PDFRenderOptions = {}
): Promise<PDFPageInfo> {
  const page = await pdfDoc.getPage(pageNumber);
  const scale = options.scale || 1;
  const rotation = options.rotation || 0;

  const viewport = page.getViewport({ scale, rotation });

  // Clear the canvas first
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Failed to get canvas context');
  }

  // Ensure no other render is currently using this canvas
  await cancelActiveRender(canvas);

  // Set canvas dimensions
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  // Set canvas CSS size for responsive display
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;

  // Set background color if specified
  if (options.backgroundColor) {
    context.fillStyle = options.backgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  const renderContext = {
    canvasContext: context,
    viewport: viewport,
    canvas: canvas,
  };

  // Start the render task and return it for potential cancellation
  const renderTask = page.render(renderContext);
  // Attach to canvas so future callers can cancel
  (canvas as any).__pdfjsRenderTask = renderTask;
  try {
    await renderTask.promise;
  } catch (err) {
    // Always clean up the tracked task
    (canvas as any).__pdfjsRenderTask = undefined;
    // Propagate non-cancellation errors
    if (!isPdfJsCancelError(err)) {
      throw err;
    }
    // Re-throw to let callers optionally ignore cancellations
    throw err;
  }
  // Clear the tracked task on success
  (canvas as any).__pdfjsRenderTask = undefined;

  return {
    pageNumber,
    width: viewport.width,
    height: viewport.height,
    scale,
    canvas,
    viewport,
    renderTask,
  };
}

/**
 * Create a canvas element for PDF page rendering
 */
export function createCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.style.margin = '0 auto';
  // Do not clamp width/height via CSS; allow canvas to exceed container for true zoom
  return canvas;
}

// Reliable outline extraction using PDF.js, including named destinations and ref resolution
export async function extractOutlinesWithPdfJs(pdfDoc: pdfjsLib.PDFDocumentProxy): Promise<PDFOutline[]> {
  const outlineItems = await pdfDoc.getOutline();
  if (!outlineItems || !Array.isArray(outlineItems)) return [];

  // Caches to avoid repeated worker calls
  const pageIndexCache = new Map<string, number>();
  const destCache = new Map<string, any[]>();

  const refKey = (ref: any): string => `${ref?.num ?? 'n'}:${ref?.gen ?? 'g'}`;

  async function resolveExplicitDest(destLike: any): Promise<any[] | null> {
    if (!destLike) return null;
    if (Array.isArray(destLike)) return destLike as any[];
    if (typeof destLike === 'string') {
      const cached = destCache.get(destLike);
      if (cached) return cached;
      const resolved = await pdfDoc.getDestination(destLike);
      if (Array.isArray(resolved)) {
        destCache.set(destLike, resolved as any[]);
        return resolved as any[];
      }
    }
    return null;
  }

  async function resolvePageIndex(item: any): Promise<number> {
    try {
      const explicit = await resolveExplicitDest(item?.dest ?? null);
      if (!explicit) return 0;
      const pageRef = explicit[0];
      const key = refKey(pageRef);
      const cached = pageIndexCache.get(key);
      if (cached !== undefined) return cached;
      const idx = await pdfDoc.getPageIndex(pageRef as any);
      const norm = typeof idx === 'number' && idx >= 0 ? idx : 0;
      pageIndexCache.set(key, norm);
      return norm;
    } catch {
      return 0;
    }
  }

  async function convert(items: any[]): Promise<PDFOutline[]> {
    return await Promise.all(items.map(async (it) => {
      const to = await resolvePageIndex(it);
      const children = it?.items && it.items.length ? await convert(it.items) : undefined;
      return {
        title: normalizePdfOutlineTitle(String(it?.title ?? 'Untitled')),
        to,
        bold: !!it?.bold,
        italic: !!it?.italic,
        children,
      } as PDFOutline;
    }));
  }

  return await convert(outlineItems as any[]);
}
