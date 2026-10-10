-- A claim is someone saying "this building is mine" and attaching the
-- details a rider needs (flat number, gate colour, landmarks). It becomes the
-- home profile behind a shareable link, addressed by its unguessable UUID.
--
-- MVP claims are unverified: there are no user accounts yet, so anyone can
-- claim any building. Several claims per building are allowed (flats, shops).
CREATE TABLE IF NOT EXISTS claims (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    building_id     BIGINT NOT NULL REFERENCES buildings (id) ON DELETE CASCADE,
    label           TEXT   NOT NULL,
    delivery_notes  TEXT,
    status          TEXT   NOT NULL DEFAULT 'unverified',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT claims_label_length CHECK (char_length(label) BETWEEN 1 AND 80),
    CONSTRAINT claims_notes_length CHECK (delivery_notes IS NULL OR char_length(delivery_notes) <= 500),
    CONSTRAINT claims_status_valid CHECK (status IN ('unverified', 'verified', 'rejected'))
);

CREATE INDEX IF NOT EXISTS claims_building_id_idx ON claims (building_id);

-- Claims contain personal delivery details: no public access through
-- Supabase's REST API at all. Only the Express API (table owner) reads them.
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
