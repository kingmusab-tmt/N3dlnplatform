// NIPOST digital postcode (https://docs.postcode.gov.ng/concepts/postcode-format):
//   State (2 alpha) | LGA (2 digits, 01-99) | District (3 alphanumeric)
//   | Area (2 alpha) | Building unit (2 digits, 01-99)
// e.g. "EK 01 A03 FK 01" == "EK-01-A03-FK-01" == "ek01a03fk01" -> canonical "EK01A03FK01".
const CANONICAL_PATTERN = /^([A-Z]{2})(0[1-9]|[1-9]\d)([A-Z0-9]{3})([A-Z]{2})(0[1-9]|[1-9]\d)$/;

/**
 * Strips spaces, dashes and any other separators and uppercases the result.
 * Returns the canonical 11-char code, or null if the input is not a valid code.
 */
export function normalizePostcode(input) {
  if (typeof input !== 'string') return null;
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return CANONICAL_PATTERN.test(cleaned) ? cleaned : null;
}

/** "FC02A09DB09" -> "FC 02 A09 DB 09" for display. */
export function formatPostcode(code) {
  const m = CANONICAL_PATTERN.exec(code);
  return m ? m.slice(1).join(' ') : code;
}

/** "FC02A09DB09" -> "FC-02-A09-DB-09", the form NIPOST's API documents. */
export function hyphenatePostcode(code) {
  const m = CANONICAL_PATTERN.exec(code);
  return m ? m.slice(1).join('-') : code;
}

/** "FC02A09DB09" -> { state: "FC", lga: "02", district: "A09", area: "DB", building: "09" } */
export function parsePostcode(code) {
  const m = CANONICAL_PATTERN.exec(code);
  if (!m) return null;
  const [, state, lga, district, area, building] = m;
  return { state, lga, district, area, building };
}
