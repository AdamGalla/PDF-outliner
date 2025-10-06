
import { create } from 'zustand'
import { createSelectors } from '../lib/auto-selector';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PDFOutline } from '@/lib/helpers';
import type { LoadedDocs } from '@/lib/types';


interface DocumentState {
  jsDoc: PDFDocumentProxy | null;
  loadedDocs: LoadedDocs[];
  outlines: PDFOutline[];
  currentPage: number;
  navRequest: { page: number; id: number } | null;
  loadingOutlines: boolean;
  loadingPdfView: boolean;
  errorLoadingFiles: boolean;
  setJsDoc: (jsDoc: PDFDocumentProxy) => void;
  setLoadedDocs: (loadedDocs: LoadedDocs[]) => void;
  addLoadedDocs: (newDocs: LoadedDocs[]) => void;
  setOutlines: (outlines: PDFOutline[]) => void;
  setLoadingOutline: (val: boolean) => void;
  setPdfView: (val: boolean) => void;
  setCurrentPage: (page: number) => void;
  requestNavigate: (page: number) => void;
  clearNavRequest: () => void;
  resetDocState: () => void;
  setErrorLoadingFiles: (error: boolean) => void;
}

const useDocumentState = create<DocumentState>((set) => ({
  jsDoc: null,
  loadedDocs: [],
  outlines: [],
  currentPage: 1,
  navRequest: null,
  loadingOutlines: false,
  loadingPdfView: false,
  errorLoadingFiles: false,
  setJsDoc: (jsDoc) => set({ jsDoc: jsDoc }),
  setErrorLoadingFiles: (error) => set({ errorLoadingFiles: error }),
  setLoadedDocs: (loadedDocs) => set({ loadedDocs: loadedDocs }),
  addLoadedDocs: (newDocs) =>
    set((state) => ({
      loadedDocs: [...state.loadedDocs, ...newDocs],
    })),
  setOutlines: (outlines) => set({ outlines: outlines }),
  setCurrentPage: (page) => set({ currentPage: page }),
  setLoadingOutline: (val) => set({ loadingOutlines: val }),
  setPdfView: (val) => set({ loadingPdfView: val }),
  requestNavigate: (page) =>
    set((state) => {
      const prevId = (state as DocumentState).navRequest?.id ?? 0;
      return { navRequest: { page, id: prevId + 1 } } as Partial<DocumentState>;
    }),
  clearNavRequest: () => set({ navRequest: null }),
  resetDocState: () =>
    set({
      jsDoc: null,
      loadedDocs: [],
      outlines: [],
      currentPage: 1,
      navRequest: null,
    }),
}))

const docs = createSelectors(useDocumentState)

export default docs;
