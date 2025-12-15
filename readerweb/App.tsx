import React, { useState, useEffect } from 'react';
import Library from './components/Library';
import Reader from './components/Reader';
import { Book, ReaderSettings, DEFAULT_SETTINGS } from './types';
import { getAllBooks } from './services/db';

function App() {
  const [view, setView] = useState<'library' | 'reader'>('library');
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [settings, setSettings] = useState<ReaderSettings>(() => {
    const saved = localStorage.getItem('peerfo-settings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  const loadBooks = async () => {
    try {
      const loadedBooks = await getAllBooks();
      setBooks(loadedBooks);
    } catch (error) {
      console.error("Failed to load library", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBooks();
  }, []);

  const handleBookSelect = (book: Book) => {
    setCurrentBook(book);
    setView('reader');
  };

  const handleCloseReader = () => {
    setView('library');
    setCurrentBook(null);
    loadBooks(); // Refresh to update progress
  };

  const handleUpdateSettings = (newSettings: ReaderSettings) => {
    setSettings(newSettings);
    localStorage.setItem('peerfo-settings', JSON.stringify(newSettings));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-pulse flex flex-col items-center">
          <div className="h-12 w-12 bg-gray-200 rounded-full mb-4"></div>
          <div className="h-4 w-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <>
      {view === 'library' && (
        <Library
          books={books}
          onBookSelect={handleBookSelect}
          onRefresh={loadBooks}
        />
      )}

      {view === 'reader' && currentBook && (
        <Reader
          book={currentBook}
          onClose={handleCloseReader}
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
        />
      )}
    </>
  );
}

export default App;
