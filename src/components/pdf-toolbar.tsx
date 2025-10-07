import { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PDFToolbarProps {
  currentPage: number;
  totalPages: number;
  scale: number;
  onPageChange: (page: number) => void;
  onScaleChange: (scale: number) => void;
  onRotate?: () => void;
  onFitToWidth?: () => void;
  className?: string;
}

export function PDFToolbar({
  currentPage,
  totalPages,
  scale,
  onPageChange,
  onScaleChange,
  onRotate,
  onFitToWidth,
  className = ''
}: PDFToolbarProps) {
  const [pageInput, setPageInput] = useState(currentPage.toString());
  const [zoomInput, setZoomInput] = useState(`${Math.round(scale * 100)}%`);
  const zoomInputRef = useRef<HTMLInputElement>(null);

  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPageInput(e.target.value);
  };

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const page = parseInt(pageInput, 10);
    if (page >= 1 && page <= totalPages) {
      onPageChange(page);
    } else {
      setPageInput(currentPage.toString());
    }
  };

  const handlePageInputBlur = () => {
    setPageInput(currentPage.toString());
  };

  const goToPreviousPage = useCallback(() => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  }, [currentPage, onPageChange]);

  const goToNextPage = useCallback(() => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
    }
  }, [currentPage, totalPages, onPageChange]);

  const zoomIn = useCallback(() => {
    const newScale = Math.min(scale * 1.25, 3.0);
    onScaleChange(newScale);
  }, [scale, onScaleChange]);

  const zoomOut = useCallback(() => {
    const newScale = Math.max(scale / 1.25, 0.25);
    onScaleChange(newScale);
  }, [scale, onScaleChange]);

  const resetZoom = useCallback(() => {
    onScaleChange(1.5);
  }, [onScaleChange]);

  useEffect(() => {
    setPageInput(currentPage.toString());
  }, [currentPage]);

  // Keep zoom input in sync with external scale changes
  useEffect(() => {
    setZoomInput(`${Math.round(scale * 100)}%`);
    // If the field is focused, keep caret before %
    const el = zoomInputRef.current;
    if (el && document.activeElement === el) {
      const len = el.value?.length ?? 1;
      const pos = Math.max(0, len - 1);
      requestAnimationFrame(() => el.setSelectionRange(pos, pos));
    }
  }, [scale]);

  const handleZoomInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/[^0-9]/g, '');
    setZoomInput(digits ? `${digits}%` : '');
    // Place caret before % after DOM updates
    const el = zoomInputRef.current;
    if (el) {
      requestAnimationFrame(() => {
        const len = el.value?.length ?? 1;
        const pos = Math.max(0, len - 1);
        el.setSelectionRange(pos, pos);
      });
    }
  };

  const commitZoom = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, '');
    const pct = parseInt(digits, 10);
    if (Number.isNaN(pct)) {
      setZoomInput(`${Math.round(scale * 100)}%`);
      return;
    }
    const clampedPct = Math.max(25, Math.min(500, pct));
    const newScale = clampedPct / 100;
    onScaleChange(newScale);
    setZoomInput(`${clampedPct}%`);
  };

  const handleZoomInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    commitZoom(zoomInput);
  };

  const handleZoomInputBlur = () => {
    commitZoom(zoomInput);
  };

  return (
    <div className={cn(
      "flex items-center h-12 justify-between bg-primary-foreground border-b-1 border-accent px-2 py-2 shadow-sm",
      className
    )}>
      {/* Left side - Page navigation */}
      <div className="flex items-center gap-2 h-full">
        <Button
          variant="outline"
          size="sm"
          onClick={goToPreviousPage}
          disabled={currentPage <= 1}
          className="h-8 w-8 p-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <form onSubmit={handlePageInputSubmit} className="h-full flex items-center gap-1">
          <input
            type="text"
            value={pageInput}
            onChange={handlePageInputChange}
            onBlur={handlePageInputBlur}
            className="h-full w-10 text-center text-sm bg-accent rounded-lg px-1 focus:outline-none focus:ring-1 focus:ring-zinc-500 focus:border-transparent"
          />
          <span className="text-sm text-gray-600">/ {totalPages}</span>
        </form>

        <Button
          variant="outline"
          size="sm"
          onClick={goToNextPage}
          disabled={currentPage >= totalPages}
          className="h-8 w-8 p-0"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Center - Document info (no zoom here) */}
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">
          {totalPages} page{totalPages !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Right side - Zoom and other controls */}
      <div className="h-full flex items-center gap-1">
        <form onSubmit={handleZoomInputSubmit} className="h-full flex items-center gap-1">
          <input
            type="text"
            inputMode="numeric"
            ref={zoomInputRef}
            value={zoomInput}
            onChange={handleZoomInputChange}
            onBlur={handleZoomInputBlur}
            onFocus={() => {
              const el = zoomInputRef.current;
              if (!el) return;
              const len = el.value?.length ?? 1;
              const pos = Math.max(0, len - 1);
              requestAnimationFrame(() => el.setSelectionRange(pos, pos));
            }}
            onKeyDown={(e) => {
              const el = zoomInputRef.current;
              if (!el) return;
              const len = el.value?.length ?? 1;
              const lastIdx = Math.max(0, len - 1);
              const start = el.selectionStart ?? lastIdx;
              const end = el.selectionEnd ?? lastIdx;
              const atEnd = start === len && end === len;
              const atBeforePercent = start >= lastIdx && end >= lastIdx;
              // Prevent moving caret after % or deleting it
              if (e.key === 'End') {
                e.preventDefault();
                requestAnimationFrame(() => el.setSelectionRange(lastIdx, lastIdx));
              }
              if (e.key === 'ArrowRight' && atBeforePercent) {
                e.preventDefault();
                requestAnimationFrame(() => el.setSelectionRange(lastIdx, lastIdx));
              }
              if ((e.key === 'Backspace' && atEnd) || (e.key === 'Delete' && atBeforePercent)) {
                e.preventDefault();
                requestAnimationFrame(() => el.setSelectionRange(lastIdx, lastIdx));
              }
            }}
            className="h-full w-14 text-center text-sm bg-accent rounded-lg px-1 focus:outline-none focus:ring-1 focus:ring-zinc-500 focus:border-transparent"
            title="Zoom percentage"
          />
        </form>

        <Button
          variant="outline"
          size="sm"
          onClick={zoomOut}
          disabled={scale <= 0.25}
          className="h-8 w-8 p-0"
          title="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={resetZoom}
          className="h-8 w-8 p-0"
          title="Reset zoom"
        >
          <Home className="h-4 w-4" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={zoomIn}
          disabled={scale >= 3.0}
          className="h-8 w-8 p-0"
          title="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>

        {onRotate && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRotate}
            className="h-8 w-8 p-0 ml-2"
            title="Rotate"
          >
            <RotateCw className="h-4 w-4" />
          </Button>
        )}

        {onFitToWidth && (
          <Button
            variant="outline"
            size="sm"
            onClick={onFitToWidth}
            className="h-8 px-3 ml-1"
            title="Fit to width"
          >
            Fit Width
          </Button>
        )}
      </div>
    </div>
  );
}
