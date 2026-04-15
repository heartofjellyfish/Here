"use client";

import { useEffect, useRef } from "react";
import { COUNTRY_COORDS, POP_HOTSPOTS } from "@/lib/countries";

/**
 * A single "resonance ritual" dispatched by Scene after a tap. Earth
 * owns the choreography, five phases back-to-back:
 *
 *   snap    earth eases from its current rotation to the user's own
 *           country; at the end, that country ignites first
 *   ignite  earth holds still for a beat — one light, alone on the
 *           globe, so the user's "+1" has its own small moment before
 *           anything else moves
 *   sweep   one slow full turn forward from there — every other recent
 *           country lights as it passes the front meridian, so the
 *           lights bloom in step with what the viewer actually sees
 *   flash   sweep ends right back at the user's point; the earth
 *           holds still while the entire universe flashes
 *   fade    everything dims together, earth resumes its idle rotation
 *
 * Times are wall-clock (Date.now()) — the outer scheduler and the
 * canvas loop use the same reference frame.
 */
export interface Ritual {
  startAt: number;
  primaryCountry: string | null;
  /** Optional precise [lat, lon] for the primary tap, from edge
   *  geoip. When present, overrides the hotspot-weighted jitter so
   *  a Bay Area user's point actually lands in the Bay Area. */
  primaryPos?: [number, number] | null;
  countries: string[];
  snapMs: number;
  igniteMs: number;
  sweepMs: number;
  flashMs: number;
  fadeMs: number;
}

/**
 * A single "somebody else is here too" light. Scheduled by Scene after
 * the user's own ritual ends — each one represents a real (or ambient
 * synthetic) tap somewhere in the world, rendered as a quiet bloom on
 * its country. No camera movement, no flash, just a small presence.
 */
export interface Witness {
  id: string;
  country: string;
  /** Wall-clock moment at which this bloom should begin (Date.now()). */
  appearAt: number;
}

// Witness bloom lifecycle — defaults shown here; the values that
// actually drive the render come from the `witnessTiming` prop, so
// Scene can override them via URL params (?rise=&hold=&fade=).
// Scene is the source of truth for lifetime (it uses the sum to GC
// the list); keeping these in sync is the reason timing is threaded
// as a single object instead of three separate props.
// The tail is intentionally long by default: at ~160s rotation, a
// light born on the back of the globe has ~20s of fade to rotate
// into view, so you don't miss as many as you would with a 5s pop.
const DEFAULT_WITNESS_RISE_MS = 1500;
const DEFAULT_WITNESS_HOLD_MS = 6000;
const DEFAULT_WITNESS_FADE_MS = 20000;

export type WitnessTiming = {
  riseMs: number;
  holdMs: number;
  fadeMs: number;
};

/**
 * The user's own tap, pinned permanently. After the ritual fades, this
 * takes over as a small persistent amber dot — "你一直在这里" — with a
 * slow breathing pulse so it feels alive without screaming for
 * attention. Distinct from witnesses (cool blue, short-lived): this is
 * warm and always-on.
 */
export interface Home {
  country: string;
  /** Wall-clock moment the home point was planted — used as the phase
   *  reference for the breathing pulse so the effect is stable
   *  per-session instead of sync'd to epoch. Also the seed for the
   *  fallback hotspot jitter, so it matches the ritual primary when
   *  no edge geoip coords were available. */
  startAt: number;
  /** Optional precise [lat, lon] from edge geoip. When present, the
   *  home dot's latitude comes from here instead of the country
   *  hotspot fallback. */
  pos?: [number, number] | null;
}

type Props = {
  size?: number;
  ritual?: Ritual | null;
  witnesses?: ReadonlyArray<Witness>;
  witnessTiming?: WitnessTiming;
  home?: Home | null;
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

/**
 * Pick a population center for the given country if we know any, then
 * add a small jitter so clusters don't stack pixel-on-pixel. Falls
 * back to centroid-based jitter for countries without a hotspot table.
 *
 * Why: a naive centroid + big jitter on China spreads points from Tibet
 * to the coast, which reads wrong — real density sits east of the Hu
 * Line. Same story for Russia (west of the Urals), Canada (along the
 * US border), Australia (coastal ring), etc. Hotspots concentrate the
 * simulated "万家灯火" onto places where people actually live, so the
 * globe lights up in a pattern that matches a night-side satellite
 * photo instead of a uniform country shape.
 *
 * The hotspot is picked deterministically from the seed (weighted by
 * each city's rough population share), then perturbed by ~0.4° (~45km
 * at the equator) so two taps in the same city don't collapse to one
 * pixel. We verify land because some coastal hotspots (Hong Kong,
 * Miami) can land just offshore after jitter.
 */
function findPopulationWeightedJitter(
  seed: number,
  country: string,
): [number, number] {
  const hotspots = POP_HOTSPOTS[country];
  if (!hotspots || hotspots.length === 0) {
    const base = COUNTRY_COORDS[country];
    if (!base) return [0, 0];
    return findLandJitter(seed, base, 6, 10);
  }
  // Weighted pick. Total weight is small (O(10-20 cities), sums of
  // small integers), so a fresh scan per call is cheap and we avoid
  // caching state per-country.
  let total = 0;
  for (const h of hotspots) total += h[2];
  // Mix the seed so adjacent appearAts don't pick adjacent hotspots.
  const mix = Math.sin(seed * 0.61803398875) * 43758.5453;
  const roll = (mix - Math.floor(mix)) * total;
  let acc = 0;
  let chosen = hotspots[0];
  for (const h of hotspots) {
    acc += h[2];
    if (roll < acc) {
      chosen = h;
      break;
    }
  }
  const [cLat, cLon] = [chosen[0], chosen[1]];
  // Tight jitter — we want "somewhere in this metro," not "somewhere
  // in this country." 0.4° ≈ 45km at the equator, less at higher
  // latitudes; metro areas are usually larger than that.
  let sLat = 0.4;
  let sLon = 0.4;
  let s = seed;
  for (let i = 0; i < 4; i++) {
    const [dLat, dLon] = jitterFor(s, sLat, sLon);
    const lat = cLat + dLat;
    const lon = cLon + dLon;
    if (isLand(lat, lon)) return [lat, lon];
    sLat *= 0.6;
    sLon *= 0.6;
    s = (s + 1337) | 0;
  }
  // Hotspots are authored on land; falling back to the unperturbed
  // hotspot is fine.
  return [cLat, cLon];
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
  snapMs: number;
  igniteMs: number;
  sweepMs: number;
  flashMs: number;
  fadeMs: number;
  /** Rotation at startAt (continuous with idle rotation before). */
  rotStart: number;
  /** Forward angular delta during the snap phase (0 if no primary). */
  snapDelta: number;
  /** Rotation when snap ends — primary sits at front center. Also
   *  where the sweep begins and, by construction, ends. */
  rotPrimaryIdeal: number;
  primaryCountry: string | null;
  litAt: Map<string, number>;
  /** Jittered (lat, lon) per country, precomputed so the target-snap and
   *  the rendered point line up exactly. */
  jPos: Map<string, [number, number]>;
};

// ------ component ------

export default function Earth({
  size = 320,
  ritual = null,
  witnesses,
  witnessTiming,
  home = null,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Bloom lifecycle. Published to a ref so the per-frame draw loop
  // picks up new timing without tearing down the canvas effect.
  const timingRef = useRef<WitnessTiming>({
    riseMs: DEFAULT_WITNESS_RISE_MS,
    holdMs: DEFAULT_WITNESS_HOLD_MS,
    fadeMs: DEFAULT_WITNESS_FADE_MS,
  });
  if (witnessTiming) timingRef.current = witnessTiming;

  // Rotation is `baseRot(t) + rotOffset`. The ritual temporarily takes
  // over the rotation; on exit we write back to rotOffset so the idle
  // loop picks up exactly where the ritual stopped — no visible jump.
  const rotOffsetRef = useRef(0);
  const activeRef = useRef<ActiveRitual | null>(null);

  // Witnesses are published to the draw loop via a ref so new ones
  // arriving don't tear down the canvas effect. The draw loop reads
  // `witnessesRef.current` every frame, so state changes propagate
  // immediately without re-mount.
  const witnessesRef = useRef<ReadonlyArray<Witness>>([]);
  // Jittered land positions per witness id, computed once and cached.
  // Keeps two witnesses in the same country from stacking on the same
  // pixel, and keeps the geometry stable across frames.
  const witnessPosRef = useRef<Map<string, [number, number]>>(new Map());

  useEffect(() => {
    const list = witnesses ?? [];
    witnessesRef.current = list;
    const posMap = witnessPosRef.current;
    const alive = new Set<string>();
    for (const w of list) {
      alive.add(w.id);
      if (posMap.has(w.id)) continue;
      if (!COUNTRY_COORDS[w.country]) continue;
      // `appearAt` salts the seed so two witnesses in the same country
      // at different moments don't land on exactly the same jittered
      // spot — the "lights of a city" look has to come from real
      // spread, not from identical geometry. Population-weighted
      // placement means the spread matches where people actually live
      // (coastal China, not Tibet), not the country's geometric area.
      const seed = seedFor(w.appearAt, w.country);
      posMap.set(w.id, findPopulationWeightedJitter(seed, w.country));
    }
    // Drop cached positions for witnesses that have aged out.
    for (const key of Array.from(posMap.keys())) {
      if (!alive.has(key)) posMap.delete(key);
    }
  }, [witnesses]);

  // Home point — the user's own pinned light. Position is resolved
  // once per (country, startAt) via the same hotspot-aware placement
  // the witness stream uses, so the user's dot also lands on a real
  // city rather than a centroid. Cached in a ref so the draw loop can
  // read it every frame without touching React state.
  const homeRef = useRef<
    | { country: string; startAt: number; pos: [number, number] }
    | null
  >(null);
  if (home) {
    const cur = homeRef.current;
    const needs =
      !cur || cur.country !== home.country || cur.startAt !== home.startAt;
    if (needs && COUNTRY_COORDS[home.country]) {
      // Prefer precise geoip coords; fall back to the same hotspot
      // pick the ritual primary used, keyed on startAt so the seeds
      // match.
      const seed = seedFor(home.startAt, home.country);
      const pos: [number, number] = home.pos
        ? home.pos
        : findPopulationWeightedJitter(seed, home.country);
      homeRef.current = {
        country: home.country,
        startAt: home.startAt,
        pos,
      };
    }
  } else {
    homeRef.current = null;
  }

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
    let snapDelta = 0;
    let rotPrimaryIdeal = rotStart;

    if (primary && COUNTRY_COORDS[primary]) {
      // Prefer precise edge geoip coords when we have them — a Bay
      // Area user should see their dot in the Bay Area, not in NYC.
      // Fall back to hotspot-weighted jitter, seeded by ritual.startAt
      // so the ritual primary and the post-fade home dot land on the
      // exact same pixel (same seed + same algorithm = same result).
      const pj: [number, number] = ritual.primaryPos
        ? ritual.primaryPos
        : findPopulationWeightedJitter(
            seedFor(ritual.startAt, primary),
            primary,
          );
      jPos.set(primary, pj);
      const w = latLonToVec(pj[0], pj[1]);
      const rotIdeal = Math.atan2(-w[0], w[2]);
      // Forward-only snap so the camera moves with the rotation
      // direction, never against it. Feels like the globe is turning
      // to face the viewer rather than rewinding.
      snapDelta = forwardDelta(rotStart, rotIdeal);
      rotPrimaryIdeal = rotStart + snapDelta;
      // Primary ignites the moment the camera lands on it.
      litAt.set(primary, ritual.startAt + ritual.snapMs);
    }

    // Sweep is exactly one forward turn from rotPrimaryIdeal, which
    // lands the camera right back on the primary. Every non-primary
    // country crosses the front meridian exactly once during this turn
    // — we pre-compute the moment for each so lights appear in
    // lock-step with the visible rotation (linear sweep → linear
    // distribution in time). Sweep doesn't start until after the
    // ignite hold, so chorus times carry an igniteMs offset.
    const sweepStartMs = ritual.snapMs + ritual.igniteMs;
    const sweepAngle = Math.PI * 2;
    for (const c of ritual.countries) {
      if (c === primary) continue;
      if (!COUNTRY_COORDS[c]) continue;
      // Same hotspot-aware placement the witnesses use, so the ritual
      // chorus and the later witness stream read as one coherent world
      // — a country doesn't light Beijing during the sweep and then
      // Tibet in witness mode.
      const pj = findPopulationWeightedJitter(seedFor(ritual.startAt, c), c);
      jPos.set(c, pj);
      const w = latLonToVec(pj[0], pj[1]);
      const rotIdeal = Math.atan2(-w[0], w[2]);
      const fwd = forwardDelta(rotPrimaryIdeal, rotIdeal);
      const tFrac = fwd / sweepAngle;
      litAt.set(c, ritual.startAt + sweepStartMs + ritual.sweepMs * tFrac);
    }

    activeRef.current = {
      startAt: ritual.startAt,
      snapMs: ritual.snapMs,
      igniteMs: ritual.igniteMs,
      sweepMs: ritual.sweepMs,
      flashMs: ritual.flashMs,
      fadeMs: ritual.fadeMs,
      rotStart,
      snapDelta,
      rotPrimaryIdeal,
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

    // Pre-render the witness bloom into an offscreen sprite. Each
    // witness draw used to call createRadialGradient (~20-50μs each)
    // plus arc()+fill() twice; at sim=200 with a long fade we can have
    // 100+ concurrent blooms, so the gradient alloc dominated frame
    // cost. Baking the glow+core into a single sprite at intensity=1
    // and drawing it with globalAlpha for per-witness brightness is
    // mathematically identical (every stop scales linearly with
    // globalAlpha) and ~50-100× faster per draw.
    //
    // Sprite is sized to exactly the original glow radius (no scaling
    // at draw time → no resampling artifacts). The sprite is dpr-aware
    // because it's built inside this effect, which already keys on
    // size; if dpr changes (display switch) the canvas re-init picks
    // up the new sprite.
    const WITNESS_GLOW_R = 5.5 * dpr;
    const WITNESS_CORE_R = 1.35 * dpr;
    const WITNESS_COLOR = "198, 220, 238";
    const witnessSprite = (() => {
      const pad = 1;
      const dim = Math.ceil(WITNESS_GLOW_R * 2 + pad * 2);
      const c = document.createElement("canvas");
      c.width = dim;
      c.height = dim;
      const sctx = c.getContext("2d");
      if (!sctx) return c;
      const scx = dim / 2;
      const scy = dim / 2;
      const grad = sctx.createRadialGradient(
        scx,
        scy,
        0,
        scx,
        scy,
        WITNESS_GLOW_R,
      );
      grad.addColorStop(0, `rgba(${WITNESS_COLOR}, 0.7)`);
      grad.addColorStop(0.4, `rgba(${WITNESS_COLOR}, 0.26)`);
      grad.addColorStop(1, `rgba(${WITNESS_COLOR}, 0)`);
      sctx.fillStyle = grad;
      sctx.beginPath();
      sctx.arc(scx, scy, WITNESS_GLOW_R, 0, Math.PI * 2);
      sctx.fill();
      sctx.fillStyle = `rgba(${WITNESS_COLOR}, 0.82)`;
      sctx.beginPath();
      sctx.arc(scx, scy, WITNESS_CORE_R, 0, Math.PI * 2);
      sctx.fill();
      return c;
    })();
    const witnessHalf = witnessSprite.width / 2;

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
      // Regimes: idle → snap (ease-in-out toward primary) → sweep
      // (linear, exactly one forward turn back to primary) → flash
      // (held at primary while the sky blooms) → fade (still held)
      // → idle again. On the final transition we commit the rotation
      // into rotOffset so idle picks up without a visible jump.
      const realNow = Date.now();
      const active = activeRef.current;
      let rot: number;

      if (active) {
        const snapEnd = active.startAt + active.snapMs;
        const igniteEnd = snapEnd + active.igniteMs;
        const sweepEnd = igniteEnd + active.sweepMs;
        const flashEnd = sweepEnd + active.flashMs;
        const fadeEnd = flashEnd + active.fadeMs;

        if (realNow <= active.startAt) {
          rot =
            (t / ROTATION_PERIOD_MS) * Math.PI * 2 + rotOffsetRef.current;
        } else if (realNow <= snapEnd) {
          // Ease-in-out cosine: starts from (near) rest, accelerates,
          // settles softly on the primary. No abrupt camera flick.
          const p = (realNow - active.startAt) / active.snapMs;
          const eased = (1 - Math.cos(Math.PI * p)) / 2;
          rot = active.rotStart + active.snapDelta * eased;
        } else if (realNow <= igniteEnd) {
          // Ignite hold: rotation is frozen on primary. The user's
          // point is alone on the globe, lit and steady, before
          // anything else moves. Don't rush the +1.
          rot = active.rotPrimaryIdeal;
        } else if (realNow <= sweepEnd) {
          // Linear constant-speed sweep — slow and unhurried. Linear
          // (rather than eased) also means each country's pre-computed
          // lit-time lands exactly when the camera passes it.
          const p = (realNow - igniteEnd) / active.sweepMs;
          rot = active.rotPrimaryIdeal + Math.PI * 2 * p;
        } else if (realNow <= fadeEnd) {
          // Held at primary through flash and fade.
          rot = active.rotPrimaryIdeal + Math.PI * 2;
        } else {
          // Seamless handoff.
          const baseAt = (t / ROTATION_PERIOD_MS) * Math.PI * 2;
          let off = active.rotPrimaryIdeal + Math.PI * 2 - baseAt;
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
      // Primary ignites at snap end and holds alone through the ignite
      // beat. The sweep then lights every other recent country in step
      // with the rotation. All stay on through the flash, then dim
      // together during the fade.
      if (active) {
        const sweepEnd =
          active.startAt + active.snapMs + active.igniteMs + active.sweepMs;
        const fadeStart = sweepEnd + active.flashMs;
        const fadeEnd = fadeStart + active.fadeMs;

        // Shared fade envelope — all points dim in unison after the
        // flash, so the picture resolves into a single held breath
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

      // ------ witness lights ------
      // After the user's own ritual ends, these are the taps happening
      // elsewhere right now. Each rises over 1.5s, holds for 6s, then
      // fades over 20s. Intentionally smaller and cooler than ritual
      // lights — witnesses, not the center of anything. No camera
      // movement, so a point born on the back of the globe is simply
      // unseen until the idle rotation carries it round.
      {
        const list = witnessesRef.current;
        if (list.length > 0) {
          const posMap = witnessPosRef.current;
          const { riseMs, holdMs, fadeMs } = timingRef.current;
          const WITNESS_TOTAL = riseMs + holdMs + fadeMs;
          // Cool pale blue, baked into witnessSprite. Distinct from
          // the ritual's warm primary (amber) and chorus (near-white),
          // so a viewer who caught the ritual reads these as "other
          // people."
          for (const w of list) {
            const age = realNow - w.appearAt;
            if (age < 0 || age > WITNESS_TOTAL) continue;
            // Envelope: rise (linear) → hold → fade (linear-ish).
            // riseMs or fadeMs can be 0 — guard division.
            let env: number;
            if (age < riseMs) {
              env = riseMs > 0 ? age / riseMs : 1;
            } else if (age < riseMs + holdMs) {
              env = 1;
            } else {
              const fa = age - riseMs - holdMs;
              env = fadeMs > 0 ? Math.max(0, 1 - fa / fadeMs) : 0;
            }
            if (env <= 0) continue;

            const pos = posMap.get(w.id);
            if (!pos) continue;

            const wv = latLonToVec(pos[0], pos[1]);
            const x1 = wv[0] * cosR + wv[2] * sinR;
            const y1 = wv[1];
            const z1 = -wv[0] * sinR + wv[2] * cosR;
            const rx = x1 * COS_T - y1 * SIN_T;
            const ry = x1 * SIN_T + y1 * COS_T;
            const rz = z1;
            if (rz < 0) continue;

            const sx = cx + R * rx;
            const sy = cy - R * ry;

            // Limb fade so points near the silhouette don't punch too
            // hard. Gentler than ritual lights' limb curve — witnesses
            // should feel absorbed into the world, not lit onto it.
            const limb = Math.max(0, rz);
            const intensity = env * (0.38 + 0.62 * limb);
            if (intensity < 0.01) continue;

            // Sprite-blit instead of per-frame radial gradient. The
            // sprite was baked at intensity=1 with the original
            // alpha stops (0.7, 0.26, 0; core 0.82); globalAlpha
            // multiplies every pixel uniformly, so the result is
            // identical to the old per-witness gradient build.
            ctx.globalAlpha = intensity;
            ctx.drawImage(witnessSprite, sx - witnessHalf, sy - witnessHalf);
          }
          ctx.globalAlpha = 1;
        }
      }

      // ------ home point ------
      // The user's own tap, pinned to the surface at their real
      // lat/lon. Turns with the earth like any other geographic
      // point — rises and sets on its natural rhythm, so it reads as
      // "your place on the planet," not a HUD element. The ritual
      // primary and this dot use the same [lat, lon] (precise geoip
      // when available, otherwise the matching hotspot jitter), so
      // the handoff from ritual-fade to home lands on the exact same
      // pixel. Warm amber with a heartbeat pulse.
      {
        const h = homeRef.current;
        if (h) {
          const wv = latLonToVec(h.pos[0], h.pos[1]);
          const x1 = wv[0] * cosR + wv[2] * sinR;
          const y1 = wv[1];
          const z1 = -wv[0] * sinR + wv[2] * cosR;
          const rx = x1 * COS_T - y1 * SIN_T;
          const ry = x1 * SIN_T + y1 * COS_T;
          const rz = z1;
          if (rz >= 0) {
            const sx = cx + R * rx;
            const sy = cy - R * ry;
            const limb = Math.max(0, rz);
            // Heartbeat pulse. Two gaussians per beat — a sharp
            // systolic "lub" at ~5% into the cycle, a softer
            // diastolic "dub" at ~22%, then a long rest until the
            // next beat. 72 bpm = 0.833s per cycle, ordinary resting
            // heart rate. Two exp() calls per frame — cheap.
            const tSec = (realNow - h.startAt) / 1000;
            const BEAT_PERIOD = 60 / 72;
            const phase = (tSec % BEAT_PERIOD) / BEAT_PERIOD;
            const lub = Math.exp(-Math.pow((phase - 0.05) * 18, 2));
            const dub = 0.55 * Math.exp(-Math.pow((phase - 0.22) * 22, 2));
            const beat = Math.max(lub, dub);
            // Baseline + heartbeat. Baseline keeps the dot visible
            // between beats; the pulse rides on top. Range ~0.72..1.0.
            const breath = 0.72 + 0.28 * beat;
            // Halo shimmer: a very slow breathing on the outer glow,
            // decoupled from the beat — skin glow vs. pulse. Keeps
            // the dot from reading as a purely binary on/off.
            const shimmer = 0.85 + 0.15 * Math.sin(tSec * 0.47 + 1.3);
            const intensity = breath * (0.55 + 0.45 * limb);

            const glowR = 10 * dpr;
            const coreR2 = 2.2 * dpr;
            const color = "255, 232, 205"; // matches ritual primary

            const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
            grad.addColorStop(
              0,
              `rgba(${color}, ${(0.9 * intensity).toFixed(3)})`,
            );
            grad.addColorStop(
              0.4,
              `rgba(${color}, ${(0.36 * intensity * shimmer).toFixed(3)})`,
            );
            grad.addColorStop(1, `rgba(${color}, 0)`);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(sx, sy, glowR, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = `rgba(${color}, ${intensity.toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(sx, sy, coreR2, 0, Math.PI * 2);
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
