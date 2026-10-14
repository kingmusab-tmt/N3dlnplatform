// Cities with mapped buildings (see scripts/lib/areas.ts), and a camera for each.

export type CityView = { center: [number, number]; zoom: number; pitch: number; bearing: number };
export type PilotCity = { id: string; name: string; areas: string; view: CityView };

export const PILOT_CITIES: PilotCity[] = [
  {
    id: 'abuja',
    name: 'Abuja',
    areas: 'Central Area, Garki, Wuse, Wuse 2, Maitama, Asokoro, Utako',
    view: { center: [7.4789, 9.0777], zoom: 15.8, pitch: 60, bearing: -28 },
  },
  {
    id: 'lagos',
    name: 'Lagos',
    areas: 'Lagos Island, Ikoyi, Victoria Island, Yaba, Ikeja business district',
    view: { center: [3.4215, 6.4381], zoom: 15.6, pitch: 60, bearing: -20 },
  },
  {
    id: 'kano',
    name: 'Kano',
    areas: 'Kurmi market, Kantin Kwari, Sabon Gari, Fagge, Bompai, Nassarawa',
    view: { center: [8.5255, 12.0021], zoom: 15.6, pitch: 60, bearing: -20 },
  },
  {
    id: 'onitsha',
    name: 'Onitsha',
    areas: 'Main Market, Upper Iweka',
    view: { center: [6.7845, 6.1475], zoom: 15.6, pitch: 60, bearing: -20 },
  },
];
