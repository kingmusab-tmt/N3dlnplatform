-- Dispatch: delivery runs (one rider trip with ordered stops), deliveries
-- (one per stop, with a public tracking link and proof of delivery), and
-- proof-of-delivery photos.

CREATE TABLE IF NOT EXISTS delivery_runs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- The rider's phone proves it controls the run with this secret; only its
    -- SHA-256 hash is stored.
    rider_token_hash    TEXT NOT NULL,
    created_by_key_id   BIGINT REFERENCES api_keys (id) ON DELETE SET NULL,
    created_by_user_id  UUID REFERENCES auth.users (id) ON DELETE SET NULL,
    profile             TEXT NOT NULL DEFAULT 'driving',
    status              TEXT NOT NULL DEFAULT 'active',
    -- Last known rider position, for customers' tracking pages.
    position            geometry(Point, 4326),
    heading             REAL,
    position_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at            TIMESTAMPTZ,

    CONSTRAINT delivery_runs_profile_valid CHECK (profile IN ('driving', 'cycling', 'walking')),
    CONSTRAINT delivery_runs_status_valid CHECK (status IN ('active', 'ended'))
);

CREATE TABLE IF NOT EXISTS deliveries (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id           UUID NOT NULL REFERENCES delivery_runs (id) ON DELETE CASCADE,
    stop_index       INTEGER NOT NULL,
    building_id      BIGINT NOT NULL REFERENCES buildings (id),
    -- Route to the owner's gate when the stop came from a share link.
    claim_id         UUID REFERENCES claims (id) ON DELETE SET NULL,
    recipient_name   TEXT,
    -- Public link for the customer: /t/<tracking_token>.
    tracking_token   UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    -- Optional 4-digit code the customer gives the rider (proof of delivery).
    -- Shown only to whoever created the delivery, never on the tracking page.
    pod_code         TEXT,
    status           TEXT NOT NULL DEFAULT 'pending',
    eta_s            INTEGER,
    remaining_m      INTEGER,
    delivered_at     TIMESTAMPTZ,
    received_by      TEXT,
    pod_method       TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT deliveries_status_valid CHECK (status IN ('pending', 'en_route', 'arrived', 'delivered', 'failed')),
    CONSTRAINT deliveries_pod_code_format CHECK (pod_code IS NULL OR pod_code ~ '^[0-9]{4}$'),
    CONSTRAINT deliveries_pod_method_valid CHECK (pod_method IS NULL OR pod_method IN ('code', 'photo', 'code+photo')),
    CONSTRAINT deliveries_stop_unique UNIQUE (run_id, stop_index)
);
CREATE INDEX IF NOT EXISTS deliveries_run_idx ON deliveries (run_id);

-- Proof-of-delivery photos, kept out of the main table. The API resizes
-- photos on the phone and caps them at 1.5 MB.
CREATE TABLE IF NOT EXISTS delivery_photos (
    delivery_id   UUID PRIMARY KEY REFERENCES deliveries (id) ON DELETE CASCADE,
    content_type  TEXT NOT NULL,
    data          BYTEA NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT delivery_photos_size CHECK (octet_length(data) <= 1572864)
);

-- Only the API touches these tables.
ALTER TABLE delivery_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_photos ENABLE ROW LEVEL SECURITY;
