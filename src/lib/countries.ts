/**
 * Approximate country centroids, [lat, lon] in degrees.
 * lat ∈ [-90, 90], positive north. lon ∈ [-180, 180], positive east.
 *
 * "Centroid" here is a visually-pleasing point — often a population-weighted
 * guess rather than a geometric center — because the point is used to light
 * a single glow on a rotating globe, not to do geography.
 */
export const COUNTRY_COORDS: Record<string, [number, number]> = {
  // East Asia
  CN: [35, 103], JP: [36, 138], KR: [36, 128], TW: [24, 121],
  HK: [22, 114], MO: [22, 114], MN: [47, 104],
  // Southeast Asia
  TH: [15, 100], VN: [16, 108], ID: [-2, 118], MY: [4, 102],
  SG: [1, 104], PH: [13, 122], MM: [21, 96], KH: [13, 105],
  LA: [18, 103], BN: [4, 115], TL: [-9, 126],
  // South Asia
  IN: [21, 78], PK: [30, 70], BD: [23, 90], LK: [7, 81],
  NP: [28, 84], BT: [27, 90], MV: [3, 73],
  // Central Asia
  KZ: [48, 67], UZ: [41, 64], KG: [41, 74], TJ: [38, 71],
  TM: [39, 59], AF: [33, 65],
  // Middle East
  SA: [24, 45], IR: [32, 53], IQ: [33, 44], IL: [31, 35],
  JO: [30, 36], LB: [33, 35], SY: [35, 38], TR: [39, 35],
  AE: [24, 54], QA: [25, 51], KW: [29, 47], BH: [26, 50],
  OM: [20, 56], YE: [15, 48], CY: [35, 33], PS: [32, 35],
  // Europe — West
  GB: [54, -2], IE: [53, -8], FR: [46, 2], DE: [51, 10],
  NL: [52, 5], BE: [50, 4], LU: [49, 6], CH: [47, 8],
  AT: [47, 14], IT: [42, 12], ES: [40, -4], PT: [39, -8],
  MT: [36, 14], AD: [42, 1], MC: [43, 7], SM: [44, 12],
  VA: [42, 12], LI: [47, 9],
  // Europe — North
  SE: [62, 15], NO: [61, 9], DK: [56, 10], FI: [64, 26],
  IS: [65, -18], EE: [59, 26], LV: [57, 24], LT: [55, 24],
  // Europe — East / South
  PL: [52, 19], CZ: [50, 15], SK: [49, 19], HU: [47, 19],
  RO: [46, 25], BG: [43, 25], GR: [39, 22], RS: [44, 21],
  HR: [45, 15], SI: [46, 14], BA: [44, 18], MK: [42, 22],
  ME: [42, 19], AL: [41, 20], UA: [49, 32], BY: [53, 28],
  MD: [47, 29], RU: [60, 100], XK: [42, 21],
  // North America + Caribbean
  US: [39, -98], CA: [56, -106], MX: [23, -102], GT: [15, -91],
  BZ: [17, -88], HN: [15, -86], SV: [13, -89], NI: [13, -85],
  CR: [10, -84], PA: [9, -80], CU: [22, -79], DO: [19, -71],
  HT: [19, -72], JM: [18, -77], PR: [18, -66], BS: [24, -76],
  TT: [11, -61], BB: [13, -60],
  // South America
  BR: [-10, -52], AR: [-34, -64], CO: [4, -72], PE: [-10, -76],
  VE: [8, -66], CL: [-35, -71], EC: [-2, -78], BO: [-17, -64],
  PY: [-23, -58], UY: [-33, -56], GY: [5, -58], SR: [4, -55],
  // Africa
  EG: [26, 30], NG: [10, 8], ZA: [-30, 24], ET: [9, 38],
  KE: [1, 38], GH: [8, -1], MA: [32, -6], DZ: [28, 2],
  TN: [34, 9], LY: [27, 17], SD: [15, 30], SS: [7, 30],
  UG: [1, 32], TZ: [-6, 35], RW: [-2, 30], CD: [-2, 23],
  CG: [-1, 15], CM: [6, 12], CI: [8, -5], SN: [14, -14],
  ML: [17, -4], BF: [13, -2], NE: [17, 8], TD: [15, 19],
  SO: [6, 46], ER: [15, 39], DJ: [12, 43], AO: [-12, 17],
  ZM: [-15, 27], ZW: [-19, 30], MZ: [-18, 35], MG: [-19, 47],
  BW: [-22, 24], NA: [-22, 17], LS: [-29, 28], SZ: [-27, 31],
  MW: [-13, 34], MU: [-20, 57], GA: [0, 12], GN: [11, -10],
  SL: [8, -11], LR: [6, -9], BJ: [9, 2], TG: [8, 1],
  BI: [-3, 30],
  // Oceania
  AU: [-25, 133], NZ: [-41, 174], PG: [-6, 147], FJ: [-18, 178],
  SB: [-9, 160], VU: [-16, 167], WS: [-13, -172], TO: [-21, -175],
};
