-- Admin area and first-party visitor analytics.

-- Who can open /admin. Rows are added with `npm run admin -- add <email>`
-- (the person must have signed in once) or by another admin.
CREATE TABLE IF NOT EXISTS admin_users (
    user_id     UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    added_by    UUID REFERENCES auth.users (id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per visit. The browser makes up both ids (stored in its own
-- localStorage); there are no cookies and no IP addresses here. A visit ends
-- after 30 minutes without activity.
CREATE TABLE IF NOT EXISTS analytics_sessions (
    id              UUID PRIMARY KEY,
    visitor_id      UUID NOT NULL,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Time the page was actually visible, from 15-second heartbeats.
    active_seconds  INTEGER NOT NULL DEFAULT 0,
    pageviews       INTEGER NOT NULL DEFAULT 0,
    entry_path      TEXT NOT NULL,
    referrer_host   TEXT,
    device          TEXT NOT NULL,
    -- Two-letter country code from the hosting platform (Vercel), if any.
    country         TEXT,

    CONSTRAINT analytics_sessions_device CHECK (device IN ('mobile', 'tablet', 'desktop'))
);
CREATE INDEX IF NOT EXISTS analytics_sessions_started_idx ON analytics_sessions (started_at);
CREATE INDEX IF NOT EXISTS analytics_sessions_visitor_idx ON analytics_sessions (visitor_id, started_at);
CREATE INDEX IF NOT EXISTS analytics_sessions_last_seen_idx ON analytics_sessions (last_seen_at);

CREATE TABLE IF NOT EXISTS analytics_pageviews (
    id          BIGSERIAL PRIMARY KEY,
    session_id  UUID NOT NULL REFERENCES analytics_sessions (id) ON DELETE CASCADE,
    -- Normalised: no query string, and private tokens replaced (/t/[token]).
    path        TEXT NOT NULL,
    at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_pageviews_at_idx ON analytics_pageviews (at);
CREATE INDEX IF NOT EXISTS analytics_pageviews_session_idx ON analytics_pageviews (session_id);

-- Only the server touches these tables.
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_pageviews ENABLE ROW LEVEL SECURITY;
