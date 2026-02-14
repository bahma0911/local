import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './styles/huxn-theme.css';
// Responsive overrides (mobile & small tablet) - loaded after base styles
import './styles/responsive.css';
import App from './App.jsx';
import { AppProvider } from './contex/AppContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <AppProvider>
        <App />
      </AppProvider>
    </ThemeProvider>
  </StrictMode>
);
