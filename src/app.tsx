import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { PDFDocument } from 'pdf-lib';
import { setOutline, extractOutlinesWithPdfJs, loadPdfWithPdfJs, mergePdfs, extractOutlinesWithPageResolution } from './lib/helpers';
import docs from './stores/doc-store';
import MasterLayout from './components/layouts/master-layout';
import { ModeToggle } from './components/theme/ModeToggle';
import type { LoadedDocs } from './lib/types';

function App() {
  const [pdfDoc, setPdfDoc] = useState<PDFDocument | null>(null);

  const outlines = docs.use.outlines();
  const pdfJsDoc = docs.use.jsDoc();
  const loadedDocs = docs.use.loadedDocs();

  const setPdfJsDoc = docs.use.setJsDoc();
  const setFiles = docs.use.setLoadedDocs();
  const setOutlines = docs.use.setOutlines();
  const setLoadingOutlines = docs.use.setLoadingOutline();
  const setErrorLoadingPdf = docs.use.setErrorLoadingFiles();

  const fileName = "merged.pdf"

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.currentTarget.files || []);
    if (selectedFiles.length === 0) return;

    const now = Date.now();
    setLoadingOutlines(true);
    setFiles(selectedFiles.map((f, i) => ({ id: `${now}-${i}-${f.name}-${f.size}`, name: f.name, size: String(f.size), used: true })));
    await processFiles(selectedFiles);
  };

  const processFiles = async (files: File[]) => {
    try {
      const namedBuffers = await Promise.all(files.map(async (file) => ({
        name: file.name,
        buffer: await file.arrayBuffer()
      })))

      const mergedBuffer = await mergePdfs(namedBuffers);
      const mergedPdf = await loadPdfWithPdfJs(mergedBuffer);
      setPdfJsDoc(mergedPdf);

      const loadedPdfs = await Promise.all(namedBuffers.map(async (namedBuffer) => ({
        name: namedBuffer.name,
        pdf: await loadPdfWithPdfJs(namedBuffer.buffer)
      })))

      const outlines = await extractOutlinesWithPageResolution(loadedPdfs);
      console.log(outlines)

      setOutlines(outlines);
      setLoadingOutlines(false);
    } catch (err) {
      console.error('Error loading PDF:', err);
      setErrorLoadingPdf(true);
    }
  };

  useEffect(() => {

  }, [loadedDocs])

  // TODO: Instead of this, we will have merge pdfs and save function
  const savePdfWithCurrentOutlines = async () => {
    if (!pdfDoc) {
      alert('Please load a PDF first');
      return;
    }

    try {
      await setOutline(pdfDoc, outlines);

      const bytes = await pdfDoc.save();
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      console.log('PDF saved with current outline structure');
    } catch (err) {
      console.error('Error saving PDF:', err);
    }
  };

  return (
    <div className="w-full h-screen bg-primary-foreground">
      <div className="p-2 h-full">
        {loadedDocs.length ? (
          <MasterLayout />
        ) : (
          <div className="flex items-center justify-center h-full w-full">
            <div className="absolute left-5 top-5"><ModeToggle /></div>
            <input className="hidden" id="pdf-upload" type="file" accept="application/pdf" multiple onChange={(e) => handleFileChange(e)} />
            <div className="text-center items-center justify-center flex flex-col">
              <h1 className="text-primary font-mono font-black text-6xl mb-10">PDF Outliner</h1>
              <div className="flex flex-col gap-5 justify-center mx-20 max-w-[1000px]">
                <p className="text-gray-400 mb-4 text-lg">This tool helps you to merge pdfs easily and keep the outline structure of every pdf.</p>
                <p className="text-gray-500 mb-4 text-lg">Simply select pdfs you would like to merge, edit the ordering of the merge and save yout file.</p>
                <p className="text-gray-500 mb-4 text-lg">Everything happens locally inside of your browser, no pdfs are uploaded to any server, so you can be sure no sensitive information is leaked.</p>
              </div>
              <Button
                onClick={() => document.getElementById("pdf-upload")?.click()}
                className="flex items-center gap-2 mt-5"
                size={"lg"}
              >
                Select PDF Files
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
