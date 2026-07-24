import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {AuthProvider} from './AuthContext.tsx';
import {captureReferralFromUrl} from './referral.ts';
import './index.css';

// Partner links (?ref=CODE) are captured before anything renders, so the code
// survives however the student wanders before reaching the signup card.
captureReferralFromUrl();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
