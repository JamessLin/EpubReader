import React, { useEffect, useRef, useState, useCallback } from 'react';
import ePub, { Book as EpubBook, Rendition } from 'epubjs';
import { Book, ReaderSettings, Highlight } from '../types';
import { updateBookProgress, addBookHighlight, removeBookHighlight } from '../services/db';
import { IconChevronLeft, IconChevronRight, IconList, IconSettings, IconX, IconHighlight } from './Icons';

interface ReaderProps {
  book: Book;
  onClose: () => void;
  settings: ReaderSettings;
  onUpdateSettings: (s: ReaderSettings) => void;
}

// Recursive TOC Item Component
const TocItem: React.FC<{ item: any; onSelect: (href: string) => void; level?: number }> = ({ item, onSelect, level = 0 }) => {
  return (
    <>
      <li>
        <button
          onClick={() => onSelect(item.href)}
          className={`text-left text-sm py-2 px-4 rounded-md w-full truncate transition-colors hover:bg-black/5 block`}
          style={{ paddingLeft: `${(level + 1) * 16}px` }}
          title={item.label}
        >
          {item.label}
        </button>
      </li>
      {item.subitems && item.subitems.length > 0 && (
        <>
          {item.subitems.map((sub: any, idx: number) => (
            <TocItem key={idx} item={sub} onSelect={onSelect} level={level + 1} />
          ))}
        </>
      )}
    </>
  );
};

const Reader: React.FC<ReaderProps> = ({ book, onClose, settings, onUpdateSettings }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const bookRef = useRef<EpubBook | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [toc, setToc] = useState<any[]>([]);
  const [showToc, setShowToc] = useState(false);
  const [tocDocked, setTocDocked] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [isHoveringHeader, setIsHoveringHeader] = useState(false);
  const [currentCfi, setCurrentCfi] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const [isHighlightMode, setIsHighlightMode] = useState(false);
  const [highlights, setHighlights] = useState<Highlight[]>(book.highlights || []);
  const [highlightPopup, setHighlightPopup] = useState<{ cfiRange: string; x: number; y: number } | null>(null);

  // Ref to track highlight mode for event handlers (avoids stale closure)
  const isHighlightModeRef = useRef(isHighlightMode);
  useEffect(() => {
    isHighlightModeRef.current = isHighlightMode;
  }, [isHighlightMode]);

  // Ref to prevent delete popup immediately after creating highlight
  const justCreatedHighlightRef = useRef(false);

  // Apply styles based on settings
  const applyTheme = useCallback((rendition: Rendition, s: ReaderSettings) => {
    const selectionColor = s.theme === 'night'
      ? 'rgba(150, 150, 150, 0.4)'
      : (s.theme === 'sepia' ? 'rgba(91, 70, 54, 0.3)' : 'rgba(255, 232, 66, 0.3)');

    const textColor = s.theme === 'night' ? '#c0c0c0' : (s.theme === 'sepia' ? '#5b4636' : '#2b2b2b');

    const themeObj = {
      'body': {
        'font-family': s.fontFamily === 'serif' ? 'Merriweather, serif !important' : 'Inter, sans-serif !important',
        'color': `${textColor} !important`,
        'background': 'transparent !important',
        'line-height': '1.8 !important',
        'font-size': `${s.fontSize}% !important`,
        'padding': '0px 20px !important',
      },
      'p': {
        'font-family': 'inherit !important',
        'line-height': '1.8 !important',
        'margin-bottom': '1.5em !important',
      },
      'h1, h2, h3': {
        'font-family': 'inherit !important',
        'color': 'inherit !important',
        'font-weight': '600 !important',
      },
      'a': {
        'color': 'inherit !important',
        'text-decoration': 'none !important',
        'border-bottom': '1px dashed currentColor !important',
      },
      'img': {
        'max-width': '100% !important',
        'filter': s.theme === 'night' ? 'brightness(0.8) contrast(1.1)' : 'none',
      },
      '::selection': {
        'background': `${selectionColor} !important`,
      },
      '.highlight': {
        'fill': 'yellow',
        'fill-opacity': '0.3',
        'mix-blend-mode': 'multiply'
      }
    };

    rendition.themes.register('custom', themeObj);
    rendition.themes.select('custom');
  }, []);

  // Initialize EPUB
  useEffect(() => {
    if (!containerRef.current) return;

    const bookInstance = ePub(book.data);
    bookRef.current = bookInstance;

    const rendition = bookInstance.renderTo(containerRef.current, {
      width: '100%',
      height: '100%',
      flow: 'paginated',
      manager: 'default',
      allowScriptedContent: false,
    });
    renditionRef.current = rendition;

    const startLocation = book.lastLocationCfi || undefined;

    rendition.display(startLocation).then(() => {
      setIsReady(true);
      applyTheme(rendition, settings);

      bookInstance.locations.generate(1000).then(() => {
        if (rendition.location) {
          updateLocationState(rendition.location);
        }
      });
    });

    bookInstance.loaded.navigation.then((nav) => {
      setToc(nav.toc);
    });

    rendition.on('relocated', (location: any) => {
      updateLocationState(location);
    });

    // Use hooks to attach selection listener to each page/section
    rendition.hooks.content.register((contents: any) => {
      const doc = contents.document;

      doc.addEventListener('mouseup', () => {
        if (!isHighlightModeRef.current) return;

        const selection = doc.getSelection();
        if (!selection || selection.isCollapsed || !selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        const text = selection.toString().trim();
        if (!text) return;

        // Get CFI range from selection
        const cfiRange = new (ePub as any).CFI(range, contents.cfiBase).toString();

        if (cfiRange) {
          // Mark that we just created a highlight (prevents delete popup)
          justCreatedHighlightRef.current = true;
          setTimeout(() => { justCreatedHighlightRef.current = false; }, 300);

          // Add visual highlight
          rendition.annotations.add('highlight', cfiRange, {}, undefined, 'hl', {
            'fill': 'yellow',
            'fill-opacity': '0.3',
            'mix-blend-mode': 'multiply'
          });

          // Clear selection
          selection.removeAllRanges();

          // Save highlight
          const newHighlight: Highlight = {
            cfiRange,
            color: '#ffff00',
            text,
            created: Date.now()
          };

          setHighlights(prev => [...prev, newHighlight]);
          addBookHighlight(book.id, newHighlight);
        }
      });
    });

    rendition.on('click', (e: any) => {
      setShowControls(prev => !prev);
    });

    // Handle clicking on existing marks/highlights - show delete popup
    rendition.on('markClicked', (cfiRange: string, data: any, contents: any) => {
      // Don't show popup if we just created this highlight
      if (justCreatedHighlightRef.current) {
        return true;
      }

      // Get click position relative to the reader container
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (containerRect) {
        // Show popup near center-top of container
        setHighlightPopup({
          cfiRange,
          x: containerRect.width / 2,
          y: 60
        });
      }
      return true; // Prevent controls toggle
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') rendition.next();
      if (e.key === 'ArrowLeft') rendition.prev();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (bookInstance) {
        bookInstance.destroy();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply theme and re-render highlights when settings change
  useEffect(() => {
    if (renditionRef.current && isReady) {
      applyTheme(renditionRef.current, settings);

      // After theme change causes reflow, re-render all highlights
      // Small delay to allow reflow to complete
      const timeoutId = setTimeout(() => {
        if (!renditionRef.current) return;

        // Clear existing annotations
        highlights.forEach(h => {
          try {
            renditionRef.current?.annotations.remove(h.cfiRange, 'highlight');
          } catch (e) {
            // Ignore if annotation doesn't exist
          }
        });

        // Re-add all highlights with proper styling
        highlights.forEach(highlight => {
          renditionRef.current?.annotations.add('highlight', highlight.cfiRange, {}, undefined, 'hl', {
            'fill': 'yellow',
            'fill-opacity': '0.3',
            'mix-blend-mode': 'multiply'
          });
        });
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [settings, isReady, applyTheme, highlights]);

  // Initial highlight load when book first opens
  const highlightsLoadedRef = useRef(false);
  useEffect(() => {
    if (renditionRef.current && isReady && !highlightsLoadedRef.current && book.highlights && book.highlights.length > 0) {
      highlightsLoadedRef.current = true;
      // Set highlights state from book data
      setHighlights(book.highlights);
    }
  }, [isReady, book.highlights]);

  const updateLocationState = (location: any) => {
    if (!bookRef.current) return;

    const startCfi = location.start.cfi;
    setCurrentCfi(startCfi);

    const percentage = bookRef.current.locations.percentageFromCfi(startCfi);
    const percentageNum = Math.floor(percentage * 100);
    setProgress(percentageNum);

    updateBookProgress(book.id, startCfi, percentageNum);
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    renditionRef.current?.prev();
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    renditionRef.current?.next();
  };

  const handleTocClick = (href: string) => {
    renditionRef.current?.display(href);
    if (!tocDocked) {
      setShowToc(false);
    }
  };

  const deleteHighlight = (cfiRange: string) => {
    renditionRef.current?.annotations.remove(cfiRange, 'highlight');
    setHighlights(prev => prev.filter(h => h.cfiRange !== cfiRange));
    removeBookHighlight(book.id, cfiRange);
    setHighlightPopup(null);
  };

  const getThemeColors = () => {
    switch (settings.theme) {
      case 'night': return {
        desk: 'bg-[#121212]',
        page: 'bg-[#1a1a1a]',
        text: 'text-gray-400',
        uiBg: 'bg-[#2a2a2a]',
        uiText: 'text-gray-300',
        shadow: 'shadow-none border border-gray-800'
      };
      case 'sepia': return {
        desk: 'bg-[#e8dec0]',
        page: 'bg-[#f4ecd8]',
        text: 'text-[#5b4636]',
        uiBg: 'bg-[#f4ecd8]',
        uiText: 'text-[#5b4636]',
        shadow: 'shadow-xl shadow-stone-500/10'
      };
      default: return {
        desk: 'bg-[#f3f4f6]', // Gray-100
        page: 'bg-[#fdfbf7]',
        text: 'text-gray-800',
        uiBg: 'bg-white',
        uiText: 'text-gray-700',
        shadow: 'shadow-2xl shadow-gray-200'
      };
    }
  };

  const colors = getThemeColors();
  const headerVisible = showControls || isHoveringHeader || tocDocked || isHighlightMode;

  return (
    <div className={`fixed inset-0 flex overflow-hidden ${colors.desk} transition-colors duration-500`}>

      {/* Highlight Delete Popup */}
      {highlightPopup && (
        <>
          {/* Backdrop to close popup */}
          <div
            className="fixed inset-0 z-50"
            onClick={() => setHighlightPopup(null)}
          />
          {/* Popup */}
          <div
            className={`
              fixed z-50 top-20 left-1/2 -translate-x-1/2
              ${colors.uiBg} ${colors.uiText}
              rounded-xl shadow-2xl border border-black/10
              px-4 py-3 flex items-center gap-3
              animate-in fade-in slide-in-from-top-2 duration-200
            `}
          >
            <span className="text-sm font-medium">Delete this highlight?</span>
            <button
              onClick={() => deleteHighlight(highlightPopup.cfiRange)}
              className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Delete
            </button>
            <button
              onClick={() => setHighlightPopup(null)}
              className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {/* --- Sidebar (TOC) --- */}
      <div
        className={`
            fixed md:relative inset-y-0 left-0 z-40 
            ${tocDocked ? 'w-80 translate-x-0' : (showToc ? 'translate-x-0 w-80 shadow-2xl' : '-translate-x-full w-0 overflow-hidden')} 
            transition-all duration-300 ease-in-out
            flex flex-col border-r border-black/5
            ${colors.uiBg} ${colors.uiText}
        `}
      >
        <div className="p-4 flex items-center justify-between border-b border-black/5 shrink-0 h-16">
          <h2 className="font-serif font-bold text-lg pl-2">Contents</h2>
          <div className="flex gap-1">
            <button
              onClick={() => setTocDocked(!tocDocked)}
              className="hidden md:block p-2 hover:bg-black/5 rounded-md transition-colors"
              title={tocDocked ? "Unpin Sidebar" : "Pin Sidebar"}
            >
              {tocDocked ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="9" y1="3" x2="9" y2="21" /></svg>
              )}
            </button>
            <button onClick={() => setShowToc(false)} className="p-2 hover:bg-black/5 rounded-md">
              <IconX />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
          {toc.length === 0 ? <p className="opacity-50 text-sm italic p-4">No table of contents</p> : (
            <ul className="space-y-0.5">
              {toc.map((item, idx) => (
                <TocItem key={idx} item={item} onSelect={handleTocClick} />
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Backdrop for mobile sidebar */}
      {showToc && !tocDocked && (
        <div className="fixed inset-0 bg-black/20 z-30 md:hidden backdrop-blur-sm" onClick={() => setShowToc(false)} />
      )}

      {/* Floating Contents Shortcut - always visible at top left */}
      {!showToc && !tocDocked && (
        <button
          onClick={() => setShowToc(true)}
          className={`
            fixed left-3 top-3 z-50
            px-3 py-1.5 rounded-lg shadow-lg border border-black/10
            flex items-center gap-1.5 cursor-pointer
            transition-all duration-200 hover:shadow-xl
            ${colors.uiBg} ${colors.uiText}
          `}
          title="Open Contents"
        >
          <IconList className="w-4 h-4" />
          <span className="text-xs font-medium">Contents</span>
        </button>
      )}

      {/* --- Main Content Area --- */}
      <div className="flex-1 flex flex-col relative h-full">

        {/* Header Hover Zone & Bar */}
        <div
          className="absolute top-0 left-0 right-0 h-12 z-20 group flex justify-center"
          onMouseEnter={() => setIsHoveringHeader(true)}
          onMouseLeave={() => setIsHoveringHeader(false)}
        >
          <div
            className={`
                    mt-3 px-4 py-1.5 rounded-full shadow-lg border border-white/10 backdrop-blur-md
                    flex items-center gap-2
                    transition-all duration-300 transform origin-top
                    ${headerVisible ? 'translate-y-0 opacity-100 scale-100' : '-translate-y-8 opacity-0 scale-95 pointer-events-none'}
                    ${colors.uiBg} ${colors.uiText}
                `}
          >
            {/* Main Controls Grouped Together */}
            <button
              onClick={() => setShowToc(!showToc)}
              className="p-1.5 rounded-full hover:bg-black/5 transition-colors"
              title="Contents"
            >
              <IconList className="w-[18px] h-[18px]" />
            </button>

            <button
              onClick={() => setIsHighlightMode(!isHighlightMode)}
              className={`p-1.5 rounded-full hover:bg-black/5 transition-colors ${isHighlightMode ? 'text-yellow-600 bg-yellow-100 ring-2 ring-yellow-400' : ''}`}
              title="Highlight Mode"
            >
              <IconHighlight className="w-[18px] h-[18px]" />
            </button>

            <div className="w-px h-4 bg-current opacity-10"></div>

            <button onClick={() => onUpdateSettings({ ...settings, fontSize: Math.max(50, settings.fontSize - 10) })} className="text-xs font-bold px-1.5 hover:opacity-70">A-</button>
            <button onClick={() => onUpdateSettings({ ...settings, fontSize: Math.min(200, settings.fontSize + 10) })} className="text-sm font-bold px-1.5 hover:opacity-70">A+</button>

            <div className="w-px h-4 bg-current opacity-10"></div>

            <div className="flex gap-1.5">
              <button onClick={() => onUpdateSettings({ ...settings, theme: 'light' })} className={`w-4 h-4 rounded-full border border-gray-300 bg-[#fdfbf7] ${settings.theme === 'light' ? 'ring-2 ring-blue-400' : ''}`} title="Light Mode" />
              <button onClick={() => onUpdateSettings({ ...settings, theme: 'sepia' })} className={`w-4 h-4 rounded-full border border-gray-300 bg-[#f4ecd8] ${settings.theme === 'sepia' ? 'ring-2 ring-blue-400' : ''}`} title="Sepia Mode" />
              <button onClick={() => onUpdateSettings({ ...settings, theme: 'night' })} className={`w-4 h-4 rounded-full border border-gray-500 bg-[#1a1a1a] ${settings.theme === 'night' ? 'ring-2 ring-blue-400' : ''}`} title="Night Mode" />
            </div>

            <div className="w-px h-4 bg-current opacity-10"></div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-red-50 hover:text-red-500 transition-colors"
              title="Close Book"
            >
              <IconX className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>

        {/* Reader Container - Flex layout with buttons adjacent to book */}
        <div
          className="flex-1 flex items-center justify-center gap-2 md:gap-4 p-4 md:p-8 overflow-hidden"
          onClick={() => setShowControls(prev => !prev)}
        >
          {/* Previous Button - Adjacent to book */}
          <button
            className={`
              shrink-0
              w-10 h-32 md:w-12 md:h-40
              flex items-center justify-center
              rounded-lg
              opacity-40 hover:opacity-100
              transition-all duration-200
              ${colors.uiBg} 
              shadow-md hover:shadow-xl
              border border-black/5
              cursor-pointer
              group
            `}
            onClick={handlePrev}
            title="Previous Page"
          >
            <IconChevronLeft className={`${colors.uiText} w-5 h-5 md:w-6 md:h-6 transition-transform group-hover:-translate-x-0.5`} />
          </button>

          {/* The "Page" */}
          <div
            className={`
                    flex-1 max-w-3xl h-full md:h-[90%] 
                    transition-all duration-300
                    ${colors.page} ${colors.shadow}
                    relative flex flex-col rounded-sm overflow-hidden
                `}
          >
            {/* EPUBJS Mount Point */}
            <div ref={containerRef} className="flex-1 w-full h-full" />

            {/* Footer Info */}
            <div className={`h-8 flex items-center justify-between px-6 text-[10px] uppercase tracking-widest opacity-40 select-none ${colors.text}`}>
              <span className="truncate max-w-[200px]">{book.title}</span>
              <span>{progress}%</span>
            </div>
          </div>

          {/* Next Button - Adjacent to book */}
          <button
            className={`
              shrink-0
              w-10 h-32 md:w-12 md:h-40
              flex items-center justify-center
              rounded-lg
              opacity-40 hover:opacity-100
              transition-all duration-200
              ${colors.uiBg} 
              shadow-md hover:shadow-xl
              border border-black/5
              cursor-pointer
              group
            `}
            onClick={handleNext}
            title="Next Page"
          >
            <IconChevronRight className={`${colors.uiText} w-5 h-5 md:w-6 md:h-6 transition-transform group-hover:translate-x-0.5`} />
          </button>
        </div>

        {/* Visual Progress Bar (Bottom Edge) */}
        <div className="h-1 bg-black/5 w-full">
          <div
            className={`h-full transition-all duration-300 ${settings.theme === 'night' ? 'bg-blue-500' : 'bg-indigo-600'}`}
            style={{ width: `${progress}%` }}
          />
        </div>

      </div>
    </div>
  );
};

export default Reader;