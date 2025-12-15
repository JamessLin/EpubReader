export interface Highlight {
  cfiRange: string;
  color: string; // hex code
  text?: string;
  created: number;
}

export interface Book {
  id: string; // usually a UUID or hash of the file
  title: string;
  author: string;
  coverUrl?: string; // Base64 or Blob URL
  data: ArrayBuffer; // The actual epub file content
  addedAt: number;
  lastLocationCfi: string; // The specific location in the book
  progress: number; // 0 to 100
  totalLocations?: number;
  highlights?: Highlight[];
}

export interface ReaderSettings {
  theme: 'light' | 'sepia' | 'night';
  fontSize: number; // percentage, e.g., 100, 120
  fontFamily: 'serif' | 'sans';
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  theme: 'light',
  fontSize: 100,
  fontFamily: 'serif',
};
