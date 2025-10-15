import * as pdfjsLib from 'pdfjs-dist';

const ASSET_BASE = (import.meta as any)?.env?.BASE_URL || '/';

try {
  const worker = new Worker(`${ASSET_BASE}pdf.worker.mjs`, { type: 'module' });
  (pdfjsLib as any).GlobalWorkerOptions.workerPort = worker as unknown as MessagePort;
} catch {
  (pdfjsLib as any).GlobalWorkerOptions.workerSrc = `${ASSET_BASE}pdf.worker.mjs`;
}

export { pdfjsLib };
