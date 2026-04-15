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

/**
 * Major population centers inside large or geographically spread-out
 * countries, as [lat, lon, weight]. Weights are rough population
 * shares — they don't need to be precise, just relative, so the
 * simulator places more points on Shanghai than on Urumqi.
 *
 * Why bother: a centroid + jitter on China lands evenly from Tibet to
 * the coast, which reads wrong — real people are packed east of the
 * Hu Line. Same story for Russia (everyone is west of the Urals),
 * Canada (everyone is within 200km of the US border), Australia
 * (coastal cities, not the Outback), Brazil (coast + southeast), etc.
 *
 * Countries omitted from this table fall back to centroid + jitter,
 * which is fine for small or geographically uniform countries.
 *
 * Picked with one eye on metro-area population and one eye on visual
 * spread — two cities 50km apart look like one dot on the globe, so
 * there's no point listing both; we pick the bigger one and weight
 * it a bit heavier.
 */
export const POP_HOTSPOTS: Record<
  string,
  ReadonlyArray<readonly [number, number, number]>
> = {
  // China — the Hu Line matters. Eastern/coastal cities carry almost
  // all the weight; we leave a trickle on inland hubs (Chengdu, Xi'an)
  // but Tibet/Xinjiang are intentionally absent.
  CN: [
    [31.23, 121.47, 24], // Shanghai
    [39.91, 116.40, 22], // Beijing
    [23.13, 113.26, 18], // Guangzhou
    [22.54, 114.06, 16], // Shenzhen
    [30.67, 104.07, 9],  // Chengdu
    [30.59, 114.31, 9],  // Wuhan
    [34.27, 108.95, 7],  // Xi'an
    [32.06, 118.79, 8],  // Nanjing
    [29.56, 106.55, 10], // Chongqing
    [41.80, 123.43, 6],  // Shenyang
    [36.07, 120.38, 5],  // Qingdao
    [24.47, 118.08, 4],  // Xiamen
    [30.27, 120.15, 8],  // Hangzhou
    [25.04, 102.72, 3],  // Kunming
    [43.82, 125.32, 3],  // Changchun
  ],
  // US — coastal megas + a handful of inland hubs. Alaska excluded.
  US: [
    [40.71, -74.01, 20], // NYC metro
    [34.05, -118.25, 16], // LA
    [41.88, -87.63, 9],  // Chicago
    [29.76, -95.37, 8],  // Houston
    [33.45, -112.07, 6], // Phoenix
    [39.95, -75.17, 6],  // Philadelphia
    [32.78, -96.80, 8],  // Dallas
    [33.75, -84.39, 7],  // Atlanta
    [25.77, -80.19, 7],  // Miami
    [37.77, -122.42, 8], // SF Bay
    [47.61, -122.33, 6], // Seattle
    [42.36, -71.06, 6],  // Boston
    [38.91, -77.04, 6],  // DC
    [39.74, -104.99, 4], // Denver
    [30.27, -97.74, 4],  // Austin
    [45.52, -122.68, 3], // Portland
  ],
  // India — urban + Ganges plain. Reasonably spread, since density is
  // high across much of the country.
  IN: [
    [19.08, 72.88, 18],  // Mumbai
    [28.70, 77.10, 18],  // Delhi
    [22.57, 88.36, 10],  // Kolkata
    [13.08, 80.27, 9],   // Chennai
    [12.97, 77.59, 11],  // Bengaluru
    [17.39, 78.49, 8],   // Hyderabad
    [18.52, 73.86, 6],   // Pune
    [23.03, 72.58, 6],   // Ahmedabad
    [26.85, 80.95, 5],   // Lucknow
    [25.32, 82.97, 3],   // Varanasi
    [21.17, 72.83, 4],   // Surat
    [26.91, 75.79, 4],   // Jaipur
  ],
  // Russia — almost everyone lives west of the Urals. Siberia/Far East
  // get token weight.
  RU: [
    [55.75, 37.62, 28],  // Moscow
    [59.93, 30.34, 14],  // St. Petersburg
    [56.83, 60.60, 6],   // Yekaterinburg
    [55.03, 82.92, 5],   // Novosibirsk
    [55.80, 49.11, 5],   // Kazan
    [53.20, 50.15, 4],   // Samara
    [56.48, 84.95, 3],   // Tomsk
    [43.12, 131.89, 3],  // Vladivostok
  ],
  // Canada — almost everyone within 200km of the US border.
  CA: [
    [43.65, -79.38, 22], // Toronto
    [45.50, -73.57, 15], // Montreal
    [49.28, -123.12, 12], // Vancouver
    [51.05, -114.07, 7], // Calgary
    [53.55, -113.49, 5], // Edmonton
    [45.42, -75.70, 6],  // Ottawa
    [49.90, -97.14, 4],  // Winnipeg
    [46.81, -71.21, 4],  // Quebec City
    [44.65, -63.58, 3],  // Halifax
  ],
  // Australia — ring of coastal cities.
  AU: [
    [-33.87, 151.21, 20], // Sydney
    [-37.81, 144.96, 19], // Melbourne
    [-27.47, 153.03, 9],  // Brisbane
    [-31.95, 115.86, 7],  // Perth
    [-34.93, 138.60, 5],  // Adelaide
    [-35.28, 149.13, 3],  // Canberra
    [-42.88, 147.33, 2],  // Hobart
    [-16.92, 145.77, 2],  // Cairns
  ],
  // Brazil — southeast + coast.
  BR: [
    [-23.55, -46.63, 22], // São Paulo
    [-22.91, -43.17, 14], // Rio
    [-15.79, -47.88, 7],  // Brasília
    [-12.97, -38.50, 6],  // Salvador
    [-19.92, -43.94, 7],  // Belo Horizonte
    [-3.73, -38.53, 5],   // Fortaleza
    [-8.05, -34.88, 5],   // Recife
    [-30.03, -51.22, 5],  // Porto Alegre
    [-25.43, -49.27, 4],  // Curitiba
    [-1.46, -48.49, 3],   // Belém
    [-3.12, -60.02, 3],   // Manaus
  ],
  // Japan — Tokyo dominates, then the Pacific coast belt.
  JP: [
    [35.68, 139.69, 32],  // Tokyo
    [34.69, 135.50, 14],  // Osaka
    [35.18, 136.91, 8],   // Nagoya
    [33.59, 130.40, 6],   // Fukuoka
    [43.07, 141.35, 5],   // Sapporo
    [34.39, 132.46, 3],   // Hiroshima
    [35.01, 135.77, 4],   // Kyoto
    [38.27, 140.87, 3],   // Sendai
  ],
  // Germany — somewhat spread.
  DE: [
    [52.52, 13.40, 14],   // Berlin
    [48.14, 11.58, 11],   // Munich
    [50.11, 8.68, 9],     // Frankfurt
    [53.55, 9.99, 10],    // Hamburg
    [50.94, 6.96, 7],     // Cologne
    [51.23, 6.78, 5],     // Düsseldorf
    [48.78, 9.18, 5],     // Stuttgart
    [51.05, 13.74, 3],    // Dresden
    [51.34, 12.37, 3],    // Leipzig
  ],
  // UK — London dominates.
  GB: [
    [51.51, -0.13, 26],   // London
    [53.48, -2.24, 8],    // Manchester
    [52.48, -1.90, 7],    // Birmingham
    [55.86, -4.25, 5],    // Glasgow
    [53.40, -2.99, 4],    // Liverpool
    [53.80, -1.55, 4],    // Leeds
    [55.95, -3.19, 4],    // Edinburgh
    [54.97, -1.61, 3],    // Newcastle
    [51.45, -2.58, 3],    // Bristol
  ],
  // France — Paris + regional cities.
  FR: [
    [48.86, 2.35, 28],    // Paris
    [45.76, 4.84, 8],     // Lyon
    [43.30, 5.37, 7],     // Marseille
    [43.60, 1.44, 5],     // Toulouse
    [43.70, 7.27, 4],     // Nice
    [47.22, -1.55, 4],    // Nantes
    [48.58, 7.75, 4],     // Strasbourg
    [44.84, -0.58, 4],    // Bordeaux
    [50.63, 3.06, 4],     // Lille
  ],
  // Korea — Seoul + a few.
  KR: [
    [37.57, 126.98, 28],  // Seoul
    [35.18, 129.08, 8],   // Busan
    [35.87, 128.60, 5],   // Daegu
    [37.46, 126.71, 5],   // Incheon
    [35.16, 126.85, 3],   // Gwangju
    [36.35, 127.38, 3],   // Daejeon
  ],
  // Indonesia — Java-heavy.
  ID: [
    [-6.21, 106.85, 22],  // Jakarta
    [-7.25, 112.75, 9],   // Surabaya
    [-6.92, 107.61, 8],   // Bandung
    [-7.00, 110.42, 5],   // Semarang
    [3.59, 98.67, 5],     // Medan
    [-5.15, 119.43, 4],   // Makassar
    [-8.65, 115.22, 3],   // Denpasar
  ],
  // Mexico — central highlands + north.
  MX: [
    [19.43, -99.13, 24],  // Mexico City
    [20.67, -103.35, 8],  // Guadalajara
    [25.69, -100.32, 7],  // Monterrey
    [19.04, -98.20, 4],   // Puebla
    [32.51, -117.04, 4],  // Tijuana
    [31.69, -106.42, 3],  // Ciudad Juárez
    [21.16, -86.85, 3],   // Cancún
    [25.43, -101.00, 2],  // Saltillo
  ],
  // Italy — north is denser, but spread all along the peninsula.
  IT: [
    [41.90, 12.50, 14],   // Rome
    [45.46, 9.19, 16],    // Milan
    [40.85, 14.27, 9],    // Naples
    [45.07, 7.69, 6],     // Turin
    [38.12, 13.36, 5],    // Palermo
    [44.41, 8.93, 4],     // Genoa
    [43.77, 11.25, 5],    // Florence
    [45.44, 12.33, 4],    // Venice
    [40.64, 17.94, 3],    // Brindisi / south
  ],
  // Spain — Madrid + coastal.
  ES: [
    [40.42, -3.70, 18],   // Madrid
    [41.39, 2.17, 15],    // Barcelona
    [39.47, -0.38, 7],    // Valencia
    [37.39, -5.98, 6],    // Seville
    [43.26, -2.93, 4],    // Bilbao
    [36.72, -4.42, 4],    // Málaga
    [36.14, -5.80, 3],    // Cádiz area
    [41.65, -0.88, 3],    // Zaragoza
  ],
  // Turkey — Istanbul + central.
  TR: [
    [41.01, 28.98, 28],   // Istanbul
    [39.93, 32.87, 10],   // Ankara
    [38.42, 27.14, 7],    // İzmir
    [40.19, 29.06, 4],    // Bursa
    [37.00, 35.32, 4],    // Adana
    [36.89, 30.71, 4],    // Antalya
    [37.87, 32.49, 3],    // Konya
  ],
  // Vietnam — the two endpoints dominate.
  VN: [
    [10.76, 106.66, 22],  // HCMC
    [21.03, 105.85, 18],  // Hanoi
    [16.07, 108.22, 6],   // Da Nang
    [20.87, 106.68, 5],   // Hai Phong
    [10.04, 105.78, 3],   // Can Tho
  ],
  // Thailand — Bangkok dominates.
  TH: [
    [13.76, 100.50, 30],  // Bangkok
    [18.79, 98.99, 6],    // Chiang Mai
    [13.08, 100.92, 4],   // Pattaya
    [7.88, 98.39, 4],     // Phuket
    [7.01, 100.47, 3],    // Hat Yai
  ],
  // Philippines — Luzon-heavy.
  PH: [
    [14.60, 120.98, 24],  // Manila
    [10.32, 123.90, 7],   // Cebu
    [7.08, 125.61, 5],    // Davao
    [16.41, 120.60, 3],   // Baguio
    [10.70, 122.57, 3],   // Iloilo
  ],
  // Poland.
  PL: [
    [52.23, 21.01, 16],   // Warsaw
    [50.06, 19.94, 9],    // Kraków
    [51.11, 17.04, 6],    // Wrocław
    [52.41, 16.93, 5],    // Poznań
    [54.35, 18.65, 5],    // Gdańsk
    [51.76, 19.46, 4],    // Łódź
  ],
  // Netherlands — randstad.
  NL: [
    [52.37, 4.90, 14],    // Amsterdam
    [51.92, 4.48, 9],     // Rotterdam
    [52.08, 4.31, 6],     // The Hague
    [52.09, 5.12, 5],     // Utrecht
    [51.44, 5.48, 3],     // Eindhoven
  ],
  // Argentina — Buenos Aires dominates.
  AR: [
    [-34.60, -58.38, 28], // Buenos Aires
    [-31.42, -64.18, 7],  // Córdoba
    [-32.95, -60.65, 5],  // Rosario
    [-32.88, -68.84, 3],  // Mendoza
    [-24.79, -65.41, 3],  // Salta
  ],
  // Egypt — Nile delta + Cairo.
  EG: [
    [30.04, 31.24, 30],   // Cairo
    [31.20, 29.92, 12],   // Alexandria
    [30.03, 31.21, 4],    // Giza (slightly offset)
    [29.30, 30.84, 3],    // Faiyum
    [25.69, 32.64, 3],    // Luxor
  ],
  // Nigeria — Lagos + north.
  NG: [
    [6.52, 3.38, 20],     // Lagos
    [9.05, 7.49, 8],      // Abuja
    [12.00, 8.52, 6],     // Kano
    [7.39, 3.89, 5],      // Ibadan
    [4.82, 7.05, 4],      // Port Harcourt
    [11.85, 13.16, 3],    // Maiduguri
  ],
  // Saudi Arabia — west + east coasts.
  SA: [
    [24.71, 46.67, 18],   // Riyadh
    [21.49, 39.19, 12],   // Jeddah
    [26.42, 50.09, 6],    // Dammam
    [21.38, 39.86, 5],    // Mecca
    [24.47, 39.61, 4],    // Medina
  ],
  // South Africa.
  ZA: [
    [-26.20, 28.05, 16],  // Johannesburg
    [-33.92, 18.42, 14],  // Cape Town
    [-29.86, 31.03, 9],   // Durban
    [-25.75, 28.19, 6],   // Pretoria
    [-33.96, 25.60, 3],   // Port Elizabeth
  ],
  // Chile — long country, coastal.
  CL: [
    [-33.45, -70.67, 28], // Santiago
    [-33.04, -71.63, 6],  // Valparaíso
    [-36.83, -73.05, 4],  // Concepción
    [-23.65, -70.40, 3],  // Antofagasta
    [-41.47, -72.94, 2],  // Puerto Montt
  ],
  // Colombia.
  CO: [
    [4.71, -74.07, 22],   // Bogotá
    [6.25, -75.57, 10],   // Medellín
    [3.45, -76.53, 6],    // Cali
    [10.96, -74.80, 5],   // Barranquilla
    [10.39, -75.51, 4],   // Cartagena
  ],
  // Sweden — south-heavy.
  SE: [
    [59.33, 18.07, 16],   // Stockholm
    [57.71, 11.97, 7],    // Gothenburg
    [55.60, 13.00, 5],    // Malmö
    [59.86, 17.64, 3],    // Uppsala
  ],
  // Norway — coastal + Oslo.
  NO: [
    [59.91, 10.75, 16],   // Oslo
    [60.39, 5.32, 6],     // Bergen
    [63.43, 10.39, 4],    // Trondheim
    [58.97, 5.73, 3],     // Stavanger
  ],
};
