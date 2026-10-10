-- Align the code check with NIPOST's published format
-- (https://docs.postcode.gov.ng/concepts/postcode-format):
-- the district segment is any 3 alphanumerics, and the numeric LGA and
-- building-unit segments run 01-99 (never 00).
ALTER TABLE buildings DROP CONSTRAINT IF EXISTS buildings_nipost_code_format;
ALTER TABLE buildings ADD CONSTRAINT buildings_nipost_code_format
    CHECK (nipost_code ~ '^[A-Z]{2}(0[1-9]|[1-9][0-9])[A-Z0-9]{3}[A-Z]{2}(0[1-9]|[1-9][0-9])$');
