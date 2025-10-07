import { useState, type RefObject } from "react";
import { ModeToggle } from "./theme/ModeToggle";
import { Button } from "./ui/button";
import { setOutline } from "@/lib/helpers";
import { PDFDocument } from "pdf-lib";
import docs from "@/stores/doc-store";
import { Spinner } from "./ui/spinner";

interface OptionsProps {
  pdfBufferRef: RefObject<ArrayBuffer | null>;
}

export default function Options({ pdfBufferRef }: OptionsProps) {
  const fileName = "merged.pdf"

  const [saving, setSaving] = useState(false);

  const outlines = docs.use.outlines();

  const savePdfWithCurrentOutlines = async () => {
    if (!pdfBufferRef.current) {
      alert('Please load a PDF first');
      return;
    }
    setSaving(true);

    try {
      const pdfDoc = await PDFDocument.load(pdfBufferRef.current);
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
      setSaving(false);
    } catch (err) {
      console.error(err);
      alert("Error saving the file, try to upload the files again.")
    }
  };

  return <div className="p-2 flex justify-between gap-2">
    <ModeToggle />
    <Button onClick={savePdfWithCurrentOutlines} variant="default" disabled={saving}>{saving ? <Spinner className="size-5" /> : "Save"}</Button>
  </div>
}
