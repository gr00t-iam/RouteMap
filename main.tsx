import React from 'react';
import ReactDOM from 'react-dom/client';
// HashRouter so the app works on GitHub Pages (which has no server rewrites).
// On Vercel/Netlify you can swap this back to BrowserRouter if you prefer clean URLs.
import { HashRouter as BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
