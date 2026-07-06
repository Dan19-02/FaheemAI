import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
// Clarify's App stays in the tree/imports for now; FahimTutor is the pilot's
// current app root. Swap the render back to <App/> to restore the full workspace.
import App from './App.tsx';
import FahimTutor from './FahimTutor.tsx';
import {AuthProvider} from './AuthContext.tsx';
import {LocaleProvider} from './i18n/LocaleContext.tsx';
import './index.css';

// Keep a reference so the unused import doesn't trip noUnusedLocals while the
// pilot renders FahimTutor as the root. (Clarify's App remains available above.)
void App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocaleProvider>
      {/* AuthProvider retained: FahimTutor needs no auth, but Clarify's App does. */}
      <AuthProvider>
        {/* .fahim-app applies the Arabic-capable font stack (see index.css). */}
        <div className="fahim-app">
          <FahimTutor />
        </div>
      </AuthProvider>
    </LocaleProvider>
  </StrictMode>,
);
