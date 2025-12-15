import React, { useRef, useState } from 'react';
import { Book } from '../types';
import { saveBook, deleteBook } from '../services/db';
import ePub from 'epubjs';
import { IconBook, IconPlus, IconTrash } from './Icons';

const generateId = () => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

interface LibraryProps {
  books: Book[];
  onBookSelect: (book: Book) => void;
  onRefresh: () => void;
}

const Library: React.FC<LibraryProps> = ({ books, onBookSelect, onRefresh }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const bookInstance = ePub(arrayBuffer);
      
      // Parse metadata
      const metadata = await bookInstance.loaded.metadata;
      // Get cover
      let coverUrl = undefined;
      const coverUrlStr = await bookInstance.coverUrl();
      if (coverUrlStr) {
          const response = await fetch(coverUrlStr);
          const blob = await response.blob();
          coverUrl = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
          });
      }

      const newBook: Book = {
        id: generateId(),
        title: metadata.title || file.name.replace('.epub', ''),
        author: metadata.creator || 'Unknown',
        coverUrl: coverUrl,
        data: arrayBuffer,
        addedAt: Date.now(),
        lastLocationCfi: '',
        progress: 0,
      };

      await saveBook(newBook);
      onRefresh();
    } catch (err) {
      console.error("Failed to parse epub", err);
      alert("Could not load this EPUB file.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (window.confirm("Are you sure you want to delete this book? This action cannot be undone.")) {
        try {
            await deleteBook(id);
            onRefresh();
        } catch (error) {
            console.error("Error deleting book:", error);
            alert("Failed to delete book. Please try again.");
        }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-12">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-12">
          <div>
             <h1 className="text-3xl font-serif font-bold text-gray-900">Library</h1>
             <p className="text-gray-500 mt-2">Your personal collection</p>
          </div>
          <div>
            <input 
              type="file" 
              accept=".epub" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className={`flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-full shadow-lg hover:bg-gray-800 transition-all transform hover:scale-105 ${isUploading ? 'opacity-70 cursor-wait' : ''}`}
            >
              {isUploading ? (
                  <span>Importing...</span>
              ) : (
                  <>
                    <IconPlus className="w-5 h-5" />
                    <span className="font-medium">Import EPUB</span>
                  </>
              )}
            </button>
          </div>
        </header>

        {books.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-gray-200 rounded-xl">
             <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
               <IconBook className="w-8 h-8 text-gray-400" />
             </div>
             <h3 className="text-xl font-medium text-gray-700">No books yet</h3>
             <p className="text-gray-500 mt-2 max-w-sm">Import an EPUB file to start reading. Your progress is saved automatically on this device.</p>
             <button 
               onClick={() => fileInputRef.current?.click()}
               className="mt-6 text-indigo-600 font-medium hover:underline"
             >
               Browse files
             </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 md:gap-8">
            {books.sort((a,b) => b.addedAt - a.addedAt).map((book) => (
              <div 
                key={book.id} 
                className="group relative flex flex-col cursor-pointer"
                onClick={() => onBookSelect(book)}
              >
                <div className="relative aspect-[2/3] bg-white shadow-md rounded-md overflow-hidden hover:shadow-xl transition-shadow duration-300 border border-gray-100">
                   {book.coverUrl ? (
                     <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover" />
                   ) : (
                     <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100 p-4 text-center">
                        <IconBook className="w-12 h-12 text-gray-300 mb-2" />
                        <span className="text-xs text-gray-400 font-serif">{book.title}</span>
                     </div>
                   )}
                   
                   {/* Overlay for hover effect - pointer-events-none ensures clicks pass through if needed, though we want card click */}
                   <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors pointer-events-none" />

                   {/* Delete Button - z-10 ensures it sits above everything else */}
                   <button 
                     onClick={(e) => handleDelete(e, book.id)}
                     className="absolute top-2 right-2 z-10 p-2 bg-white rounded-full shadow-md text-gray-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all transform scale-90 hover:scale-100"
                     title="Delete book"
                   >
                     <IconTrash className="w-4 h-4" />
                   </button>
                   
                   {/* Progress Bar Overlay */}
                   {book.progress > 0 && (
                     <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200">
                        <div 
                          className="h-full bg-indigo-500" 
                          style={{ width: `${book.progress}%` }} 
                        />
                     </div>
                   )}
                </div>

                <div className="mt-3">
                  <h3 className="font-bold text-gray-900 truncate font-serif text-sm md:text-base" title={book.title}>{book.title}</h3>
                  <p className="text-xs text-gray-500 truncate">{book.author}</p>
                  {book.progress > 0 && (
                     <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-wider font-medium">{book.progress}% Complete</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Library;