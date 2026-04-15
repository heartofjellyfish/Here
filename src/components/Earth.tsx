"use client";

import { useEffect, useRef } from "react";
import { COUNTRY_COORDS } from "@/lib/countries";

/**
 * A single "resonance ritual" dispatched by Scene after a tap. Earth
 * owns the choreography: a 1.5-turn sweep lighting every country as it
 * passes the front meridian, stopping on the primary country with its
 * point at dead center, holding, fading, then seamlessly handing the
 * earth back to its idle rotation.
 *
 * Times are wall-clock (Date.now()) — the outer scheduler and the
 * canvas loop use the same reference frame. Durations are passed in so
 * the component doesn't need to know the Scene-side constants.
 */
export interface Ritual {
  startAt: number;
  primaryCountry: string | null;
  countries: string[];
  sweepMs: number;
  holdMs: number;
  fadeMs: number;
}

type Props = {
  size?: number;
  ritual?: Ritual | null;
};

// ------ constants ------

const ROTATION_PERIOD_MS = 160_000; // ~2m40s per revolution — breathing-slow
const TARGET_FPS = 28;
const TILT = (18 * Math.PI) / 180;

// Light direction (unit vector) in screen space. Upper-left key light.
// The same light shapes the earth and the moon's phase, so they read as
// belonging to the same scene.
const LX = -0.32;
const LY = -0.55;
const LZ = 0.77;

// Moon: small companion, slow orbit, 15° tilted plane.
const MOON_PERIOD_MS = 240_000;
const MOON_TILT = (15 * Math.PI) / 180;
const MOON_ORBIT_R = 1.42; // in earth radii (so it sits comfortably outside)

// ------ continent polygons ------
//
// Hand-authored silhouettes in (lat, lon). A point is "land" if it falls
// inside ANY polygon, OR is south of -63° (Antarctica). These are not
// surveying-accurate, but at the resolution of ~2000 dots they read as
// Earth — the eye finds Florida, the boot of Italy, the horn of Africa.
//
// All polygons stay within ±180° longitude (no antimeridian crossings).

type Poly = ReadonlyArray<readonly [number, number]>;

const LAND_POLYGONS: ReadonlyArray<Poly> = [
  // ============ North America ============
  // Alaska → Pacific Northwest → California → Mexico → Central America →
  // Yucatan → Gulf coast → Florida → East Coast → Maritimes → Labrador →
  // Hudson Bay → Arctic coast → back to Alaska.
  [
    [71, -156], [70, -148], [68, -141], [60, -141], [58, -136], [55, -132],
    [52, -131], [48, -125], [46, -124], [40, -124], [35, -121], [33, -118],
    [32, -117], [28, -114], [24, -110], [21, -106], [18, -104], [16, -99],
    [14, -93], [14, -87], [11, -84], [9, -82], [8, -77], [10, -83],
    [16, -88], [19, -88], [21, -87], [21, -90], [23, -93], [25, -97],
    [27, -97], [29, -94], [29, -89], [30, -87], [28, -82], [25, -81],
    [27, -80], [30, -81], [33, -79], [35, -77], [38, -76], [40, -74],
    [42, -71], [44, -68], [46, -65], [47, -61], [49, -59], [52, -56],
    [54, -57], [57, -63], [60, -65], [62, -78], [63, -78], [58, -82],
    [55, -88], [60, -94], [64, -87], [68, -95], [70, -115], [72, -127],
    [72, -141], [72, -156], [71, -156],
  ],
  // Greenland
  [
    [83, -32], [82, -22], [77, -18], [70, -22], [64, -40], [62, -42],
    [65, -52], [73, -57], [78, -66], [80, -58], [82, -42], [83, -32],
  ],
  // Baffin Island + Ellesmere (simplified as one blob)
  [
    [78, -75], [80, -87], [76, -95], [72, -80], [68, -72], [64, -65],
    [63, -70], [66, -78], [70, -80], [74, -76], [78, -75],
  ],
  // Iceland
  [[67, -23], [66, -15], [64, -14], [63, -20], [65, -24], [67, -23]],
  // Cuba
  [[23, -83], [23, -77], [20, -74], [20, -77], [22, -84], [23, -83]],
  // Hispaniola
  [[20, -73], [19, -68], [18, -68], [18, -73], [19, -74], [20, -73]],
  // Jamaica
  [[18.5, -78.4], [18.5, -76.2], [17.7, -76.2], [17.7, -78.4], [18.5, -78.4]],
  // Puerto Rico
  [[18.5, -67.3], [18.5, -65.6], [18, -65.6], [18, -67.3], [18.5, -67.3]],

  // ============ South America ============
  [
    [12, -72], [11, -60], [5, -52], [-1, -48], [-5, -35], [-13, -38],
    [-23, -41], [-27, -48], [-33, -53], [-38, -58], [-42, -64], [-50, -68],
    [-55, -68], [-55, -73], [-50, -74], [-42, -74], [-30, -71], [-18, -71],
    [-10, -78], [-3, -81], [2, -78], [8, -78], [12, -72],
  ],

  // ============ Africa ============
  // Morocco Atlantic → North coast → Nile delta → Red Sea coast → Horn of
  // Africa → East coast → Cape → West coast
  [
    [35, -5], [36, -2], [37, 10], [33, 12], [32, 20], [32, 30],
    [30, 32], [22, 37], [17, 39], [13, 43], [11, 43], [10, 50],
    [6, 49], [1, 42], [-4, 39], [-10, 40], [-17, 40], [-24, 35],
    [-30, 32], [-34, 25], [-34, 19], [-30, 17], [-23, 14], [-14, 13],
    [-6, 12], [0, 9], [5, 4], [5, -2], [6, -8], [9, -13],
    [14, -17], [20, -17], [28, -12], [33, -9], [35, -5],
  ],
  // Madagascar
  [
    [-12, 49], [-16, 50], [-22, 48], [-25, 45], [-22, 43], [-16, 45],
    [-13, 48], [-12, 49],
  ],

  // ============ Europe ============
  // Iberia → France → Low Countries → Germany → Baltic → Balkans →
  // Greece → Turkey (Thrace). Iberia starts at Strait of Gibraltar.
  [
    [43, -9], [37, -9], [36, -6], [38, -2], [40, 0], [43, 3],
    [46, 0], [49, -1], [51, 2], [53, 4], [54, 8], [55, 13],
    [54, 18], [51, 20], [46, 18], [43, 16], [41, 19], [40, 22],
    [40, 26], [42, 28], [41, 29], [40, 26], [39, 26], [39, 22],
    [38, 23], [37, 21], [40, 19], [41, 18], [42, 18], [43, 15],
    [45, 13], [44, 10], [43, 7], [43, 3], [43, -2], [43, -9],
  ],
  // Italian peninsula (boot) — separate because it's long and narrow
  [
    [46, 8], [46, 12], [44, 12], [42, 14], [40, 18], [39, 18],
    [38, 16], [39, 15], [41, 13], [43, 11], [44, 8], [46, 8],
  ],
  // Sardinia
  [[41, 9], [41, 10], [39, 10], [39, 8.5], [41, 9]],
  // Sicily
  [[38, 12.5], [38, 15.5], [36.7, 15], [36.6, 13], [38, 12.5]],
  // Scandinavia: Norway + Sweden + Finland as one connected mass
  [
    [58, 5], [62, 5], [65, 12], [68, 15], [70, 19], [71, 25],
    [70, 28], [69, 30], [66, 29], [64, 24], [62, 22], [60, 22],
    [58, 18], [56, 15], [56, 12], [58, 5],
  ],
  // Jutland
  [[57, 8], [57, 11], [54, 11], [54, 8], [57, 8]],
  // Great Britain
  [
    [58, -5], [58, -2], [55, -2], [53, 0], [52, 2], [50, 1],
    [50, -4], [53, -5], [55, -6], [57, -7], [58, -5],
  ],
  // Ireland
  [[55, -10], [55, -6], [52, -6], [51, -10], [54, -10], [55, -10]],

  // ============ Russia / Siberia ============
  // Kaliningrad/Baltic east through White Sea, along the arctic coast of
  // Siberia, down to Kamchatka and the southern interior border. Stops at
  // lon 179 to avoid antimeridian crossing.
  [
    [56, 21], [60, 28], [60, 35], [66, 35], [68, 43], [66, 46],
    [69, 50], [72, 58], [73, 70], [75, 80], [76, 100], [77, 115],
    [74, 130], [72, 142], [70, 150], [67, 162], [66, 172], [66, 179],
    [63, 179], [62, 170], [60, 164], [57, 162], [54, 157], [51, 157],
    [51, 145], [55, 140], [52, 141], [49, 142], [46, 140], [44, 135],
    [42, 131], [50, 128], [54, 123], [55, 118], [54, 108], [50, 100],
    [51, 90], [52, 78], [50, 68], [48, 58], [48, 52], [46, 48],
    [47, 42], [45, 40], [44, 39], [43, 40], [43, 42], [42, 44],
    [41, 46], [41, 48], [43, 49], [45, 48], [47, 49], [48, 54],
    [48, 58], [45, 60], [43, 66], [42, 70], [41, 70], [40, 65],
    [38, 58], [38, 52], [40, 50], [41, 49], [41, 47], [40, 44],
    [42, 41], [44, 40], [45, 37], [46, 37], [46, 35], [45, 33],
    [46, 31], [50, 30], [55, 25], [56, 21],
  ],
  // Kamchatka peninsula
  [
    [60, 162], [60, 164], [58, 163], [54, 162], [51, 157], [53, 156],
    [58, 161], [60, 162],
  ],
  // Sakhalin
  [[54, 143], [46, 143], [46, 141], [54, 142], [54, 143]],

  // ============ Middle East + Arabian Peninsula ============
  // Turkey (Anatolia) → Levant → Sinai → Red Sea east → Arabia → Persian
  // Gulf → Iran → Caucasus south. THIS WAS ENTIRELY MISSING before.
  [
    [41, 28], [42, 35], [41, 41], [40, 44], [38, 45], [37, 48],
    [30, 48], [29, 49], [26, 52], [24, 56], [22, 60], [20, 59],
    [18, 56], [16, 54], [14, 51], [13, 48], [12, 45], [13, 43],
    [16, 43], [22, 39], [25, 37], [28, 34], [30, 34], [31, 35],
    [33, 35], [35, 35], [36, 36], [37, 37], [37, 40], [38, 42],
    [39, 41], [40, 38], [40, 35], [40, 30], [41, 28],
  ],
  // Iran (south + central, not covered by the above)
  [
    [39, 45], [38, 49], [37, 54], [36, 61], [34, 61], [30, 61],
    [27, 57], [25, 57], [26, 53], [28, 51], [30, 48], [33, 46],
    [37, 45], [39, 45],
  ],
  // Caucasus bridge (between Black Sea and Caspian)
  [[44, 40], [43, 47], [41, 48], [41, 44], [42, 42], [44, 40]],

  // ============ Central Asia ============
  // Kazakhstan + Uzbekistan + Turkmenistan — landlocked filler so the
  // continental interior isn't hollow.
  [
    [48, 52], [52, 60], [52, 72], [50, 80], [47, 83], [43, 79],
    [40, 73], [37, 68], [38, 60], [40, 55], [44, 52], [48, 52],
  ],

  // ============ Indian subcontinent ============
  // Pakistan coast → Indus → Himalaya (north) → Bangladesh → Bay of Bengal
  // coast → south tip (Kanyakumari) → Arabian Sea coast
  [
    [25, 67], [28, 69], [32, 71], [35, 75], [35, 78], [32, 78],
    [30, 80], [28, 88], [25, 91], [23, 94], [22, 93], [22, 90],
    [21, 87], [18, 84], [15, 80], [11, 79], [8, 77], [10, 75],
    [14, 74], [18, 73], [22, 70], [23, 68], [25, 67],
  ],
  // Sri Lanka
  [[9, 80], [9, 82], [6, 81], [7, 80], [9, 80]],

  // ============ Southeast Asia (Indochina + Malay) ============
  // Myanmar west → Bangladesh border → Thailand/Vietnam → Malay peninsula
  [
    [28, 97], [25, 98], [22, 94], [20, 93], [17, 95], [14, 98],
    [10, 99], [6, 101], [2, 103], [1, 104], [6, 102], [9, 104],
    [11, 108], [14, 109], [17, 107], [21, 107], [22, 104], [24, 99],
    [26, 98], [28, 97],
  ],

  // ============ China + Mongolia + Korea ============
  // Xinjiang → Mongolia → Manchuria → Korea → East coast → South China
  // Sea → Yunnan → Tibet → back to Xinjiang
  [
    [42, 77], [45, 82], [47, 87], [49, 93], [50, 105], [52, 115],
    [53, 125], [50, 128], [46, 131], [43, 131], [42, 128], [40, 125],
    [39, 125], [38, 125], [36, 126], [34, 126], [35, 129], [38, 129],
    [40, 128], [40, 122], [37, 122], [30, 122], [25, 118], [22, 114],
    [21, 110], [20, 108], [21, 108], [23, 106], [25, 102], [28, 97],
    [30, 94], [32, 88], [35, 80], [38, 78], [42, 77],
  ],
  // Taiwan
  [[25, 121], [25, 122], [22, 121], [22, 120], [25, 121]],
  // Hainan
  [[20, 109], [20, 111], [18, 111], [18, 109], [20, 109]],

  // ============ Japan ============
  // Honshu + Shikoku + Kyushu
  [
    [41, 141], [41, 142], [37, 141], [35, 140], [34, 140], [33, 132],
    [32, 130], [34, 130], [35, 133], [36, 137], [38, 140], [40, 140],
    [41, 141],
  ],
  // Hokkaido
  [[45, 141], [44, 145], [42, 145], [41, 141], [45, 141]],

  // ============ Philippines ============
  // Luzon
  [[18, 120], [18, 122], [14, 122], [13, 124], [12, 123], [14, 120], [16, 120], [18, 120]],
  // Mindanao + Visayas blob
  [[11, 122], [11, 126], [8, 126], [6, 124], [8, 122], [11, 122]],

  // ============ Indonesia ============
  // Sumatra
  [[6, 95], [4, 98], [0, 102], [-4, 104], [-6, 105], [-3, 101], [2, 97], [6, 95]],
  // Java
  [[-6, 105], [-7, 110], [-8, 114], [-9, 115], [-7, 111], [-6, 105]],
  // Borneo (Kalimantan)
  [[7, 117], [5, 119], [1, 119], [-3, 117], [-4, 113], [0, 110], [4, 109], [7, 117]],
  // Sulawesi
  [[2, 122], [1, 125], [-2, 123], [-5, 120], [-3, 119], [0, 120], [2, 122]],
  // New Guinea
  [[-1, 132], [-2, 140], [-9, 144], [-9, 140], [-4, 134], [-1, 132]],
  // Timor
  [[-8, 124], [-9, 127], [-10, 127], [-9, 124], [-8, 124]],

  // ============ Australia ============
  [
    [-11, 142], [-16, 146], [-21, 150], [-28, 154], [-37, 150], [-38, 144],
    [-35, 138], [-32, 133], [-32, 118], [-28, 114], [-22, 114], [-18, 122],
    [-14, 130], [-12, 137], [-11, 142],
  ],
  // Tasmania
  [[-40, 144], [-40, 148], [-43, 148], [-43, 146], [-40, 144]],

  // ============ New Zealand ============
  // North Island
  [[-34, 173], [-37, 176], [-41, 176], [-40, 172], [-36, 173], [-34, 173]],
  // South Island
  [[-41, 171], [-44, 168], [-46, 167], [-46, 170], [-44, 172], [-41, 171]],

  // ============ Arctic islands (Svalbard etc, minor) ============
  [[80, 10], [80, 30], [77, 30], [77, 10], [80, 10]],
  // Novaya Zemlya
  [[77, 55], [74, 65], [71, 58], [73, 52], [77, 55]],
];

function pointInPoly(lat: number, lon: number, poly: Poly): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [latI, lonI] = poly[i];
    const [latJ, lonJ] = poly[j];
    const crosses = (latI > lat) !== (latJ > lat);
    if (!crosses) continue;
    const lonAtLat = lonI + ((lat - latI) / (latJ - latI)) * (lonJ - lonI);
    if (lon < lonAtLat) inside = !inside;
  }
  return inside;
}

function isLand(lat: number, lon: number): boolean {
  if (lat < -63) return true; // Antarctica
  for (const p of LAND_POLYGONS) {
    if (pointInPoly(lat, lon, p)) return true;
  }
  return false;
}

// ------ sphere sampling ------

type Dot = { x: number; y: number; z: number; land: boolean };

/** Fibonacci spiral — evenly distributed points on a unit sphere. */
function fibSphere(n: number): Dot[] {
  const dots: Dot[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    const lat = (Math.asin(y) * 180) / Math.PI;
    const lon = (Math.atan2(z, x) * 180) / Math.PI;
    dots.push({ x, y, z, land: isLand(lat, lon) });
  }
  return dots;
}

function latLonToVec(lat: number, lon: number): [number, number, number] {
  const la = (lat * Math.PI) / 180;
  const lo = (lon * Math.PI) / 180;
  return [
    Math.cos(la) * Math.cos(lo),
    Math.sin(la),
    Math.cos(la) * Math.sin(lo),
  ];
}

/**
 * Deterministic per-seed jitter. Two taps from the same country show up
 * as two distinct points, not one stacked pile on the country centroid.
 */
function jitterFor(
  seed: number,
  latMax: number,
  lonMax: number,
): [number, number] {
  const a = Math.sin(seed * 12.9898) * 43758.5453;
  const b = Math.sin(seed * 78.233 + 1) * 43758.5453;
  return [
    (a - Math.floor(a) - 0.5) * 2 * latMax,
    (b - Math.floor(b) - 0.5) * 2 * lonMax,
  ];
}

/**
 * Same scheme as jitterFor, but rejects ocean samples. The coastlines
 * around Jakarta, Tokyo, and the like are tight — jittering a point off
 * a centroid can land it a few hundred km out to sea, which reads wrong.
 * We retry with a shrinking scale until we hit land, falling back to
 * the centroid. 6 attempts is plenty; the worst-case centroid fallback
 * still looks deliberate because it lands on a real place.
 */
function findLandJitter(
  seed: number,
  base: readonly [number, number],
  latMax: number,
  lonMax: number,
): [number, number] {
  let sLat = latMax;
  let sLon = lonMax;
  let s = seed;
  for (let i = 0; i < 6; i++) {
    const [dLat, dLon] = jitterFor(s, sLat, sLon);
    const lat = base[0] + dLat;
    const lon = base[1] + dLon;
    if (isLand(lat, lon)) return [lat, lon];
    sLat *= 0.65;
    sLon *= 0.65;
    s = (s + 1337) | 0;
  }
  // Centroids in COUNTRY_COORDS are authored to be on land, so this
  // fallback looks fine even without random perturbation.
  return [base[0], base[1]];
}

/** Stable per-(ritual, country) seed so geometry and render agree. */
function seedFor(startAt: number, country: string): number {
  let h = 0;
  for (let i = 0; i < country.length; i++) {
    h = ((h * 31) + country.charCodeAt(i)) | 0;
  }
  return startAt + h;
}

/** Forward-positive delta in [0, 2π). */
function forwardDelta(from: number, to: number): number {
  const TWO = Math.PI * 2;
  return ((to - from) % TWO + TWO) % TWO;
}

// Internal state — what the draw loop needs to execute the ritual. Held
// in a ref so a new Ritual prop can publish a fresh plan without
// restarting the animation loop.
type ActiveRitual = {
  startAt: number;
  sweepMs: number;
  holdMs: number;
  fadeMs: number;
  /** Rotation at startAt (continuous with idle rotation before). */
  rotStart: number;
  /** Rotation when sweep ends — primary's rotIdeal, one full turn + delta. */
  rotEnd: number;
  totalAngle: number;
  primaryCountry: string | null;
  litAt: Map<string, number>;
  /** Jittered (lat, lon) per country, precomputed so the target-snap and
   *  the rendered point line up exactly. */
  jPos: Map<string, [number, number]>;
};

// ------ component ------

export default function Earth({ size = 320, ritual = null }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Rotation is `baseRot(t) + rotOffset`. The ritual temporarily takes
  // over the rotation; on exit we write back to rotOffset so the idle
  // loop picks up exactly where the ritual stopped — no visible jump.
  const rotOffsetRef = useRef(0);
  const activeRef = useRef<ActiveRitual | null>(null);

  // When a new ritual arrives, compute its full plan (rotStart, rotEnd,
  // per-country light-up times, jittered positions) and publish to the
  // ref. We sample real + perf clocks once and back-project the base
  // rotation to ritual.startAt so rotStart is continuous with the idle
  // rotation the user has been watching.
  useEffect(() => {
    if (!ritual) return;

    const dateSample = Date.now();
    const perfSample = performance.now();
    const perfAtStart = perfSample - (dateSample - ritual.startAt);
    const rotStart =
      (perfAtStart / ROTATION_PERIOD_MS) * Math.PI * 2 + rotOffsetRef.current;

    const jPos = new Map<string, [number, number]>();
    const litAt = new Map<string, number>();

    const primary = ritual.primaryCountry;
    let totalAngle = Math.PI * 2; // at minimum, one clean rotation
    let rotEnd = rotStart + totalAngle;

    if (primary && COUNTRY_COORDS[primary]) {
      const pj = findLandJitter(
        seedFor(ritual.startAt, primary),
        COUNTRY_COORDS[primary],
        2,
        3,
      );
      jPos.set(primary, pj);
      const w = latLonToVec(pj[0], pj[1]);
      const rotIdeal = Math.atan2(-w[0], w[2]);
      // 2π baseline + forward slice so the earth performs between 1.0
      // and 2.0 full turns, averaging 1.5. The "+2π" is what makes the
      // sweep feel ceremonial instead of a single snap.
      const fwd = forwardDelta(rotStart, rotIdeal);
      rotEnd = rotStart + Math.PI * 2 + fwd;
      totalAngle = rotEnd - rotStart;
      litAt.set(primary, ritual.startAt + ritual.sweepMs);
    }

    // Non-primary countries light the first time the sweep passes them.
    // Convert angular progress → time via the inverse of ease-out-cubic,
    // so lights appear in lock-step with the visible rotation, not on
    // some unrelated linear schedule.
    for (const c of ritual.countries) {
      if (c === primary) continue;
      if (!COUNTRY_COORDS[c]) continue;
      const pj = findLandJitter(
        seedFor(ritual.startAt, c),
        COUNTRY_COORDS[c],
        6,
        10,
      );
      jPos.set(c, pj);
      const w = latLonToVec(pj[0], pj[1]);
      const rotIdeal = Math.atan2(-w[0], w[2]);
      const fwd = forwardDelta(rotStart, rotIdeal);
      // totalAngle ≥ 2π ≥ fwd, so every country is covered.
      const x = Math.min(1, fwd / totalAngle);
      // inverse of eased = 1 - (1-p)^3 → p = 1 - (1-eased)^(1/3)
      const tFrac = 1 - Math.pow(1 - x, 1 / 3);
      litAt.set(c, ritual.startAt + ritual.sweepMs * tFrac);
    }

    activeRef.current = {
      startAt: ritual.startAt,
      sweepMs: ritual.sweepMs,
      holdMs: ritual.holdMs,
      fadeMs: ritual.fadeMs,
      rotStart,
      rotEnd,
      totalAngle,
      primaryCountry: primary,
      litAt,
      jPos,
    };
  }, [ritual]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const BUF = Math.round(size * dpr);
    canvas.width = BUF;
    canvas.height = BUF;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const dots = fibSphere(3600);
    const cx = BUF / 2;
    const cy = BUF / 2;
    // Leave space for the moon's orbit inside the canvas.
    const R = (BUF / 2) / 1.55;
    const COS_T = Math.cos(TILT);
    const SIN_T = Math.sin(TILT);
    const MOON_COS = Math.cos(MOON_TILT);
    const MOON_SIN = Math.sin(MOON_TILT);

    let rafId = 0;
    let lastDraw = 0;
    const frameMin = 1000 / TARGET_FPS;
    let stopped = false;

    const draw = (t: number) => {
      if (stopped) return;
      if (t - lastDraw < frameMin) {
        rafId = requestAnimationFrame(draw);
        return;
      }
      lastDraw = t;

      ctx.clearRect(0, 0, BUF, BUF);

      // ---- Resolve rotation for this frame ----
      // Three regimes: idle (baseRot + rotOffset), sweeping (override
      // with eased interpolation from rotStart → rotEnd), and hold+fade
      // (frozen at rotEnd). On exit we commit the final rotation into
      // rotOffset so the next idle frame rolls forward from the same
      // place the ritual stopped.
      const realNow = Date.now();
      const active = activeRef.current;
      let rot: number;

      if (active) {
        const sweepEnd = active.startAt + active.sweepMs;
        const holdEnd = sweepEnd + active.holdMs;
        const fadeEnd = holdEnd + active.fadeMs;

        if (realNow <= active.startAt) {
          rot =
            (t / ROTATION_PERIOD_MS) * Math.PI * 2 + rotOffsetRef.current;
        } else if (realNow <= sweepEnd) {
          const p = (realNow - active.startAt) / active.sweepMs;
          const eased = 1 - Math.pow(1 - p, 3);
          rot = active.rotStart + active.totalAngle * eased;
        } else if (realNow <= fadeEnd) {
          rot = active.rotEnd;
        } else {
          // Seamless handoff: set rotOffset so baseRot(t) + rotOffset = rotEnd.
          const baseAt = (t / ROTATION_PERIOD_MS) * Math.PI * 2;
          let off = active.rotEnd - baseAt;
          off = Math.atan2(Math.sin(off), Math.cos(off));
          rotOffsetRef.current = off;
          activeRef.current = null;
          rot = baseAt + off;
        }
      } else {
        rot = (t / ROTATION_PERIOD_MS) * Math.PI * 2 + rotOffsetRef.current;
      }

      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);

      // ------ earth (two passes: ocean then land) ------
      // Higher base alphas + softer shading + softer limb darkening
      // make the sphere feel like a body rather than a faint silhouette.
      for (let pass = 0; pass < 2; pass++) {
        const isLandPass = pass === 1;
        const dotSize = (isLandPass ? 1.95 : 1.2) * dpr;
        const baseAlpha = isLandPass ? 0.98 : 0.32;

        for (const d of dots) {
          if (d.land !== isLandPass) continue;

          // Spin around Y, then tilt around Z.
          const x1 = d.x * cosR + d.z * sinR;
          const y1 = d.y;
          const z1 = -d.x * sinR + d.z * cosR;
          const rx = x1 * COS_T - y1 * SIN_T;
          const ry = x1 * SIN_T + y1 * COS_T;
          const rz = z1;

          if (rz < -0.02) continue; // back-facing (with a hair of margin)

          const sx = cx + R * rx;
          const sy = cy - R * ry;

          const lam = Math.max(0, LX * rx + LY * ry + LZ * rz);
          // More ambient, less directional — the dark hemisphere is
          // still readable as part of the same body.
          const shade = 0.42 + 0.58 * lam;
          const limb = Math.max(0, rz) ** 0.55;
          // Gentler limb darkening so the silhouette holds up.
          const alpha = baseAlpha * shade * (0.55 + 0.45 * limb);
          if (alpha < 0.012) continue;

          ctx.fillStyle = `rgba(212, 218, 226, ${alpha.toFixed(3)})`;
          ctx.fillRect(sx - dotSize / 2, sy - dotSize / 2, dotSize, dotSize);
        }
      }

      // ------ moon (drawn AFTER the earth so it can pass in front, with
      //   true depth occlusion against the earth's spherical surface) ------
      {
        const moonAngle = (t / MOON_PERIOD_MS) * Math.PI * 2;
        // Pre-tilt position on a circle in the XZ plane. `mz0` is negated
        // so the moon orbits in the same screen-direction as the earth's
        // rotation (both surfaces move left-to-right across the front
        // hemisphere). With +sin the moon moved opposite to the ground,
        // which read as "wrong physics" to the eye.
        const mx0 = Math.cos(moonAngle) * MOON_ORBIT_R;
        const mz0 = -Math.sin(moonAngle) * MOON_ORBIT_R;
        // Tilt the orbit plane around the X axis.
        const mx = mx0;
        const my = -mz0 * MOON_SIN;
        const mz = mz0 * MOON_COS;

        // True depth occlusion. The earth is a unit sphere centered at
        // origin; at any (mx, my) inside the unit disc, its visible surface
        // is at z = +sqrt(1 - mx² - my²). If the moon's z is *less* than
        // that, the moon sits behind the earth's bulge and is hidden.
        // Outside the unit disc the line of sight misses the earth, so
        // the moon is always visible there.
        const dInDisc2 = mx * mx + my * my;
        let occluded = false;
        if (dInDisc2 < 1) {
          const earthZ = Math.sqrt(1 - dInDisc2);
          if (mz < earthZ) occluded = true;
        }

        if (!occluded) {
          const moonSx = cx + R * mx;
          const moonSy = cy - R * my;
          const moonR = 4.2 * dpr;

          // Phase: shade by the same key light as the earth so they read
          // as belonging to the same scene. Bias a radial gradient toward
          // the lit hemisphere.
          const lit = Math.max(0, LX * mx + LY * my + LZ * mz) / MOON_ORBIT_R;
          const phase = 0.45 + 0.55 * lit;
          const litDx = LX * moonR * 0.45;
          const litDy = -LY * moonR * 0.45;
          const grad = ctx.createRadialGradient(
            moonSx + litDx,
            moonSy + litDy,
            0,
            moonSx,
            moonSy,
            moonR,
          );
          grad.addColorStop(0, `rgba(232, 226, 214, ${(0.78 * phase).toFixed(3)})`);
          grad.addColorStop(0.7, `rgba(180, 178, 172, ${(0.48 * phase).toFixed(3)})`);
          grad.addColorStop(1, "rgba(120, 120, 120, 0)");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(moonSx, moonSy, moonR, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ------ ritual highlights ------
      // Points light one-by-one during the sweep, bloom to full
      // intensity, then all fade together through the hold/fade tail.
      if (active) {
        const sweepEnd = active.startAt + active.sweepMs;
        const fadeStart = sweepEnd + active.holdMs;
        const fadeEnd = fadeStart + active.fadeMs;

        // Shared fade envelope — all points dim in unison after the
        // hold, so the picture resolves into a single held breath
        // instead of each point going out on its own schedule.
        let shared: number;
        if (realNow < fadeStart) shared = 1;
        else if (realNow < fadeEnd)
          shared = 1 - (realNow - fadeStart) / active.fadeMs;
        else shared = 0;

        if (shared > 0) {
          for (const [country, pos] of active.jPos) {
            const lit = active.litAt.get(country);
            if (lit === undefined || realNow < lit) continue;
            const isPrimary = country === active.primaryCountry;

            const w = latLonToVec(pos[0], pos[1]);
            const x1 = w[0] * cosR + w[2] * sinR;
            const y1 = w[1];
            const z1 = -w[0] * sinR + w[2] * cosR;
            const rx = x1 * COS_T - y1 * SIN_T;
            const ry = x1 * SIN_T + y1 * COS_T;
            const rz = z1;
            if (rz < 0) continue; // on the back of the globe right now

            const sx = cx + R * rx;
            const sy = cy - R * ry;

            // Per-point rise envelope: quick ignition, then full hold
            // until the shared fade takes over.
            const age = realNow - lit;
            const riseMs = isPrimary ? 600 : 380;
            let intensity = age < riseMs ? age / riseMs : 1;
            intensity *= shared;

            const limb = Math.max(0, rz);
            intensity *= 0.4 + 0.6 * limb;
            if (intensity < 0.012) continue;

            // Primary is noticeably stronger — the user's point should
            // be the gravitational center of the reveal, not just one
            // among the chorus.
            const glowR = (isPrimary ? 14 : 7) * dpr;
            const coreR = (isPrimary ? 3.2 : 1.5) * dpr;
            const color = isPrimary
              ? "255, 232, 205"
              : "210, 225, 238";

            const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
            grad.addColorStop(
              0,
              `rgba(${color}, ${(0.98 * intensity).toFixed(3)})`,
            );
            grad.addColorStop(
              0.35,
              `rgba(${color}, ${(0.42 * intensity).toFixed(3)})`,
            );
            grad.addColorStop(1, `rgba(${color}, 0)`);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(sx, sy, glowR, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = `rgba(${color}, ${intensity.toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(sx, sy, coreR, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);

    const onVis = () => {
      if (document.hidden) {
        stopped = true;
        cancelAnimationFrame(rafId);
      } else if (stopped) {
        stopped = false;
        rafId = requestAnimationFrame(draw);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      stopped = true;
      cancelAnimationFrame(rafId);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [size]);

  return <canvas ref={canvasRef} className="earth" aria-hidden="true" />;
}
