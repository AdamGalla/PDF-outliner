import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import docs from '@/stores/doc-store';
import type { PDFOutline } from '../lib/helpers';
import { Button } from './ui/button';

export function OutlinePreview({ outlines }: { outlines: PDFOutline[] }) {
  const requestNavigate = docs.use.requestNavigate();
  const currentPage = docs.use.currentPage();
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const toggle = (path: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const rows = useMemo(() => {
    const output: React.ReactNode[] = [];

    const renderNode = (node: PDFOutline, level: number, path: string) => {
      const hasChildren = !!(node.children && node.children.length > 0);
      const isCollapsed = collapsed.has(path);
      const isActive = currentPage === node.to + 1;

      output.push(
        <div key={path} className="cursor-pointer">
          <div
            className={`px-2 flex items-center h-full hover:bg-accent/70 ${isActive ? 'bg-accent/40' : ''}`}
          >
            {Array.from({ length: level }).map((_, idx) => (
              <div key={`g-${path}-${idx}`} className="border-l-2 border-accent h-6 ms-3"></div>
            ))}

            {hasChildren ? (
              <button
                type="button"
                className={`h-6 w-6 flex items-center justify-center transform transition-transform 
                            outline-none focus:ring-0 ${isCollapsed ? '-rotate-90' : ''}`}
                onClick={(e) => { e.stopPropagation(); toggle(path); }}
                aria-label={isCollapsed ? 'Expand' : 'Collapse'}
              >
                <ChevronDown className="size-6 text-muted-foreground" />
              </button>
            ) : (
              <span className="ms-[3px] w-4" />
            )}

            <div
              className="flex items-center justify-between gap-2 min-w-0 grow h-min"
              onClick={() => requestNavigate(node.to + 1)}
            >
              <span className={`${node.bold ? 'font-bold' : ''} ${node.italic ? 'italic' : ''}`}>{node.title}</span>
              <span className="text-muted-foreground">{node.to + 1}</span>
            </div>
          </div>
        </div>
      );

      if (hasChildren && !isCollapsed) {
        node.children!.forEach((child, i) => renderNode(child, level + 1, `${path}.${i}`));
      }
    };

    outlines.forEach((node, i) => renderNode(node, 0, String(i)));
    return output;
  }, [outlines, collapsed, currentPage]);

  return (
    <div className="w-full overflow-x-auto overflow-y-auto h-full">
      <div className="inline-block min-w-full w-max">
        {rows}
      </div>
    </div>
  );
}
