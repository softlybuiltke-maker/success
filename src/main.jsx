import React from 'react';
import { createRoot } from 'react-dom/client';
import App, { Toaster } from './App.jsx';
import './index.css';

const root = createRoot(document.getElementById('root'));
root.render(
  <>
    <Toaster
      position="top-center"
      toastOptions={{ style: { background: '#1e293b', color: '#fff', borderRadius: '12px' } }}
    />
    <App />
  </>
);
