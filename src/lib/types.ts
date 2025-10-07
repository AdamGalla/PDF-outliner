import type { PDFDocumentProxy } from "pdfjs-dist";

export interface LoadedDocs {
  id: string;
  name: string;
  size: string;
  used: boolean;
}

export interface NamedPdf {
  name: string;
  pdf: PDFDocumentProxy;
}

export interface NamedBuffer {
  id: string;
  name: string;
  bytes: Uint8Array;
}

