import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/App';
import { Timestamp } from 'firebase/firestore';

// FIX: Monkey-patch the Firebase Timestamp object to make it serializable.
// JSON.stringify will automatically call this toJSON method when it encounters a Timestamp.
// This prevents "Converting circular structure to JSON" errors that can occur with
// complex objects in state, especially with dev tools or some libraries.
(Timestamp.prototype as any).toJSON = function() {
  return this.toDate().toISOString();
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);