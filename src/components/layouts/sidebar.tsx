import { Info, Plus } from "lucide-react";
import FileDraggableList from "../documents/file-draggable";
import Options from "../options";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { OutlinePreview } from "../outline-preview";
import docs from "@/stores/doc-store";
import type { NamedBuffer } from "@/lib/types";
import type { RefObject } from "react";

interface SidebarProps {
  pdfBufferRef: RefObject<ArrayBuffer | null>;
  namedBuffersRef: RefObject<NamedBuffer[]>;
}

export default function Sidebar({ pdfBufferRef, namedBuffersRef }: SidebarProps) {
  const outlines = docs.use.outlines();
  const loading = docs.use.loadingOutlines();

  return <div className="h-full flex flex-col">
    <div className="flex flex-col h-full min-h-0">
      <div className="bg-primary-foreground rounded-t-lg border-b-1 border-border py-2 px-4 h-12 flex items-center">
        <span className="h-full text-muted-foreground text-lg font-bold">Outlines</span>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden bg-muted">
        {loading ?
          <div className="h-full flex items-center justify-center">
            <div className="flex gap-2 items-center">
              <Spinner /> <span className="text-muted-foreground">Loading outlines</span>
            </div>
          </div> :
          <div className="h-full">
            {outlines.length ?
              <OutlinePreview outlines={outlines} />
              :
              <div className="flex gap-2 px-4 h-full justify-center items-center">
                <Info className="text-muted-foreground size-5" />
                <span className="py-2 text-muted-foreground">No outlines found</span>
              </div>}
          </div>}

      </div>
      <div className="bg-primary-foreground border-y-1 border-border py-2 px-4 h-12 flex items-center">
        <span className="h-full text-muted-foreground text-lg font-bold">Merge order</span>
      </div>
      <div className="flex-1 min-h-0 bg-muted overflow-auto">
        <FileDraggableList className="px-2 py-2" pdfBufferRef={pdfBufferRef} namedBuffersRef={namedBuffersRef} />
      </div>
      <div className="flex bg-muted px-2 pt-2 pb-2 border-t-1 border-border">
        <Button size="lg" variant="outline" className="flex gap-2 w-full"
          onClick={() => document.getElementById("pdf-upload-add")?.click()}
        ><Plus />Add more PDFs</Button>
      </div>
      <div className="bg-primary-foreground border-y-1 border-border py-2 px-4 h-12 flex items-center">
        <span className="h-full text-muted-foreground text-lg font-bold">Controls</span>
      </div>
      <div className="min-h-0 bg-muted overflow-auto">
        <Options pdfBufferRef={pdfBufferRef} />
      </div>
    </div>

  </div>
}
