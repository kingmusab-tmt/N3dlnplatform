-- Fixed-window rate-limit counters shared by every serverless instance.
-- UNLOGGED: counters are disposable, so skip WAL for speed; a crash just resets them.
CREATE UNLOGGED TABLE IF NOT EXISTS rate_limits (
    bucket        TEXT        NOT NULL,
    window_start  TIMESTAMPTZ NOT NULL,
    count         INTEGER     NOT NULL,
    PRIMARY KEY (bucket, window_start)
);

-- Only the API touches this table.
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
