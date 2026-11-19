import { useEffect, useRef } from 'react';
import {
  computeHairMeshOffset,
  computeTargetHairWind,
  stepHairWind,
} from '../lib/hairPhysics';
import type { AvatarState, FacialEmotion } from '../types/nova';

interface HolographicAvatarProps {
  state: AvatarState;
  emotion: FacialEmotion;
  assistantName: string;
  micLevel?: number;
  lipOpenness?: number;
  lipWidth?: number;
}

const WAVY_HOLOGRAM_URL = '/src/assets/images/nova_wavy_hologram_1795067914360.jpg';
const MESH_COLS = 14;
const MESH_ROWS = 16;
const OFFSCREEN_SIZE = 512;

interface HoloParticle {
  x: number;
  y: number;
  r: number;
  speedY: number;
  drift: number;
  alpha: number;
  phaseOffset: number;
}

const HAIR_STRAND_PATHS = [
  // Outer left wavy curls only (no overlap across face or shoulders)
  { x0: 0.37, y0: 0.21, cx1: 0.27, cy1: 0.26, cx2: 0.22, cy2: 0.35, x1: 0.16, y1: 0.44, side: -1 },
  { x0: 0.34, y0: 0.28, cx1: 0.25, cy1: 0.34, cx2: 0.20, cy2: 0.43, x1: 0.14, y1: 0.52, side: -1 },
  { x0: 0.33, y0: 0.35, cx1: 0.24, cy1: 0.42, cx2: 0.20, cy2: 0.50, x1: 0.17, y1: 0.58, side: -1 },
  // Outer right flowing hair lock
  { x0: 0.65, y0: 0.22, cx1: 0.72, cy1: 0.29, cx2: 0.76, cy2: 0.39, x1: 0.80, y1: 0.49, side: 1 },
  { x0: 0.67, y0: 0.29, cx1: 0.74, cy1: 0.37, cx2: 0.78, cy2: 0.46, x1: 0.82, y1: 0.56, side: 1 },
];

export function HolographicAvatar({
  state,
  emotion,
  assistantName,
  micLevel = 0,
  lipOpenness = 0,
  lipWidth = 0,
}: HolographicAvatarProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<AvatarState>(state);
  const emotionRef = useRef<FacialEmotion>(emotion);
  const micRef = useRef<number>(micLevel);
  const lipOpenRef = useRef<number>(lipOpenness);
  const lipWidthRef = useRef<number>(lipWidth);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    emotionRef.current = emotion;
  }, [emotion]);

  useEffect(() => {
    micRef.current = micLevel;
  }, [micLevel]);

  useEffect(() => {
    lipOpenRef.current = lipOpenness;
  }, [lipOpenness]);

  useEffect(() => {
    lipWidthRef.current = lipWidth;
  }, [lipWidth]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const hologramImg = new Image();
    let imageReady = false;
    const offscreen = document.createElement('canvas');
    offscreen.width = OFFSCREEN_SIZE;
    offscreen.height = OFFSCREEN_SIZE;
    const offCtx = offscreen.getContext('2d');

    hologramImg.onload = () => {
      if (offCtx) {
        offCtx.clearRect(0, 0, OFFSCREEN_SIZE, OFFSCREEN_SIZE);
        offCtx.drawImage(hologramImg, 0, 0, OFFSCREEN_SIZE, OFFSCREEN_SIZE);
        // Smooth radial feather mask so the dark grid edges dissolve cleanly into the chamber
        offCtx.save();
        offCtx.globalCompositeOperation = 'destination-in';
        const feather = offCtx.createRadialGradient(256, 246, 108, 256, 256, 236);
        feather.addColorStop(0, 'rgba(0,0,0,1)');
        feather.addColorStop(0.62, 'rgba(0,0,0,0.92)');
        feather.addColorStop(0.84, 'rgba(0,0,0,0.34)');
        feather.addColorStop(1, 'rgba(0,0,0,0)');
        offCtx.fillStyle = feather;
        offCtx.fillRect(0, 0, OFFSCREEN_SIZE, OFFSCREEN_SIZE);
        offCtx.restore();
      }
      imageReady = true;
    };
    hologramImg.src = WAVY_HOLOGRAM_URL;

    // Pre-allocate vertex coordinate grid for seamless 22x22 wind mesh deformation
    const vxGrid: number[][] = Array.from({ length: MESH_ROWS + 1 }, () =>
      new Array<number>(MESH_COLS + 1).fill(0)
    );
    const vyGrid: number[][] = Array.from({ length: MESH_ROWS + 1 }, () =>
      new Array<number>(MESH_COLS + 1).fill(0)
    );

    // Floating cyan/rose starlight micro-particles matching the Stonic wavy-hair hologram
    const particles: HoloParticle[] = Array.from({ length: 34 }, (_, idx) => ({
      x: 0.14 + ((idx * 37) % 72) / 100,
      y: 0.12 + ((idx * 53) % 76) / 100,
      r: 0.8 + (idx % 3) * 0.55,
      speedY: 0.00035 + (idx % 5) * 0.00014,
      drift: 0.004 + (idx % 4) * 0.002,
      alpha: 0.25 + (idx % 4) * 0.16,
      phaseOffset: idx * 0.7,
    }));

    const emotionWeights: Record<FacialEmotion, number> = {
      calm: 1,
      happy: 0,
      love: 0,
      sad: 0,
      surprised: 0,
      excited: 0,
      empathetic: 0,
      thoughtful: 0,
      confident: 0,
      angry: 0,
      curious: 0,
    };

    let rafId = 0;
    let phase = 0;
    let windPhase = 0;
    let currentWind = 0;
    let lastWindAttr = '';

    const drawDeformedMesh = (
      drawX: number,
      drawY: number,
      drawSize: number,
      wind: number,
      meshPhase: number,
      amplitudePx: number
    ) => {
      const srcStep = OFFSCREEN_SIZE / MESH_COLS;
      const dstStep = drawSize / MESH_COLS;

      for (let r = 0; r <= MESH_ROWS; r++) {
        const rowNorm = r / MESH_ROWS;
        for (let c = 0; c <= MESH_COLS; c++) {
          const colNorm = c / MESH_COLS;
          const { dx, dy } = computeHairMeshOffset({
            colNorm,
            rowNorm,
            wind,
            phase: meshPhase,
            amplitudePx,
          });
          vxGrid[r][c] = drawX + colNorm * drawSize + dx;
          vyGrid[r][c] = drawY + rowNorm * drawSize + dy;
        }
      }

      for (let r = 0; r < MESH_ROWS; r++) {
        const sy = r * srcStep;
        for (let c = 0; c < MESH_COLS; c++) {
          const sx = c * srcStep;
          const x0 = vxGrid[r][c];
          const y0 = vyGrid[r][c];
          const x1 = vxGrid[r][c + 1];
          const y1 = vyGrid[r + 1][c];
          const dw = Math.max(dstStep * 0.45, x1 - x0) + 0.65;
          const dh = Math.max(dstStep * 0.45, y1 - y0) + 0.65;

          ctx.drawImage(offscreen, sx, sy, srcStep, srcStep, x0, y0, dw, dh);
        }
      }
    };

    const renderFrame = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = 360;
      const height = 278;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const curState = stateRef.current;
      const curEmotion = emotionRef.current;
      const curMic = micRef.current;
      const curLipOpen = lipOpenRef.current;
      const curLipWidth = lipWidthRef.current;

      (Object.keys(emotionWeights) as FacialEmotion[]).forEach((k) => {
        const target = k === curEmotion ? 1 : 0;
        emotionWeights[k] += (target - emotionWeights[k]) * 0.08;
      });

      const targetWind = prefersReducedMotion
        ? 0
        : computeTargetHairWind({
            state: curState,
            micLevel: curMic,
            lipOpenness: curLipOpen,
          });
      currentWind = prefersReducedMotion ? 0 : stepHairWind(currentWind, targetWind);

      const windLabel = currentWind.toFixed(2);
      if (containerRef.current && windLabel !== lastWindAttr) {
        lastWindAttr = windLabel;
        containerRef.current.dataset.hairWind = windLabel;
      }

      const speed =
        curState === 'thinking'
          ? 0.042
          : curState === 'speaking'
            ? 0.034
            : curState === 'listening'
              ? 0.026
              : 0.012;
      if (!prefersReducedMotion) {
        phase += speed;
        windPhase += 0.028 + currentWind * 0.045;
      }

      const palette =
        curState === 'error' || curEmotion === 'angry'
          ? { primary: '#FF4D6D', secondary: '#FB7185', glow: 'rgba(255,77,109,0.28)', tint: 'rgba(255,77,109,0.22)' }
          : curEmotion === 'love'
            ? { primary: '#FB7185', secondary: '#F472B6', glow: 'rgba(251,113,133,0.32)', tint: 'rgba(244,114,182,0.24)' }
            : curEmotion === 'excited'
              ? { primary: '#38BDF8', secondary: '#34D399', glow: 'rgba(56,189,248,0.28)', tint: 'rgba(52,211,153,0.16)' }
              : curEmotion === 'sad'
                ? { primary: '#60A5FA', secondary: '#818CF8', glow: 'rgba(96,165,250,0.26)', tint: 'rgba(79,70,229,0.22)' }
                : curEmotion === 'happy'
                  ? { primary: '#22D3EE', secondary: '#10B981', glow: 'rgba(16,185,129,0.26)', tint: 'rgba(16,185,129,0.14)' }
                  : curEmotion === 'surprised'
                    ? { primary: '#7DD3FC', secondary: '#38BDF8', glow: 'rgba(125,211,252,0.34)', tint: 'rgba(56,189,248,0.20)' }
                    : { primary: '#38BDF8', secondary: '#22D3EE', glow: 'rgba(34,211,238,0.25)', tint: 'rgba(34,211,238,0.08)' };

      // 1. Subtle holographic micro-grid behind figure
      ctx.save();
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.05)';
      ctx.lineWidth = 1;
      for (let gx = 18; gx < width; gx += 18) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, height);
        ctx.stroke();
      }
      for (let gy = 18; gy < height; gy += 18) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(width, gy);
        ctx.stroke();
      }
      ctx.restore();

      // 2. Central radial volumetric glow behind wavy hair
      const voiceEnergy = Math.max(
        currentWind,
        curState === 'thinking' ? 0.45 : 0.14
      );
      const auraRadius = 132 + voiceEnergy * 24;
      const aura = ctx.createRadialGradient(cx, cy - 8, 18, cx, cy, auraRadius);
      aura.addColorStop(0, palette.glow);
      aura.addColorStop(0.55, 'rgba(14, 116, 144, 0.09)');
      aura.addColorStop(1, 'rgba(3, 10, 19, 0)');
      ctx.fillStyle = aura;
      ctx.fillRect(0, 0, width, height);

      // 3. Ethereal Long Flowing Wavy Hair Hologram Image
      // Calm & straight when quiet (currentWind === 0); buoyant & flowing in the wind when talking
      const calmMotion = 0.25 + currentWind * 0.75;
      const floatY = prefersReducedMotion ? 0 : Math.sin(phase * 1.2) * 2.6 * calmMotion;
      const swayX = prefersReducedMotion ? 0 : Math.sin(phase * 0.75) * 1.8 * currentWind;
      const drawSize = 278;
      const drawX = cx - drawSize / 2 + swayX;
      const drawY = cy - drawSize / 2 + 2 + floatY;

      if (imageReady && offCtx) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';

        if (currentWind <= 0.002) {
          // Quiet resting state: crisp, calm, straight hair down her shoulders
          ctx.drawImage(offscreen, drawX, drawY, drawSize, drawSize);
        } else {
          // Voice active: seamless 14x16 mesh waves hair in the breeze while keeping face anchored
          drawDeformedMesh(drawX, drawY, drawSize, currentWind, windPhase, 19);
        }
        ctx.restore();

        // Soft misty outer hair wisps along left & right curls (visible only while speaking/talking)
        if (currentWind > 0.04 && !prefersReducedMotion) {
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          ctx.lineCap = 'round';
          ctx.shadowBlur = 12;
          ctx.shadowColor =
            emotionWeights.love > 0.35 ? 'rgba(251, 182, 206, 0.45)' : 'rgba(56, 189, 248, 0.5)';
          for (let i = 0; i < HAIR_STRAND_PATHS.length; i++) {
            const s = HAIR_STRAND_PATHS[i];
            const rippleA = Math.sin(windPhase * 4.2 + i * 0.9) * (6 + currentWind * 11) * s.side;
            const rippleB = Math.cos(windPhase * 3.5 + i * 1.1) * (4 + currentWind * 8);
            const x0 = drawX + s.x0 * drawSize;
            const y0 = drawY + s.y0 * drawSize;
            const cx1 = drawX + s.cx1 * drawSize + rippleA * 0.35;
            const cy1 = drawY + s.cy1 * drawSize - Math.abs(rippleB) * 0.25;
            const cx2 = drawX + s.cx2 * drawSize + rippleA * 0.75;
            const cy2 = drawY + s.cy2 * drawSize + rippleB * 0.45;
            const x1 = drawX + s.x1 * drawSize + rippleA;
            const y1 = drawY + s.y1 * drawSize + rippleB * 0.65;

            ctx.strokeStyle =
              emotionWeights.love > 0.35
                ? `rgba(251, 182, 206, ${Math.min(0.22, currentWind * 0.2)})`
                : `rgba(125, 249, 255, ${Math.min(0.24, currentWind * 0.22)})`;
            ctx.lineWidth = 2.6 + currentWind * 1.6;
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.bezierCurveTo(cx1, cy1, cx2, cy2, x1, y1);
            ctx.stroke();
          }
          ctx.restore();
        }

        // Emotion-reactive luminous tint overlay (preserves cyan wavy core while warming Love/Happy/Sad)
        if (emotionWeights.love + emotionWeights.sad + emotionWeights.happy + emotionWeights.angry > 0.1) {
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          const emoGrad = ctx.createRadialGradient(cx, cy - 16, 12, cx, cy, 130);
          emoGrad.addColorStop(0, palette.tint);
          emoGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = emoGrad;
          ctx.fillRect(0, 0, width, height);
          ctx.restore();
        }
      }

      // 4. Luminous voice-reactive energy core near face/collar when speaking or actively talking
      if (currentWind > 0.04) {
        const mouthX = cx + 14 + swayX;
        const mouthY = cy - 26 + floatY;
        const pulseR = 14 + currentWind * 20 + curLipWidth * 4;
        const pulse = ctx.createRadialGradient(mouthX, mouthY, 2, mouthX, mouthY, pulseR);
        pulse.addColorStop(0, `rgba(224, 242, 254, ${0.42 * currentWind})`);
        pulse.addColorStop(0.5, palette.glow);
        pulse.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = pulse;
        ctx.beginPath();
        ctx.arc(mouthX, mouthY, pulseR, 0, Math.PI * 2);
        ctx.fill();
      }

      // 5. Drifting starlight particles around the silhouette (accelerate gently in voice breeze)
      if (!prefersReducedMotion) {
        ctx.save();
        const windDriftBoost = 1 + currentWind * 1.4;
        for (const p of particles) {
          const py = ((p.y - phase * p.speedY * 22) % 1 + 1) % 1;
          const px = p.x + Math.sin(phase * 1.1 + p.phaseOffset) * p.drift * windDriftBoost;
          const xPos = px * width;
          const yPos = py * height;
          const distFromCenter = Math.hypot(xPos - cx, yPos - cy);
          if (distFromCenter < 142) {
            const twinkle = 0.5 + 0.5 * Math.sin(phase * 2.2 + p.phaseOffset);
            ctx.fillStyle =
              emotionWeights.love > 0.35
                ? `rgba(251, 182, 206, ${p.alpha * twinkle})`
                : `rgba(165, 243, 252, ${p.alpha * twinkle})`;
            ctx.beginPath();
            ctx.arc(xPos, yPos, p.r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }

      // 6. Subtle horizontal holographic scanlines
      ctx.fillStyle = 'rgba(103, 232, 249, 0.025)';
      for (let sy = 4; sy < height; sy += 4) {
        ctx.fillRect(0, sy, width, 1);
      }

      ctx.restore();

      if (!prefersReducedMotion) {
        rafId = requestAnimationFrame(renderFrame);
      }
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative flex w-full items-center justify-center"
      data-testid="holographic-avatar"
      data-state={state}
      data-emotion={emotion}
      data-hair-wind="0.00"
    >
      <canvas
        ref={canvasRef}
        className="h-[232px] w-[300px] sm:h-[252px] sm:w-[328px]"
        aria-label={`${assistantName} wavy-hair holographic portrait: ${state}, expression ${emotion}`}
      />
    </div>
  );
}
