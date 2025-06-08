import { useEffect, useRef, useState } from "react";
import { Button } from "./components/ui/button";

import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs';

function App() {
  const [file, setFile] = useState<File | null>(null);
  const canvasHolderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!file || !canvasHolderRef.current) return;

    (async () => {
      canvasHolderRef.current!.innerHTML = "";

      const bytes = await file.arrayBuffer();
      const pdfDoc = await pdfjsLib.getDocument({ data: bytes }).promise;

      for (let pageNo = 1; pageNo <= pdfDoc.numPages; pageNo++) {
        const page = await pdfDoc.getPage(pageNo);
        const viewport = page.getViewport({ scale: 1.5 });

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvasHolderRef.current!.appendChild(canvas);

        await page.render({
          canvasContext: canvas.getContext("2d")!,
          viewport,
        }).promise;
      }
    })();
  }, [file]);

  return (
    <div className="w-full h-full flex flex-col gap-4 p-4">
      <input
        id="pdf-upload"
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f) setFile(f);
        }}
      />

      <Button variant="outline" onClick={() =>
        document.getElementById("pdf-upload")?.click()
      }>
        Upload PDF
      </Button>

      <div
        ref={canvasHolderRef}
        className="flex flex-col items-center gap-6 overflow-auto"
      />
    </div>
  );
}

export default App;

