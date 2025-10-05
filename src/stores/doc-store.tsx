
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
  setJsDoc: (jsDoc: PDFDocumentProxy) => void;
  setLoadedDocs: (loadedDocs: LoadedDocs[]) => void;
  addLoadedDocs: (newDocs: LoadedDocs[]) => void;
  setOutlines: (outlines: PDFOutline[]) => void;
  setCurrentPage: (page: number) => void;
  requestNavigate: (page: number) => void;
  clearNavRequest: () => void;
  resetGitState: () => void;
}

const useGitStateBase = create<DocumentState>((set) => ({
  jsDoc: null,
  loadedDocs: [],
  outlines: [],
  currentPage: 1,
  navRequest: null,
  setJsDoc: (jsDoc) => set({ jsDoc: jsDoc }),
  setLoadedDocs: (loadedDocs: LoadedDocs[]) => set({ loadedDocs: loadedDocs }),
  addLoadedDocs: (newDocs) =>
    set((state) => ({
      loadedDocs: [...state.loadedDocs, ...newDocs],
    })),
  setOutlines: (outlines: PDFOutline[]) => set({ outlines: outlines }),
  setCurrentPage: (page: number) => set({ currentPage: page }),
  requestNavigate: (page: number) =>
    set((state) => {
      const prevId = (state as DocumentState).navRequest?.id ?? 0;
      return { navRequest: { page, id: prevId + 1 } } as Partial<DocumentState>;
    }),
  clearNavRequest: () => set({ navRequest: null }),
  resetGitState: () =>
    set({
      jsDoc: null,
      loadedDocs: [],
      outlines: [],
      currentPage: 1,
      navRequest: null,
    }),
}))

const docs = createSelectors(useGitStateBase)

export default docs;
