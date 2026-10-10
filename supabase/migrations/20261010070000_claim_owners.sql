-- Accounts: claims belong to the Supabase Auth user who made them, so owners
-- can edit them, delete them and revoke their share links.
--
-- user_id is null for claims made before accounts existed, and for claims
-- created by partners through the API.
ALTER TABLE claims
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users (id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS claims_user_id_idx ON claims (user_id);

-- Share links (/h/<share_token>) use their own token, separate from the
-- claim id, so an owner can revoke a link by issuing a new token. Existing
-- links keep working because their token starts out equal to the claim id.
ALTER TABLE claims ADD COLUMN IF NOT EXISTS share_token UUID;
UPDATE claims SET share_token = id WHERE share_token IS NULL;
ALTER TABLE claims ALTER COLUMN share_token SET DEFAULT gen_random_uuid();
ALTER TABLE claims ALTER COLUMN share_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS claims_share_token_uidx ON claims (share_token);
