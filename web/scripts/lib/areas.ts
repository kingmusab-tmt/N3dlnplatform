// Named pilot areas for `npm run import:osm -- --area <id>[,<id>…]` (or `--area all`).
// Each box gets the simulated code prefix <state><LGA>SIM, with state and LGA codes
// from NIPOST's /v1/reference/lgas. Boxes follow the dominant LGA of each
// business/commercial core; buildings near an LGA border may carry the
// neighbouring LGA's code, which is acceptable for simulated pilot codes.
// A building inside two boxes keeps the code from the first import.

export type Area = { label: string; bbox: [number, number, number, number]; state: string; lga: string };

export const AREAS: Record<string, Area> = {
  // ---- Abuja (FCT): Abuja Municipal ----
  'abuja-wuse2': { label: 'Abuja: Wuse 2 (original pilot)', bbox: [7.462, 9.068, 7.492, 9.088], state: 'FC', lga: '02' },
  'abuja-core': {
    label: 'Abuja: Central Area, Garki, Wuse, Maitama, Asokoro, Utako',
    bbox: [7.44, 9.02, 7.53, 9.1],
    state: 'FC',
    lga: '02',
  },

  // ---- Lagos ----
  'lagos-island': { label: 'Lagos: Lagos Island', bbox: [3.37, 6.42, 3.405, 6.47], state: 'LA', lga: '14' },
  'lagos-eti-osa': { label: 'Lagos: Ikoyi and Victoria Island (Eti-Osa)', bbox: [3.405, 6.42, 3.48, 6.47], state: 'LA', lga: '08' },
  'lagos-yaba': { label: 'Lagos: Yaba (Lagos Mainland)', bbox: [3.36, 6.49, 3.39, 6.53], state: 'LA', lga: '15' },
  'lagos-ikeja': { label: 'Lagos: Ikeja business district (Allen, Computer Village, Alausa)', bbox: [3.33, 6.585, 3.37, 6.62], state: 'LA', lga: '11' },

  // ---- Kano ----
  'kano-municipal': { label: 'Kano: Kurmi market and the old city (Kano Municipal)', bbox: [8.49, 11.96, 8.525, 12.0], state: 'KN', lga: '21' },
  'kano-fagge': { label: 'Kano: Kantin Kwari, Sabon Gari (Fagge)', bbox: [8.49, 12.0, 8.56, 12.03], state: 'KN', lga: '12' },
  'kano-nasarawa': { label: 'Kano: Bompai, Nassarawa GRA (Nasarawa)', bbox: [8.525, 11.96, 8.56, 12.0], state: 'KN', lga: '31' },

  // ---- Onitsha (Anambra) ----
  'onitsha-north': { label: 'Onitsha: Main Market area (Onitsha North)', bbox: [6.76, 6.145, 6.81, 6.17], state: 'AN', lga: '17' },
  'onitsha-south': { label: 'Onitsha: Upper Iweka area (Onitsha South)', bbox: [6.76, 6.12, 6.81, 6.145], state: 'AN', lga: '18' },
};
