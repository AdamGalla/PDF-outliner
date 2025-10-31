import { useRef, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import docs from './stores/doc-store';
import MasterLayout from './components/layouts/master-layout';
import { ModeToggle } from './components/theme/ModeToggle';
import type { NamedBuffer } from './lib/types';
import { Github } from 'lucide-react';

function App() {
  const pdfBufferRef = useRef<ArrayBuffer | null>(null);
  const namedBuffersRef = useRef<NamedBuffer[]>([]);

  const loadedDocs = docs.use.loadedDocs();

  const setFiles = docs.use.setLoadedDocs();
  const setLoadingOutlines = docs.use.setLoadingOutline();

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.currentTarget.files || []);
    if (files.length === 0) return;

    const now = Date.now();

    setLoadingOutlines(true);
    const newDocs = files.map((f, i) => ({ id: `${now}-${i}-${f.name}-${f.size}`, name: f.name, size: String(f.size), used: true }));
    const namedBuffers = await Promise.all(files.map(async (file, i) => ({
      id: newDocs[i].id,
      name: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    })));

    namedBuffers.forEach((nb) => namedBuffersRef.current.push(nb));
    setFiles(newDocs);
  };

  return (
    <div className="w-full h-screen bg-background">
      <div className="p-2 h-full">
        {loadedDocs.length ? (
          <MasterLayout pdfBufferRef={pdfBufferRef} namedBuffersRef={namedBuffersRef} />
        ) : (
          <div className="flex h-full w-full pt-40 md:pt-0 md:items-center justify-center">
            <div className="fixed left-5 bottom-5"><ModeToggle /></div>
            <input className="hidden" id="pdf-upload" type="file" accept="application/pdf" multiple onChange={(e) => handleFileChange(e)} />
            <div className="text-center items-center flex flex-col">
              <img src="/pdf.svg" className="mb-5 size-40" />
              <h1 className="text-primary font-mono font-black text-6xl mb-5">PDF Outliner</h1>
              <Button
                onClick={() => document.getElementById("pdf-upload")?.click()}
                className="flex items-center gap-2 mt-5"
                size={"lg"}
              >
                Select PDF Files
              </Button>
              <div className="border-b border-border w-full mt-10" />

              <div className="flex flex-col gap-5 justify-center mx-20 max-w-[1000px] mt-10">
                <p className="mb-4 text-lg">
                  This tool helps you merge PDFs easily while preserving the outline structure of each file. You can start by selecting the PDFs you want to merge, and you can always upload more files later if needed.
                </p>
                <p className="text-gray-500 mb-4 text-lg">
                  After selecting your files, you’ll see a preview of the merged PDF along with all the outlines. This allows you to check that everything looks correct before finalizing the merge. You can also reorder the PDFs directly in the preview to adjust the final order.
                </p>
                <p className="text-gray-500 mb-4 text-lg">
                  Everything happens <span className="font-bold">locally</span> in your browser. No files are uploaded to any server, so you can be confident that your sensitive information stays private.{" "}
                  <a
                    href="https://github.com/AdamGalla/PDF-outliner"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    View the source on GitHub
                  </a>
                </p>
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
