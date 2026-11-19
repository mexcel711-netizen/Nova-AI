import { useEffect, useRef } from 'react';
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

interface HoloParticle {
  x: number;
  y: number;
  r: number;
  speedY: number;
  drift: number;
  alpha: number;
  phaseOffset: number;
}

export function HolographicAvatar({
  state,
  emotion,
  assistantName,
  micLevel = 0,
  lipOpenness = 0,
  lipWidth = 0,
}: HolographicAvatarProps) {
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
    offscreen.width = 512;
    offscreen.height = 512;
    const offCtx = offscreen.getContext('2d');

    hologramImg.onload = () => {
      if (offCtx) {
        offCtx.clearRect(0, 0, 512, 512);
        offCtx.drawImage(hologramImg, 0, 0, 512, 512);
        // Smooth radial feather mask so the dark grid edges dissolve cleanly into the chamber
        offCtx.save();
        offCtx.globalCompositeOperation = 'destination-in';
        const feather = offCtx.createRadialGradient(256, 246, 118, 256, 256, 252);
        feather.addColorStop(0, 'rgba(0,0,0,1)');
        feather.addColorStop(0.68, 'rgba(0,0,0,0.92)');
        feather.addColorStop(0.88, 'rgba(0,0,0,0.38)');
        feather.addColorStop(1, 'rgba(0,0,0,0)');
        offCtx.fillStyle = feather;
        offCtx.fillRect(0, 0, 512, 512);
        offCtx.restore();
      }
      imageReady = true;
    };
    hologramImg.src = WAVY_HOLOGRAM_URL;

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

      const speed =
        curState === 'thinking'
          ? 0.042
          : curState === 'speaking'
            ? 0.032
            : curState === 'listening'
              ? 0.024
              : 0.012;
      if (!prefersReducedMotion) {
        phase += speed;
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
      const voiceEnergy =
        curState === 'speaking'
          ? Math.max(0.25, curLipOpen)
          : curState === 'listening'
            ? Math.max(0.25, curMic)
            : curState === 'thinking'
              ? 0.45
              : 0.14;
      const auraRadius = 132 + voiceEnergy * 24;
      const aura = ctx.createRadialGradient(cx, cy - 8, 18, cx, cy, auraRadius);
      aura.addColorStop(0, palette.glow);
      aura.addColorStop(0.55, 'rgba(14, 116, 144, 0.09)');
      aura.addColorStop(1, 'rgba(3, 10, 19, 0)');
      ctx.fillStyle = aura;
      ctx.fillRect(0, 0, width, height);

      // 3. Ethereal Long Flowing Wavy Hair Hologram Image
      const floatY = prefersReducedMotion ? 0 : Math.sin(phase * 1.25) * 3.0;
      const swayX = prefersReducedMotion ? 0 : Math.sin(phase * 0.75) * 1.4;
      const drawSize = 278;
      const drawX = cx - drawSize / 2 + swayX;
      const drawY = cy - drawSize / 2 + 2 + floatY;

      if (imageReady && offCtx) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.drawImage(offscreen, drawX, drawY, drawSize, drawSize);

        // Soft secondary glowing shimmer layer when speaking or thinking
        if (curState === 'speaking' || curState === 'thinking' || curState === 'listening') {
          ctx.globalAlpha = Math.min(0.45, 0.16 + voiceEnergy * 0.28);
          ctx.drawImage(
            offscreen,
            drawX - voiceEnergy * 3,
            drawY - voiceEnergy * 2,
            drawSize + voiceEnergy * 6,
            drawSize + voiceEnergy * 6
          );
        }
        ctx.restore();

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

      // 4. Luminous voice-reactive energy core near face/collar when speaking or listening
      if (curState === 'speaking' || curState === 'listening') {
        const mouthX = cx + 14 + swayX;
        const mouthY = cy - 26 + floatY;
        const pulseR = 14 + voiceEnergy * 22 + curLipWidth * 4;
        const pulse = ctx.createRadialGradient(mouthX, mouthY, 2, mouthX, mouthY, pulseR);
        pulse.addColorStop(0, `rgba(224, 242, 254, ${0.42 * voiceEnergy})`);
        pulse.addColorStop(0.5, palette.glow);
        pulse.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = pulse;
        ctx.beginPath();
        ctx.arc(mouthX, mouthY, pulseR, 0, Math.PI * 2);
        ctx.fill();
      }

      // 5. Flowing wavy light ribbons & drifting starlight particles around the silhouette
      if (!prefersReducedMotion) {
        ctx.save();
        for (const p of particles) {
          const py = ((p.y - phase * p.speedY * 22) % 1 + 1) % 1;
          const px = p.x + Math.sin(phase * 1.1 + p.phaseOffset) * p.drift;
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
      className="relative flex w-full items-center justify-center"
      data-testid="holographic-avatar"
      data-state={state}
      data-emotion={emotion}
    >
      <canvas
        ref={canvasRef}
        className="h-[232px] w-[300px] sm:h-[252px] sm:w-[328px]"
        aria-label={`${assistantName} wavy-hair holographic portrait: ${state}, expression ${emotion}`}
      />
    </div>
  );
}
