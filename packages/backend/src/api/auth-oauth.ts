import { FastifyInstance } from "fastify";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as GitHubStrategy } from "passport-github2";
import { getDb } from "../db/connection.js";
import { setAuthCookies, issueTokenPair } from "../utils/auth-cookies.js";

export async function setupOAuth(fastify: FastifyInstance) {
  // Google OAuth Strategy
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        callbackURL: process.env.GOOGLE_CALLBACK_URL!,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          // Check if user exists with this Google ID
          let user = await getDb()
            .selectFrom("users")
            .selectAll()
            .where("google_id", "=", profile.id)
            .executeTakeFirst();

          if (!user) {
            // Check if email exists (link accounts)
            const email = profile.emails?.[0]?.value;
            if (email) {
              user = await getDb()
                .selectFrom("users")
                .selectAll()
                .where("email", "=", email)
                .executeTakeFirst();

              if (user) {
                // Link Google account to existing user
                user = await getDb()
                  .updateTable("users")
                  .set({
                    google_id: profile.id,
                    avatar_url: profile.photos?.[0]?.value || null,
                  })
                  .where("id", "=", user.id)
                  .returningAll()
                  .executeTakeFirstOrThrow();
              }
            }

            // Create new user
            if (!user) {
              user = await getDb()
                .insertInto("users")
                .values({
                  email:
                    profile.emails?.[0]?.value ||
                    `google_${profile.id}@oauth.local`,
                  google_id: profile.id,
                  display_name: profile.displayName,
                  avatar_url: profile.photos?.[0]?.value || null,
                  oauth_provider: "google",
                  role: "user",
                  email_verified: true,
                })
                .returningAll()
                .executeTakeFirstOrThrow();
            }
          }

          // Update last login
          await getDb()
            .updateTable("users")
            .set({ last_login_at: new Date() })
            .where("id", "=", user.id)
            .execute();

          return done(null, user);
        } catch (error) {
          return done(error as Error);
        }
      },
    ),
  );

  // GitHub OAuth Strategy
  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID!,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        callbackURL: process.env.GITHUB_CALLBACK_URL!,
      },
      async (
        _accessToken: string,
        _refreshToken: string,
        profile: any,
        done: any,
      ) => {
        try {
          // Similar logic to Google OAuth
          let user = await getDb()
            .selectFrom("users")
            .selectAll()
            .where("github_id", "=", profile.id)
            .executeTakeFirst();

          if (!user) {
            const email = profile.emails?.[0]?.value;
            if (email) {
              user = await getDb()
                .selectFrom("users")
                .selectAll()
                .where("email", "=", email)
                .executeTakeFirst();

              if (user) {
                user = await getDb()
                  .updateTable("users")
                  .set({
                    github_id: profile.id,
                    avatar_url: profile.photos?.[0]?.value || null,
                  })
                  .where("id", "=", user.id)
                  .returningAll()
                  .executeTakeFirstOrThrow();
              }
            }

            if (!user) {
              user = await getDb()
                .insertInto("users")
                .values({
                  email: email || `github_${profile.id}@oauth.local`,
                  github_id: profile.id,
                  display_name: profile.displayName || profile.username,
                  avatar_url: profile.photos?.[0]?.value || null,
                  oauth_provider: "github",
                  role: "user",
                  email_verified: true,
                })
                .returningAll()
                .executeTakeFirstOrThrow();
            }
          }

          await getDb()
            .updateTable("users")
            .set({ last_login_at: new Date() })
            .where("id", "=", user.id)
            .execute();

          return done(null, user);
        } catch (error) {
          return done(error as Error);
        }
      },
    ),
  );

  // OAuth routes
  fastify.get("/api/auth/google", (request, reply) => {
    passport.authenticate("google", {
      scope: ["profile", "email"],
      session: false,
    })(request, reply);
  });

  fastify.get("/api/auth/google/callback", (request, reply) => {
    passport.authenticate(
      "google",
      { session: false },
      async (err: Error | null, user: any) => {
        if (err || !user) {
          return reply.redirect(
            `${process.env.FRONTEND_URL}/login?error=oauth_failed`,
          );
        }

        // Issue token pair and set HttpOnly cookies
        const tokens = await issueTokenPair(fastify, {
          id: user.id,
          email: user.email,
          role: user.role,
        });
        setAuthCookies(reply, tokens.accessToken, tokens.refreshToken);

        // Redirect WITHOUT token in URL
        return reply.redirect(
          `${process.env.FRONTEND_URL}/auth/callback`,
        );
      },
    )(request, reply);
  });

  fastify.get("/api/auth/github", (request, reply) => {
    passport.authenticate("github", {
      scope: ["user:email"],
      session: false,
    })(request, reply);
  });

  fastify.get("/api/auth/github/callback", (request, reply) => {
    passport.authenticate(
      "github",
      { session: false },
      async (err: Error | null, user: any) => {
        if (err || !user) {
          return reply.redirect(
            `${process.env.FRONTEND_URL}/login?error=oauth_failed`,
          );
        }

        // Issue token pair and set HttpOnly cookies
        const tokens = await issueTokenPair(fastify, {
          id: user.id,
          email: user.email,
          role: user.role,
        });
        setAuthCookies(reply, tokens.accessToken, tokens.refreshToken);

        // Redirect WITHOUT token in URL
        return reply.redirect(
          `${process.env.FRONTEND_URL}/auth/callback`,
        );
      },
    )(request, reply);
  });
}
