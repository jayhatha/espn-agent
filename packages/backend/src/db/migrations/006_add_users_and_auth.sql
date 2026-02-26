-- Migration 006: Add users table and authentication

-- Create users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  password_hash TEXT,  -- NULL for OAuth-only users
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),

  -- OAuth fields
  google_id TEXT UNIQUE,
  github_id TEXT UNIQUE,
  oauth_provider TEXT,  -- 'google' | 'github' | 'local'

  -- Profile
  display_name TEXT,
  avatar_url TEXT,

  -- Tracking
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMP
);

-- Link users to their teams (each user owns one team per league)
ALTER TABLE team ADD COLUMN user_id INTEGER REFERENCES users(id);
CREATE INDEX idx_team_user_id ON team(user_id);

-- Create indexes for auth lookups
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_google_id ON users(google_id);
CREATE INDEX idx_users_github_id ON users(github_id);
