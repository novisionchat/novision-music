import React from 'react';
import ReactDOM from 'react-dom/client';

// ÇEVRİMDIŞI (OFFLINE) FONT DESTEĞİ
import '@fontsource/poppins/400.css'; // Regular
import '@fontsource/poppins/500.css'; // Medium
import '@fontsource/poppins/700.css'; // Bold

import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
);