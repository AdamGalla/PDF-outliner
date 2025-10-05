import docs from "@/stores/doc-store";
import { OutlinePreview } from "../outline-preview";
import PDFViewer from "../pdf-viewer";
import { Info } from "lucide-react";
import FileDraggableList from "../file-draggable";
import Options from "../options";

export default function MasterLayout() {
  const outlines = docs.use.outlines();

  return <div className="grid grid-cols-1 xl:grid-cols-4 gap-2 h-full min-h-0">

    <div className="xl:col-span-1 h-[60vh] xl:h-full bg-muted border-1 border-accent rounded-lg flex flex-col min-h-0">
      <div className="flex flex-col h-full min-h-0">
        <div className="bg-primary-foreground rounded-t-lg border-b-1 border-accent py-2 px-4 h-12 flex items-center">
          <span className="h-full text-muted-foreground text-lg font-bold">Outlines</span>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          {outlines.length ?
            <OutlinePreview outlines={outlines} />
            :
            <div className="mt-2 flex gap-2 px-4 justify-center items-center">
              <Info className="text-muted-foreground size-5" />
              <span className="py-2 text-muted-foreground">No outlines found</span>
            </div>}
        </div>
        <div className="bg-primary-foreground border-y-1 border-accent py-2 px-4 h-12 flex items-center">
          <span className="h-full text-muted-foreground text-lg font-bold">Merge order</span>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          <FileDraggableList className="px-2 py-2" />
        </div>
        <div className="bg-primary-foreground border-y-1 border-accent py-2 px-4 h-12 flex items-center">
          <span className="h-full text-muted-foreground text-lg font-bold">Controls</span>
        </div>
        <div className="min-h-0 overflow-auto">
          <Options />
        </div>
      </div>

    </div>

    <div className="xl:col-span-3 h-[60vh] xl:h-full border-1 border-accent rounded-lg overflow-hidden min-h-0">
      <PDFViewer />
    </div>
  </div>
}
