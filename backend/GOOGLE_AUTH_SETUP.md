# Continue with Google: setup

Faheem AI uses **Google Identity Services (GIS)** for "Continue with Google".

How it works:

1. The frontend renders Google's official button (script loaded in `frontend/index.html`).
2. When a student taps it, Google returns a signed **ID token** (a JWT) to the browser.
3. The frontend posts that token to `POST /api/auth/google`.
4. The backend **verifies the token locally** against your Client ID using Google's
   public keys (`google-auth-library`), then finds or creates the account and
   returns Faheem AI's own session JWT, exactly like email/password login.

The client **secret is not needed** for this flow (only the Client ID is). The
secret only matters for a server-side authorization-code flow, which we do not use.

Email/password sign in keeps working. If `GOOGLE_CLIENT_ID` /
`VITE_GOOGLE_CLIENT_ID` are left blank, the Google button simply does not appear.

---

## 1. Create the OAuth Client ID in Google Cloud Console

1. Go to <https://console.cloud.google.com/> and pick (or create) a project.
2. **APIs & Services > OAuth consent screen**
   - User type: **External**.
   - Fill in app name (Faheem AI), a support email, and a developer contact email.
   - Scopes: the defaults (`openid`, `email`, `profile`) are all that is needed.
   - While the app is in **Testing**, add the Google accounts you will test with
     under **Test users**. Publish the app when you are ready for real students.
3. **APIs & Services > Credentials > Create credentials > OAuth client ID**
   - Application type: **Web application**.
   - **Authorized JavaScript origins**: add every origin the app is served from,
     with exact scheme + host + port and **no trailing slash**. For example:
     - `http://localhost:5173` (local dev: the frontend dev server)
     - `https://faheem.ai` (production)
     - `https://www.faheem.ai` (if you serve www too)
   - **Authorized redirect URIs**: not required for this button flow. You may
     leave it empty (or add your app URL; it is unused here).
4. Click **Create** and copy the **Client ID** (it ends with
   `.apps.googleusercontent.com`). The secret is not used by this flow.

> Important: GIS matches the browser origin **exactly**. `http://localhost:5173`
> and `http://localhost:3000` are different origins, and a random Vite port will
> not match. For local dev, run the frontend on a **fixed** port that you added
> above (5173 is the project default).

## 2. Set the environment variables (the SAME Client ID on both sides)

**Backend** (`backend/.env`):

```
GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
```

**Frontend** (`frontend/.env.local`):

```
VITE_GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
```

Both must be the identical Client ID: the frontend uses it to request the token,
the backend uses it as the audience it will accept.

## 3. Restart both dev servers

Vite only reads `VITE_*` variables at startup, and the backend reads `.env` at
startup, so restart both after editing:

```
# backend
npm --prefix backend run dev
# frontend (fixed port that you authorized above)
npm --prefix frontend run dev -- --port 5173
```

## 4. Test

Open the app, go to Sign in, and tap **Continue with Google**. On success you land
straight in the study workspace. A brand-new Google account starts on the same
7-day free trial as an email signup.

---

## Notes and troubleshooting

- **"origin is not allowed" / the button does nothing**: the current browser
  origin is not in Authorized JavaScript origins, or it has a trailing slash, or
  the port differs. Add the exact origin and wait a minute for Google to
  propagate.
- **Account linking**: if a student already has an email/password account and
  signs in with Google using the same email, the two are linked to one study log
  (matched by email the first time, by Google's stable `sub` id after that).
- **Google-only accounts have no password**: trying to email/password log in to
  one returns "This account uses Google sign in."
- **Production**: set `VITE_GOOGLE_CLIENT_ID` at frontend **build** time and
  `GOOGLE_CLIENT_ID` in the backend environment. Keep the OAuth consent screen
  **Published** so any student (not just test users) can sign in.
- **Security**: never expose `JWT_SECRET`. The Google Client ID is public (it
  ships to the browser); the Google client secret is not used here, so it does
  not need to be deployed.
