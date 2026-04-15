/**
 * Film grain via inline SVG. feTurbulence is rendered once by the browser
 * into the SVG bitmap and then tiled across the screen via CSS. No JS, no
 * canvas, no per-frame cost — the grain is static, but at low opacity that
 * reads as analog texture rather than noise. The slight stochastic variation
 * across pixel grids hides banding in the dark background and the earth.
 */
export default function Grain() {
  return (
    <div className="grain" aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg" width="220" height="220">
        <filter id="grain-noise">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
            stitchTiles="stitch"
          />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 1
                    0 0 0 0 1
                    0 0 0 0 1
                    0 0 0 0.55 0"
          />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain-noise)" />
      </svg>
    </div>
  );
}
