
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Menu, X } from "lucide-react";
import Sidebar from "./sidebar";
import PDFViewer from "../pdf-viewer";
import { useState, type RefObject } from "react";
import type { NamedBuffer } from "@/lib/types";

interface MasterLayoutProps {
  pdfBufferRef: RefObject<ArrayBuffer | null>;
  namedBuffersRef: RefObject<NamedBuffer[]>;
}

export default function MasterLayout({ pdfBufferRef, namedBuffersRef }: MasterLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="relative flex flex-col xl:grid xl:grid-cols-1 xl:grid-cols-4 gap-2 h-full min-h-0">
      <div
        className={`
          xl:col-span-1
          ${mobileOpen ? "fixed inset-0 z-50 bg-background" : "hidden xl:block h-full border border-border rounded-lg overflow-hidden min-h-0"}
        `}
      >
        <Sidebar pdfBufferRef={pdfBufferRef} namedBuffersRef={namedBuffersRef} />
        {mobileOpen && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2"
            onClick={() => setMobileOpen(false)}
          >
            <X />
          </Button>
        )}
      </div>

      <div className="xl:hidden h-min flex justify-center">
        <Button variant="outline" size="sm" onClick={() => setMobileOpen(true)}>
          Options <Menu />
        </Button>
      </div>

      <div className="xl:col-span-3 h-full border border-border rounded-lg overflow-hidden min-h-0">
        <PDFViewer />
      </div>
    </div>
  );
}

