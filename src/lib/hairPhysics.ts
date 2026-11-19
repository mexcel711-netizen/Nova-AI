import type { AvatarState } from '../types/nova';

export const MIC_NOISE_FLOOR = 0.06;
export const LIP_NOISE_FLOOR = 0.03;

export interface HairWindInput {
  state: AvatarState;
  micLevel: number;
  lipOpenness: number;
}

export interface HairOffsetResult {
  dx: number;
  dy: number;
  mask: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Computes raw voice/speech activity into a normalized target wind intensity [0..1].
 * Returns exact 0 when the user and assistant are both quiet (hair settles straight down).
 */
export function computeTargetHairWind({ state, micLevel, lipOpenness }: HairWindInput): number {
  const mic = clamp01(micLevel);
  const lip = clamp01(lipOpenness);

  // Assistant speaking: lips + vocal envelope drive flowing wind through hair
  if (state === 'speaking') {
    if (lip <= LIP_NOISE_FLOOR) {
      return 0.42;
    }
    return clamp01(0.42 + lip * 0.58);
  }

  // User speaking into mic (during listening, wake-word watch, or active voice input)
  if (mic > MIC_NOISE_FLOOR) {
    const gated = clamp01((mic - MIC_NOISE_FLOOR) / (1 - MIC_NOISE_FLOOR));
    return clamp01(0.32 + gated * 0.68);
  }

  // Quiet listening pause or idle silence -> hair settles completely straight down
  return 0;
}

/**
 * Smoothly ramps wind up fast on speech onset and damps back to exact 0 when silent.
 */
export function stepHairWind(currentWind: number, targetWind: number, dtScale = 1): number {
  const cur = clamp01(currentWind);
  const tgt = clamp01(targetWind);
  const factor = tgt > cur ? Math.min(1, 0.22 * dtScale) : Math.min(1, 0.085 * dtScale);
  const next = cur + (tgt - cur) * factor;
  if (tgt === 0 && next < 0.004) {
    return 0;
  }
  return clamp01(next);
}

/**
 * Computes spatial hair mask [0..1] for the 512x512 portrait:
 * - Inner face oval (eyes, nose, lips, chin) = 0 (face stays crisp & anchored)
 * - Top crown (top < 0.13) = near 0 (root anchor on scalp)
 * - Left flowing waves (col < 0.46), right locks (col > 0.65), and lower hair ends = high mask
 */
export function computeHairRegionMask(colNorm: number, rowNorm: number): number {
  // Inner face anchor centered around (0.555, 0.305)
  const faceDx = (colNorm - 0.555) / 0.115;
  const faceDy = (rowNorm - 0.305) / 0.125;
  const faceDist = Math.hypot(faceDx, faceDy);
  const outsideFace = smoothstep(0.85, 1.38, faceDist);

  // Hair begins below top margin and tapers near draped bottom edge
  const verticalEnvelope =
    smoothstep(0.11, 0.23, rowNorm) * (1 - smoothstep(0.68, 0.92, rowNorm) * 0.55);

  // Outer flowing locks carry stronger wind deflection than central neck/chest
  const leftSide = 1 - smoothstep(0.28, 0.48, colNorm);
  const rightSide = smoothstep(0.63, 0.78, colNorm);
  const lowerCascade = smoothstep(0.45, 0.64, rowNorm) * 0.55;
  const lateralWeight = clamp01(Math.max(leftSide, rightSide, lowerCascade));

  return clamp01(outsideFace * verticalEnvelope * (0.25 + 0.75 * lateralWeight));
}

/**
 * Computes per-mesh-cell wind wave displacement in canvas pixels.
 * When wind === 0, returns exact { dx: 0, dy: 0 } so hair remains straight and still.
 */
export function computeHairMeshOffset(params: {
  colNorm: number;
  rowNorm: number;
  wind: number;
  phase: number;
  amplitudePx?: number;
}): HairOffsetResult {
  const wind = clamp01(params.wind);
  const mask = computeHairRegionMask(params.colNorm, params.rowNorm);
  if (wind <= 0 || mask <= 0.001) {
    return { dx: 0, dy: 0, mask };
  }

  const amp = params.amplitudePx ?? 14;
  const { colNorm, rowNorm, phase } = params;

  // Directional breeze flowing left-to-right & lifting wavy ends upward/outward
  const travelWave1 = Math.sin(phase * 4.3 - rowNorm * 8.2 - colNorm * 3.1);
  const travelWave2 = Math.sin(phase * 7.1 - rowNorm * 13.5 + colNorm * 2.2) * 0.38;
  const windLift = colNorm < 0.5 ? -0.35 : 0.38;

  const dx = wind * mask * amp * (travelWave1 * 0.78 + travelWave2 + windLift * 0.35);
  const dy =
    wind *
    mask *
    (amp * 0.42) *
    (Math.cos(phase * 3.6 - rowNorm * 7.5 + colNorm * 2.5) * 0.75 - 0.25);

  return { dx, dy, mask };
}
