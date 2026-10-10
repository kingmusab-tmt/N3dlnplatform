-- API keys for B2B partners and for our own web app.
--
-- Only a SHA-256 hash of each key is stored; the plaintext is shown once when
-- the key is created (server/scripts/keys.js). Keys are long random strings,
-- so a fast hash is sufficient (no need for bcrypt-style stretching).
--
-- kind:
--   partner      rate limit applies to the key as a whole
--   first_party  our Next.js proxy; rate limit applies per end-user IP, which
--                the proxy forwards in X-Forwarded-For
CREATE TABLE IF NOT EXISTS api_keys (
    id                  BIGSERIAL PRIMARY KEY,
    name                TEXT NOT NULL,
    kind                TEXT NOT NULL DEFAULT 'partner',
    key_prefix          TEXT NOT NULL,
    key_hash            TEXT NOT NULL UNIQUE,
    rate_limit_per_min  INTEGER NOT NULL DEFAULT 120,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at        TIMESTAMPTZ,
    revoked_at          TIMESTAMPTZ,

    CONSTRAINT api_keys_kind_valid CHECK (kind IN ('partner', 'first_party')),
    CONSTRAINT api_keys_rate_limit_positive CHECK (rate_limit_per_min > 0),
    CONSTRAINT api_keys_hash_format CHECK (key_hash ~ '^[0-9a-f]{64}$')
);

-- Secrets: never exposed through Supabase's public REST API.
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
