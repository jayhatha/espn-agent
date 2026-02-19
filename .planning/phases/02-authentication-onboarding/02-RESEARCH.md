# Phase 2: Authentication & Onboarding - Research

**Researched:** 2026-02-19
**Domain:** Authentication (JWT, OAuth 2.0), User Onboarding UX
**Confidence:** HIGH

## Summary

Phase 2 implements user authentication with email/password and OAuth providers (Google, GitHub), plus guided onboarding for new users. The codebase already has substantial auth infrastructure in place: JWT authentication with @fastify/jwt, OAuth flows with Passport.js, middleware for route protection, and frontend AuthContext with login/signup pages. Research focuses on completing the implementation with token refresh, secured cookies, onboarding flow, and integration with existing routes.

**Primary recommendation:** Leverage existing auth code, add refresh token rotation for security, implement progressive onboarding flow that guides new users through: account creation → league connection → projections upload → dashboard.

**Key Gap:** Current implementation uses localStorage for tokens (client-side XSS risk) and lacks refresh token rotation. Best practice for 2026 is HttpOnly cookies with automatic token refresh.

## <phase_requirements>

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | User can create account with email and password | Email/password signup already implemented in `/api/auth/signup` with bcrypt hashing (10 rounds). Need to validate against 2026 security standards (13-14 rounds recommended). |
| AUTH-02 | User can log in and stay logged in across sessions (JWT) | JWT auth implemented with 7-day expiration. Missing: refresh token rotation, HttpOnly cookies, automatic silent refresh. Current localStorage approach has XSS vulnerability. |
| AUTH-03 | User can log in via Google OAuth | Google OAuth implemented via Passport.js with account linking. Need to add PKCE for enhanced security (OAuth 2.1 requirement). |
| AUTH-04 | User can log in via GitHub OAuth | GitHub OAuth implemented via Passport.js. Same PKCE enhancement needed. |
| AUTH-05 | New user sees guided onboarding | Not implemented. Research shows progressive disclosure pattern: defer signup, personalize with smart questions, give quick wins, use in-app messages. |

</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @fastify/jwt | ^8.0.0 | JWT signing and verification | Official Fastify plugin, battle-tested, integrates with request.jwtVerify() |
| bcryptjs | ^2.4.3 | Password hashing | Industry standard, adaptive work factor, resistant to rainbow tables |
| passport | ^0.7.0 | OAuth authentication | De facto standard for Node.js OAuth, 24k+ stars, supports 500+ strategies |
| passport-google-oauth20 | ^2.0.0 | Google OAuth strategy | Official Google OAuth 2.0 strategy for Passport |
| passport-github2 | ^0.1.12 | GitHub OAuth strategy | Active fork supporting OAuth 2.0 for GitHub |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @fastify/cookie | Latest | Secure cookie management | Required for HttpOnly token storage (more secure than localStorage) |
| zod | ^3.22.4 | Request validation | Already installed - use for validating auth payloads |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Passport.js | @fastify/oauth2 | Fastify-native OAuth but less mature, fewer strategies, harder multi-provider setup |
| bcryptjs | argon2 | Argon2 is newer winner of Password Hashing Competition but bcryptjs sufficient for v1, consider for v2 |
| Custom JWT | jose library | jose is more modern JOSE implementation but @fastify/jwt well-integrated with Fastify ecosystem |

**Installation:**

```bash
# Backend - already installed
cd packages/backend
# Already have: @fastify/jwt, bcryptjs, passport, passport-google-oauth20, passport-github2

# Add for secure cookies
pnpm add @fastify/cookie

# Frontend - no additional auth libraries needed (using native fetch + React Context)
```

## Architecture Patterns

### Recommended Project Structure

**Already Exists:**
```
packages/backend/src/
├── middleware/
│   └── auth.ts              # authenticate, requireAdmin, requireLeagueAccess, requireTeamOwnership
├── api/
│   ├── auth.ts              # Email/password signup, login, logout, /me
│   └── auth-oauth.ts        # OAuth flows (Google, GitHub)
packages/frontend/src/
├── contexts/
│   └── AuthContext.tsx      # Global auth state, login/signup/logout methods
├── app/
│   ├── login/
│   ├── signup/
│   └── auth/callback/       # OAuth redirect handler
```

**Needs to be Added:**
```
packages/backend/src/
├── api/
│   └── auth.ts              # Add: POST /api/auth/refresh (refresh token endpoint)
packages/frontend/src/
├── app/
│   └── onboarding/
│       └── page.tsx         # Progressive onboarding flow
├── components/
│   ├── OnboardingWizard.tsx # Multi-step wizard component
│   └── ProtectedRoute.tsx   # Route guard component (optional - can use middleware.ts)
```

### Pattern 1: JWT with Refresh Token Rotation

**What:** Dual-token system with short-lived access token and long-lived refresh token that rotates on each use.

**When to use:** Production authentication where security and UX both matter.

**Current State (v0.1):**
- Access token: 7 days, stored in localStorage
- No refresh token
- Vulnerability: XSS can steal long-lived token

**2026 Best Practice:**
```typescript
// Backend: packages/backend/src/api/auth.ts
// Source: https://auth0.com/blog/refresh-tokens-what-are-they-and-when-to-use-them/

interface TokenPair {
  accessToken: string;   // 15 minutes
  refreshToken: string;  // 7 days
}

// On login/signup, issue both tokens
const accessToken = fastify.jwt.sign(
  { userId: user.id, email: user.email, role: user.role },
  { expiresIn: '15m' }
);

const refreshToken = fastify.jwt.sign(
  { userId: user.id, type: 'refresh' },
  { expiresIn: '7d' }
);

// Store refresh token hash in database (for rotation tracking)
await db.insertInto('refresh_tokens').values({
  user_id: user.id,
  token_hash: await bcrypt.hash(refreshToken, 10),
  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
});

// Set as HttpOnly cookies (NOT accessible to JavaScript)
reply.setCookie('accessToken', accessToken, {
  httpOnly: true,
  secure: true,           // HTTPS only
  sameSite: 'strict',     // CSRF protection
  path: '/',
  maxAge: 15 * 60,        // 15 minutes
});

reply.setCookie('refreshToken', refreshToken, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/api/auth/refresh',  // Only sent to refresh endpoint
  maxAge: 7 * 24 * 60 * 60,   // 7 days
});
```

**Frontend: Automatic Silent Refresh**
```typescript
// packages/frontend/src/lib/auth.ts
// Source: https://itsnikhil.medium.com/implementing-silent-refresh-of-jwt-5700edbea817

// Axios interceptor pattern (or native fetch with retry)
let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

async function fetchAPI(endpoint: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    credentials: 'include', // Send cookies
  });

  if (res.status === 401) {
    // Token expired - try refresh
    if (!isRefreshing) {
      isRefreshing = true;
      try {
        await fetch(`${API_URL}/api/auth/refresh`, {
          method: 'POST',
          credentials: 'include', // Send refresh token cookie
        });
        isRefreshing = false;
        // Retry original request
        return fetch(`${API_URL}${endpoint}`, {
          ...options,
          credentials: 'include',
        });
      } catch {
        // Refresh failed - logout
        window.location.href = '/login';
        throw new Error('Session expired');
      }
    }
  }

  return res;
}

// Timer-based pre-emptive refresh (backup strategy)
// Start countdown on login to refresh 1 minute before expiration
useEffect(() => {
  const refreshInterval = setInterval(() => {
    fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {
      // Silent fail - user will be logged out on next request
      clearInterval(refreshInterval);
    });
  }, 14 * 60 * 1000); // Refresh every 14 minutes (access token is 15min)

  return () => clearInterval(refreshInterval);
}, []);
```

### Pattern 2: OAuth with PKCE (Proof Key for Code Exchange)

**What:** Enhanced OAuth flow that prevents authorization code interception attacks.

**When to use:** All OAuth flows in 2026 (required by OAuth 2.1, recommended by Auth0/Google).

**Why:** Without PKCE, attacker can intercept authorization code and exchange it for tokens.

**Current State:** Passport.js strategies don't use PKCE by default.

**2026 Requirement:**
```typescript
// packages/backend/src/api/auth-oauth.ts
// Source: https://datatracker.ietf.org/doc/html/rfc7636

// Option 1: Use @fastify/oauth2 instead of Passport (supports PKCE)
// Option 2: Extend Passport strategies with PKCE support

// Recommended: @fastify/oauth2 for PKCE support
import fastifyOAuth2 from '@fastify/oauth2';

fastify.register(fastifyOAuth2, {
  name: 'googleOAuth2',
  credentials: {
    client: {
      id: process.env.GOOGLE_CLIENT_ID!,
      secret: process.env.GOOGLE_CLIENT_SECRET!,
    },
    auth: fastifyOAuth2.GOOGLE_CONFIGURATION,
  },
  startRedirectPath: '/api/auth/google',
  callbackUri: process.env.GOOGLE_CALLBACK_URL!,
  pkce: 'S256', // Use SHA-256 for code challenge
  scope: ['profile', 'email'],
});

// Cookie-based state storage (required for PKCE)
// @fastify/oauth2 requires @fastify/cookie (v7.2.0+)
```

**Tradeoff:** Switching from Passport to @fastify/oauth2 requires rewriting OAuth routes. For Phase 2, can keep Passport but flag PKCE as Phase 3 enhancement.

### Pattern 3: Progressive Onboarding

**What:** Multi-step wizard that guides new users through setup without overwhelming them.

**When to use:** After successful signup/login, detect if user has no leagues connected.

**Flow:**
```
1. User signs up/logs in
2. Check: user.leagues.length === 0?
3. If yes → redirect to /onboarding
4. Steps:
   Step 1: Welcome + explain value prop (skip button available)
   Step 2: Connect first league (ESPN league ID + auth)
   Step 3: Upload projections (optional - can skip)
   Step 4: Choose your team (if league has >1 team)
   Step 5: Success! Redirect to dashboard
```

**Example Component:**
```typescript
// packages/frontend/src/components/OnboardingWizard.tsx
// Source: https://userpilot.com/blog/progressive-disclosure-examples/

const ONBOARDING_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to ESPN Fantasy Baseball Assistant',
    canSkip: true,
    component: WelcomeStep,
  },
  {
    id: 'connect-league',
    title: 'Connect Your League',
    canSkip: false,
    component: ConnectLeagueStep,
  },
  {
    id: 'upload-projections',
    title: 'Upload Projections (Optional)',
    canSkip: true,
    component: UploadProjectionsStep,
  },
  {
    id: 'select-team',
    title: 'Choose Your Team',
    canSkip: false,
    component: SelectTeamStep,
    condition: (context) => context.league?.teams.length > 1,
  },
  {
    id: 'complete',
    title: 'All Set!',
    canSkip: false,
    component: CompleteStep,
  },
];

export function OnboardingWizard() {
  const [currentStep, setCurrentStep] = useState(0);
  const [context, setContext] = useState({});

  const step = ONBOARDING_STEPS[currentStep];

  return (
    <div className="max-w-2xl mx-auto p-8">
      {/* Progress indicator */}
      <div className="flex gap-2 mb-8">
        {ONBOARDING_STEPS.map((s, i) => (
          <div
            key={s.id}
            className={`flex-1 h-2 rounded ${
              i <= currentStep ? 'bg-blue-600' : 'bg-gray-200'
            }`}
          />
        ))}
      </div>

      {/* Step content */}
      <step.component
        context={context}
        onComplete={(data) => {
          setContext({ ...context, ...data });
          setCurrentStep(currentStep + 1);
        }}
        onSkip={
          step.canSkip
            ? () => setCurrentStep(currentStep + 1)
            : undefined
        }
      />
    </div>
  );
}
```

### Pattern 4: Route Protection (Multi-Layer Defense)

**What:** Verify authentication at multiple layers - middleware for fast rejection, route handlers for authorization.

**Why:** Defense-in-depth - middleware alone is insufficient if someone bypasses it.

**Current State:** Middleware exists (`authenticate`, `requireLeagueAccess`, `requireTeamOwnership`) but not applied to all routes.

**Implementation:**
```typescript
// Backend: Apply middleware to protected routes
// packages/backend/src/api/leagues.ts

import { authenticate, requireLeagueAccess } from '../middleware/auth.js';

export async function leaguesRoutes(fastify: FastifyInstance) {
  // Public: No middleware
  // (None - all league routes require auth)

  // Authenticated: User must be logged in
  fastify.get('/api/leagues', {
    onRequest: [authenticate],
  }, async (request, reply) => {
    // Filter to user's leagues only
    const leagues = await db
      .selectFrom('league')
      .innerJoin('team', 'team.league_id', 'league.id')
      .where('team.user_id', '=', request.user.userId)
      .selectAll('league')
      .execute();

    return reply.send(leagues);
  });

  // Authorized: User must own a team in this league
  fastify.get('/api/leagues/:id/status', {
    onRequest: [authenticate, requireLeagueAccess],
  }, async (request, reply) => {
    // user verified to have team in league - safe to proceed
    const leagueId = parseInt(request.params.id, 10);
    // ... fetch status
  });
}
```

**Frontend: Protected Route Component (Optional)**
```typescript
// packages/frontend/src/components/ProtectedRoute.tsx

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}

// Usage in pages
export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <Dashboard />
    </ProtectedRoute>
  );
}
```

**Alternative: Next.js middleware.ts**
```typescript
// packages/frontend/middleware.ts
// Source: https://nextjs.org/docs/app/guides/authentication

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('accessToken')?.value;

  // Protect /leagues/* routes
  if (request.nextUrl.pathname.startsWith('/leagues')) {
    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  // Redirect authenticated users away from login/signup
  if (request.nextUrl.pathname.startsWith('/login') ||
      request.nextUrl.pathname.startsWith('/signup')) {
    if (token) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/leagues/:path*', '/login', '/signup'],
};
```

### Anti-Patterns to Avoid

- **localStorage for tokens:** XSS-vulnerable. Use HttpOnly cookies instead.
- **Long-lived access tokens without refresh:** If stolen, attacker has access until expiration. Use short access tokens + refresh rotation.
- **No PKCE on OAuth:** Authorization code interception attack. Add PKCE or plan for Phase 3.
- **Skipping bcrypt salt rounds update:** Default 10 rounds is outdated. Use 13-14 for 2026.
- **Blocking onboarding:** Forcing all steps causes drop-off. Allow skipping optional steps.
- **Middleware-only auth:** Bypass risk. Always verify in route handler too.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Password hashing | Custom crypto | bcryptjs with 13+ rounds | Timing attacks, rainbow tables, work factor management already solved |
| JWT signing/verification | Custom base64+HMAC | @fastify/jwt | Algorithm confusion attacks, key management, expiration handling |
| OAuth flows | Custom redirect handling | Passport.js or @fastify/oauth2 | State parameter, CSRF protection, PKCE, token exchange security |
| Session management | Custom token storage | @fastify/cookie with secure flags | HttpOnly, Secure, SameSite flags prevent XSS/CSRF |
| Email validation | Regex only | Zod schema + email existence check | DNS MX lookup, disposable email detection, Unicode edge cases |

**Key insight:** Authentication has decades of security research. Using battle-tested libraries prevents entire categories of vulnerabilities (timing attacks, token fixation, session hijacking, CSRF).

## Common Pitfalls

### Pitfall 1: localStorage Token Storage (XSS Vulnerability)

**What goes wrong:** Storing JWT in localStorage makes it accessible to any injected JavaScript. If attacker gets XSS, they steal long-lived token.

**Why it happens:** Simple API, works across tabs, no cookie complexity.

**How to avoid:** Use HttpOnly cookies - JavaScript cannot access them. Requires `credentials: 'include'` on fetch calls.

**Warning signs:**
- `localStorage.setItem('auth_token', token)`
- `Authorization: Bearer ${localStorage.getItem('token')}`

**Current codebase status:** Already using localStorage in AuthContext.tsx (lines 42, 50, 75, 90, 100). **MUST migrate to cookies.**

### Pitfall 2: Insufficient bcrypt Rounds (Outdated Security)

**What goes wrong:** Using 10 salt rounds (current setting) is too low for 2026. GPUs can crack at ~10,000 hashes/sec.

**Why it happens:** bcrypt default hasn't changed, but hardware improved.

**How to avoid:** Use 13-14 rounds for 2026. Each increment doubles computation time.

**Warning signs:**
- `bcrypt.hash(password, 10)` in codebase

**Current codebase status:** auth.ts line 49 uses 10 rounds. **MUST increase to 13.**

**Impact:** At 10 rounds, 8-character password cracked in hours. At 13 rounds, days/weeks.

### Pitfall 3: No Token Refresh = Poor UX

**What goes wrong:** User gets 401 mid-session because 15-minute token expired. Forced to re-login.

**Why it happens:** Balancing security (short tokens) vs UX (long sessions).

**How to avoid:** Implement silent refresh - automatically get new access token before expiration using refresh token.

**Warning signs:**
- Users complain "logged out randomly"
- No `/api/auth/refresh` endpoint

**Current codebase status:** No refresh endpoint exists. **MUST implement.**

### Pitfall 4: OAuth Without PKCE (Authorization Code Interception)

**What goes wrong:** Attacker intercepts authorization code (e.g., on public WiFi) and exchanges it for tokens before victim.

**Why it happens:** Original OAuth 2.0 spec predates mobile/SPA security concerns.

**How to avoid:** Use PKCE (code verifier + code challenge). OAuth 2.1 makes it mandatory.

**Warning signs:**
- Passport strategies without `pkce: 'S256'`
- @fastify/oauth2 without `pkce` config

**Current codebase status:** Passport.js strategies don't use PKCE. **Can defer to Phase 3 or migrate to @fastify/oauth2.**

### Pitfall 5: Missing Onboarding = High Bounce Rate

**What goes wrong:** New user signs up, sees empty dashboard, doesn't know what to do, leaves.

**Why it happens:** Assuming users know the product flow.

**How to avoid:** Progressive onboarding - detect empty state, show guided wizard.

**Warning signs:**
- Signup redirects directly to dashboard
- No first-time user flow

**Current codebase status:** No onboarding flow exists. **MUST implement.**

### Pitfall 6: Trusting Only Middleware (Bypass Risk)

**What goes wrong:** Developer assumes middleware protects route, but misconfiguration or bypass allows unauthorized access.

**Why it happens:** Single point of failure.

**How to avoid:** Defense-in-depth - verify user/league ownership in route handler too.

**Warning signs:**
- Route handler doesn't check `request.user`
- Relying solely on `onRequest: [authenticate]`

**Current codebase status:** Middleware exists but not consistently applied. **Phase 1 already addressed via INFR-01. Validate coverage.**

## Code Examples

Verified patterns from official sources and existing codebase.

### Email/Password Signup (Enhanced Security)

```typescript
// packages/backend/src/api/auth.ts
// Enhanced from existing code with 2026 security standards

fastify.post("/api/auth/signup", async (request, reply) => {
  const { email, password, displayName } = request.body as {
    email: string;
    password: string;
    displayName?: string;
  };

  // Validate with Zod (stronger than regex)
  const schema = z.object({
    email: z.string().email().min(5).max(255),
    password: z.string()
      .min(8)
      .max(128)
      .regex(/[A-Z]/, "Must contain uppercase")
      .regex(/[a-z]/, "Must contain lowercase")
      .regex(/[0-9]/, "Must contain number")
      .regex(/[^A-Za-z0-9]/, "Must contain special character"),
    displayName: z.string().max(100).optional(),
  });

  try {
    schema.parse({ email, password, displayName });
  } catch (err) {
    return reply.code(400).send({ error: "Invalid input", details: err });
  }

  // Check if user exists
  const existing = await db
    .selectFrom("users")
    .select("id")
    .where("email", "=", email.toLowerCase())
    .executeTakeFirst();

  if (existing) {
    return reply.code(409).send({ error: "Email already registered" });
  }

  // Hash with 13 rounds (2026 standard)
  // Source: https://auth0.com/blog/hashing-in-action-understanding-bcrypt/
  const passwordHash = await bcrypt.hash(password, 13);

  // Create user
  const user = await db
    .insertInto("users")
    .values({
      email: email.toLowerCase(),
      password_hash: passwordHash,
      display_name: displayName || null,
      oauth_provider: "local",
      role: "user",
      email_verified: false, // Email verification can be Phase 3
    })
    .returning(["id", "email", "role", "display_name", "avatar_url"])
    .executeTakeFirstOrThrow();

  // Generate tokens
  const accessToken = fastify.jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    { expiresIn: '15m' }
  );

  const refreshToken = fastify.jwt.sign(
    { userId: user.id, type: 'refresh' },
    { expiresIn: '7d' }
  );

  // Store refresh token (for rotation tracking)
  await db.insertInto('refresh_tokens').values({
    user_id: user.id,
    token_hash: await bcrypt.hash(refreshToken, 10),
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    created_at: new Date(),
  });

  // Set HttpOnly cookies
  reply.setCookie('accessToken', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 15 * 60,
  });

  reply.setCookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60,
  });

  return reply.send({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
    },
  });
});
```

### Token Refresh Endpoint

```typescript
// packages/backend/src/api/auth.ts
// Source: https://auth0.com/blog/refresh-tokens-what-are-they-and-when-to-use-them/

fastify.post("/api/auth/refresh", async (request, reply) => {
  const refreshToken = request.cookies.refreshToken;

  if (!refreshToken) {
    return reply.code(401).send({ error: "No refresh token" });
  }

  try {
    // Verify refresh token
    const decoded = fastify.jwt.verify<{ userId: number; type: string }>(refreshToken);

    if (decoded.type !== 'refresh') {
      return reply.code(401).send({ error: "Invalid token type" });
    }

    // Check if token is in database (not revoked)
    const storedToken = await db
      .selectFrom('refresh_tokens')
      .select(['token_hash', 'expires_at'])
      .where('user_id', '=', decoded.userId)
      .where('expires_at', '>', new Date())
      .executeTakeFirst();

    if (!storedToken) {
      return reply.code(401).send({ error: "Token revoked or expired" });
    }

    // Verify hash matches
    const valid = await bcrypt.compare(refreshToken, storedToken.token_hash);
    if (!valid) {
      return reply.code(401).send({ error: "Invalid token" });
    }

    // Get user
    const user = await db
      .selectFrom('users')
      .select(['id', 'email', 'role'])
      .where('id', '=', decoded.userId)
      .executeTakeFirst();

    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    // Issue new access token
    const newAccessToken = fastify.jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      { expiresIn: '15m' }
    );

    // Rotate refresh token (best practice)
    const newRefreshToken = fastify.jwt.sign(
      { userId: user.id, type: 'refresh' },
      { expiresIn: '7d' }
    );

    // Delete old refresh token
    await db
      .deleteFrom('refresh_tokens')
      .where('user_id', '=', user.id)
      .execute();

    // Store new refresh token
    await db.insertInto('refresh_tokens').values({
      user_id: user.id,
      token_hash: await bcrypt.hash(newRefreshToken, 10),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      created_at: new Date(),
    });

    // Update cookies
    reply.setCookie('accessToken', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 15 * 60,
    });

    reply.setCookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: 7 * 24 * 60 * 60,
    });

    return reply.send({ success: true });
  } catch (err) {
    return reply.code(401).send({ error: "Invalid refresh token" });
  }
});
```

### Frontend Auth Context (Cookie-Based)

```typescript
// packages/frontend/src/contexts/AuthContext.tsx
// Updated to use cookies instead of localStorage

"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Check auth on mount (cookies sent automatically)
  useEffect(() => {
    fetch(`${API_URL}/api/auth/me`, {
      credentials: 'include', // Send cookies
    })
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(userData => {
        setUser(userData);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  // Auto-refresh access token before expiration
  useEffect(() => {
    if (!user) return;

    // Refresh every 14 minutes (access token is 15min)
    const interval = setInterval(() => {
      fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      }).catch(() => {
        // Silent fail - next request will trigger logout
        clearInterval(interval);
      });
    }, 14 * 60 * 1000);

    return () => clearInterval(interval);
  }, [user]);

  const login = async (email: string, password: string) => {
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Receive cookies
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Login failed');
      }

      const { user: userData } = await res.json();
      setUser(userData);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  };

  const logout = async () => {
    await fetch(`${API_URL}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    setUser(null);
    router.push('/');
  };

  // ... rest of context
}
```

### Onboarding Flow Detection

```typescript
// packages/frontend/src/app/page.tsx
// Redirect new users to onboarding

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      // Not logged in - show landing page
      return;
    }

    // Check if user needs onboarding
    fetch(`/api/leagues`, { credentials: 'include' })
      .then(res => res.json())
      .then(leagues => {
        if (leagues.length === 0) {
          // No leagues - start onboarding
          router.push('/onboarding');
        } else {
          // Has leagues - go to dashboard
          router.push(`/leagues/${leagues[0].id}`);
        }
      });
  }, [user, loading, router]);

  // Landing page for logged-out users
  return (
    <div className="min-h-screen">
      <h1>ESPN Fantasy Baseball Assistant</h1>
      <p>Get AI-powered recommendations for your fantasy league</p>
      <Link href="/signup">Get Started</Link>
      <Link href="/login">Sign In</Link>
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| localStorage tokens | HttpOnly cookies | 2018+ (OWASP) | XSS cannot steal tokens |
| Single long-lived JWT | Access + refresh token rotation | 2020+ | Stolen access token limited to 15min |
| OAuth 2.0 without PKCE | OAuth 2.0 with PKCE | OAuth 2.1 spec (2021+) | Prevents code interception |
| bcrypt 10 rounds | bcrypt 13-14 rounds | 2026 (GPU advances) | Brute-force resistance maintained |
| All-at-once onboarding | Progressive disclosure | Modern UX (2020+) | Reduces cognitive load, higher completion |

**Deprecated/outdated:**
- **OAuth 1.0:** Replaced by OAuth 2.0 (simpler flow, better mobile support)
- **MD5/SHA1 password hashing:** Broken by collisions, use bcrypt/argon2
- **Session IDs in URL parameters:** CSRF risk, use cookies with SameSite
- **Passport.js without PKCE:** Still works but not OAuth 2.1 compliant

## Open Questions

1. **Should we implement PKCE in Phase 2 or defer to Phase 3?**
   - What we know: OAuth currently works without PKCE (Passport.js handles basic flow)
   - What's unclear: Is migration to @fastify/oauth2 in scope for Phase 2?
   - Recommendation: Keep Passport.js for Phase 2 (minimal changes), add PKCE as Phase 3 security enhancement. Document as known limitation.

2. **Should we implement email verification in Phase 2?**
   - What we know: Users table has `email_verified` column (defaults to FALSE)
   - What's unclear: Is preventing unverified-email signups critical for v1?
   - Recommendation: Defer to Phase 3. Allow signups without verification for now (faster user acquisition). Flag as technical debt.

3. **How granular should onboarding steps be?**
   - What we know: Progressive disclosure recommends 3-5 steps max
   - What's unclear: Should we combine "upload projections + select team" or keep separate?
   - Recommendation: 4 steps - Welcome (skippable) → Connect League → Select Team → Complete. Upload projections can be suggested on dashboard after onboarding (less friction).

4. **Should refresh tokens be stored hashed or encrypted in database?**
   - What we know: Research examples show hashed with bcrypt
   - What's unclear: Is hashing sufficient or should we encrypt?
   - Recommendation: Hash with bcrypt (10 rounds for tokens, not passwords). If attacker has database access, game over anyway. Keep it simple.

## Sources

### Primary (HIGH confidence)

- [GitHub - @fastify/jwt](https://github.com/fastify/fastify-jwt) - Official Fastify JWT plugin
- [GitHub - @fastify/oauth2](https://github.com/fastify/fastify-oauth2) - Official Fastify OAuth2 plugin with PKCE
- [Auth0: Refresh Tokens - What Are They and When to Use Them](https://auth0.com/blog/refresh-tokens-what-are-they-and-when-to-use-them/) - Token rotation best practices
- [Auth0: Hashing in Action - Understanding bcrypt](https://auth0.com/blog/hashing-in-action-understanding-bcrypt/) - bcrypt salt rounds explained
- [Next.js Docs: Authentication](https://nextjs.org/docs/app/guides/authentication) - Official Next.js 14 App Router auth guidance
- [RFC 7636: PKCE](https://datatracker.ietf.org/doc/html/rfc7636) - Official OAuth PKCE specification

### Secondary (MEDIUM confidence)

- [Medium: Implementing Silent Refresh of JWT](https://itsnikhil.medium.com/implementing-silent-refresh-of-jwt-5700edbea817) - Silent refresh implementation pattern
- [Userpilot: Progressive Disclosure Examples](https://userpilot.com/blog/progressive-disclosure-examples/) - Onboarding UX patterns
- [GeeksforGeeks: JWT Authentication With Refresh Tokens](https://www.geeksforgeeks.org/jwt-authentication-with-refresh-tokens/) - Refresh token implementation
- [Medium: OAuth 2.0 Security Best Practices - From Authorization Code to PKCE](https://medium.com/@basakerdogan/oauth-2-0-security-best-practices-from-authorization-code-to-pkce-beccdbe7ec35) - PKCE security benefits
- [WorkOS: Building Authentication in Next.js App Router 2026](https://workos.com/blog/nextjs-app-router-authentication-guide-2026) - Next.js auth patterns

### Tertiary (LOW confidence)

- [Formbricks: 7 User Onboarding Best Practices for 2026](https://formbricks.com/blog/user-onboarding-best-practices) - General UX advice (not code-specific)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Libraries already installed and battle-tested
- Architecture (JWT + Refresh): HIGH - Industry standard pattern, well-documented
- Architecture (OAuth PKCE): MEDIUM - Requires library migration (Passport → @fastify/oauth2)
- Architecture (Onboarding): MEDIUM - Pattern clear, but implementation details flexible
- Pitfalls: HIGH - Based on OWASP, official docs, and existing codebase audit

**Research date:** 2026-02-19
**Valid until:** 2026-04-19 (60 days - auth standards stable, but check for CVEs monthly)
