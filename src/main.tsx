import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/caveat/latin-700.css';
import '@fontsource/architects-daughter/latin-400.css';
import '@fontsource/fraunces/latin-400.css';
import '@fontsource/fraunces/latin-600.css';
import './styles.css';
import App from './App';

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
