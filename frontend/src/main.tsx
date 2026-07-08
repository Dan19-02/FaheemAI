import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {AuthProvider} from './AuthContext.tsx';
import {LocaleProvider} from './i18n/LocaleContext.tsx';
import {AppErrorBoundary} from './ErrorBoundary.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <LocaleProvider>
        <AuthProvider>
          {/* .fahim-app applies the Arabic-capable font stack (see index.css). */}
          <div className="fahim-app">
            <App />
          </div>
        </AuthProvider>
      </LocaleProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
