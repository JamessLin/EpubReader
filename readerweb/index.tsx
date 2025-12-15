import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Suppress benign ResizeObserver errors common with epubjs/layout engines
// These errors usually indicate that the browser skipped a resize notification frame, 
// which is harmless in this context but can clutter logs.
const ignoredErrors = [
  'ResizeObserver loop completed with undelivered notifications',
  'ResizeObserver loop limit exceeded'
];

const originalError = console.error;
console.error = (...args) => {
  if (args.length > 0 && typeof args[0] === 'string') {
    if (ignoredErrors.some(err => args[0].includes(err))) return;
  }
  originalError(...args);
};

window.addEventListener('error', (e) => {
  if (ignoredErrors.some(err => e.message.includes(err))) {
    e.stopImmediatePropagation();
  }
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);