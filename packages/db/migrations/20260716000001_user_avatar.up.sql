-- user avatar — a small profile image the client can set in the dashboard.
-- Stored as a data: URL (resized client-side to ~96px, so a few KB); a simple
-- TEXT column on users, no storage bucket (founder decision: keep it simple).
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
