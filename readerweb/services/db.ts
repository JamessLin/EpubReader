import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Book } from '../types';

interface PeerfoDB extends DBSchema {
  books: {
    key: string;
    value: Book;
  };
}

const DB_NAME = 'zen-reader-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<PeerfoDB>> | null = null;

const getDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<PeerfoDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('books')) {
          db.createObjectStore('books', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
};

export const saveBook = async (book: Book): Promise<void> => {
  const db = await getDB();
  await db.put('books', book);
};

export const getAllBooks = async (): Promise<Book[]> => {
  const db = await getDB();
  return db.getAll('books');
};

export const getBook = async (id: string): Promise<Book | undefined> => {
  const db = await getDB();
  return db.get('books', id);
};

export const deleteBook = async (id: string): Promise<void> => {
  const db = await getDB();
  await db.delete('books', id);
};

export const updateBookProgress = async (id: string, cfi: string, progress: number): Promise<void> => {
  const db = await getDB();
  const book = await db.get('books', id);
  if (book) {
    book.lastLocationCfi = cfi;
    book.progress = progress;
    await db.put('books', book);
  }
};

export const addBookHighlight = async (id: string, highlight: import('../types').Highlight): Promise<void> => {
  const db = await getDB();
  const book = await db.get('books', id);
  if (book) {
    const highlights = book.highlights || [];
    highlights.push(highlight);
    book.highlights = highlights;
    await db.put('books', book);
  }
};

export const removeBookHighlight = async (id: string, cfiRange: string): Promise<void> => {
  const db = await getDB();
  const book = await db.get('books', id);
  if (book && book.highlights) {
    book.highlights = book.highlights.filter(h => h.cfiRange !== cfiRange);
    await db.put('books', book);
  }
};
