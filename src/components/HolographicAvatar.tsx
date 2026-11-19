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

const PORTRAIT_URL = '/src/assets/images/nova_face_calm_1794984619940.jpg';

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

    // Load realistic Pakistani female portrait + sample authentic skin/lip colors
    const portrait = new Image();
    let imageReady = false;
    const offscreen = document.createElement('canvas');
    offscreen.width = 512;
    offscreen.height = 512;
    const offCtx = offscreen.getContext('2d', { willReadFrequently: true });

    // Pre-baked feathered lower-lip + chin patch for seamless jaw articulation
    const jawCanvas = document.createElement('canvas');
    jawCanvas.width = 160;
    jawCanvas.height = 96;
    const jawCtx = jawCanvas.getContext('2d');

    let eyelidColorL = 'rgb(169, 129, 104)';
    let eyelidColorR = 'rgb(190, 145, 124)';
    let lipColor = 'rgb(156, 86, 82)';

    const JAW_SRC_X = 0.375;
    const JAW_SRC_Y = 0.529;
    const JAW_SRC_W = 0.262;
    const JAW_SRC_H = 0.132;

    portrait.onload = () => {
      if (offCtx) {
        offCtx.drawImage(portrait, 0, 0, 512, 512);
        try {
          const eyeL = offCtx.getImageData(Math.round(512 * 0.422), Math.round(512 * 0.33), 1, 1).data;
          eyelidColorL = `rgb(${eyeL[0]}, ${eyeL[1]}, ${eyeL[2]})`;
          const eyeR = offCtx.getImageData(Math.round(512 * 0.585), Math.round(512 * 0.33), 1, 1).data;
          eyelidColorR = `rgb(${eyeR[0]}, ${eyeR[1]}, ${eyeR[2]})`;
          const lipSample = offCtx.getImageData(Math.round(512 * 0.506), Math.round(512 * 0.542), 1, 1).data;
          lipColor = `rgb(${lipSample[0]}, ${lipSample[1]}, ${lipSample[2]})`;
        } catch {
          // keep calibrated defaults if pixel read fails
        }

        if (jawCtx) {
          jawCtx.clearRect(0, 0, jawCanvas.width, jawCanvas.height);
          jawCtx.drawImage(
            offscreen,
            Math.round(512 * JAW_SRC_X),
            Math.round(512 * JAW_SRC_Y),
            Math.round(512 * JAW_SRC_W),
            Math.round(512 * JAW_SRC_H),
            0,
            0,
            jawCanvas.width,
            jawCanvas.height
          );

          // Soft radial-horizontal & bottom feather mask so chin blends seamlessly with zero hard edge
          jawCtx.save();
          jawCtx.globalCompositeOperation = 'destination-in';

          const hMask = jawCtx.createLinearGradient(0, 0, jawCanvas.width, 0);
          hMask.addColorStop(0, 'rgba(0,0,0,0)');
          hMask.addColorStop(0.18, 'rgba(0,0,0,0.85)');
          hMask.addColorStop(0.32, 'rgba(0,0,0,1)');
          hMask.addColorStop(0.68, 'rgba(0,0,0,1)');
          hMask.addColorStop(0.82, 'rgba(0,0,0,0.85)');
          hMask.addColorStop(1, 'rgba(0,0,0,0)');
          jawCtx.fillStyle = hMask;
          jawCtx.fillRect(0, 0, jawCanvas.width, jawCanvas.height);

          const vMask = jawCtx.createLinearGradient(0, 0, 0, jawCanvas.height);
          vMask.addColorStop(0, 'rgba(0,0,0,0.92)');
          vMask.addColorStop(0.08, 'rgba(0,0,0,1)');
          vMask.addColorStop(0.72, 'rgba(0,0,0,0.95)');
          vMask.addColorStop(1, 'rgba(0,0,0,0)');
          jawCtx.fillStyle = vMask;
          jawCtx.fillRect(0, 0, jawCanvas.width, jawCanvas.height);
          jawCtx.restore();
        }
      }
      imageReady = true;
    };
    portrait.src = PORTRAIT_URL;

    let rafId = 0;
    let phase = 0;
    let nextBlinkTime = performance.now() + 2400;
    let blinkStart = -1;

    // Smoothly interpolated emotion weights
    const emotionWeights: Record<FacialEmotion, number> = {
      calm: 1, happy: 0, love: 0, sad: 0, surprised: 0, excited: 0,
      empathetic: 0, thoughtful: 0, confident: 0, angry: 0, curious: 0,
    };

    const renderFrame = (now: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const size = 340;
      if (canvas.width !== size * dpr || canvas.height !== size * dpr) {
        canvas.width = size * dpr;
        canvas.height = size * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, size, size);

      const cx = size / 2;
      const cy = size / 2;
      const curState = stateRef.current;
      const curEmotion = emotionRef.current;
      const curMic = micRef.current;
      const curLipOpen = lipOpenRef.current;
      const curLipWidth = lipWidthRef.current;

      // Lerp emotion weights smoothly
      (Object.keys(emotionWeights) as FacialEmotion[]).forEach((k) => {
        const target = k === curEmotion ? 1 : 0;
        emotionWeights[k] += (target - emotionWeights[k]) * 0.08;
      });

      const speed =
        curState === 'thinking'
          ? 0.036
          : curState === 'speaking'
            ? 0.025
            : curState === 'listening'
              ? 0.02
              : 0.01;
      if (!prefersReducedMotion) {
        phase += speed;
      }

      // Natural involuntary blinking curve
      let blinkAmount = 0;
      if (!prefersReducedMotion) {
        if (now >= nextBlinkTime && blinkStart < 0) {
          blinkStart = now;
        }
        if (blinkStart >= 0) {
          const elapsed = now - blinkStart;
          const duration = 175;
          if (elapsed < duration) {
            blinkAmount = Math.sin((elapsed / duration) * Math.PI);
          } else {
            blinkStart = -1;
            nextBlinkTime = now + 3100 + Math.random() * 2600;
          }
        }
      }

      const palette =
        curState === 'error' || curEmotion === 'angry'
          ? { primary: '#FF4D6D', secondary: '#FB7185', glow: 'rgba(255,45,85,0.24)' }
          : curEmotion === 'love'
            ? { primary: '#FB7185', secondary: '#F472B6', glow: 'rgba(244,63,94,0.26)' }
            : curEmotion === 'excited'
              ? { primary: '#FBBF24', secondary: '#FB923C', glow: 'rgba(251,191,36,0.24)' }
              : curEmotion === 'empathetic'
                ? { primary: '#A78BFA', secondary: '#F0ABFC', glow: 'rgba(167,139,250,0.22)' }
                : curEmotion === 'thoughtful'
                  ? { primary: '#818CF8', secondary: '#38BDF8', glow: 'rgba(129,140,248,0.22)' }
                  : curEmotion === 'confident'
                    ? { primary: '#22D3EE', secondary: '#34D399', glow: 'rgba(34,211,238,0.22)' }
                    : curEmotion === 'curious'
                      ? { primary: '#C084FC', secondary: '#67E8F9', glow: 'rgba(192,132,252,0.24)' }
                      : curEmotion === 'happy'
                        ? { primary: '#00F5FF', secondary: '#10B981', glow: 'rgba(16,185,129,0.22)' }
                        : curEmotion === 'sad'
                          ? { primary: '#60A5FA', secondary: '#818CF8', glow: 'rgba(96,165,250,0.2)' }
                          : curEmotion === 'surprised'
                            ? { primary: '#22D3EE', secondary: '#38BDF8', glow: 'rgba(34,211,238,0.3)' }
                            : curState === 'thinking'
                              ? { primary: '#38BDF8', secondary: '#0066FF', glow: 'rgba(0,102,255,0.25)' }
                              : { primary: '#00F5FF', secondary: '#0284C7', glow: 'rgba(0,245,255,0.2)' };

      // Ambient holographic aura
      const aura = ctx.createRadialGradient(cx, cy, 40, cx, cy, 166);
      aura.addColorStop(0, palette.glow);
      aura.addColorStop(0.65, 'rgba(0, 102, 255, 0.05)');
      aura.addColorStop(1, 'rgba(10, 10, 15, 0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(cx, cy, 166, 0, Math.PI * 2);
      ctx.fill();

      // Acoustic waveform ring around holographic aperture
      const barCount = 64;
      const ringRadius = 134;
      for (let i = 0; i < barCount; i++) {
        const angle = (i / barCount) * Math.PI * 2 + phase * 0.25;
        let amp = 2.5;
        if (curState === 'speaking') {
          const energy = Math.max(0.18, curLipOpen);
          amp = 4 + (Math.sin(phase * 5 + i * 0.55) * 0.5 + 0.5) * 20 * energy;
        } else if (curState === 'listening') {
          const energy = Math.max(0.2, curMic);
          amp = 4 + Math.abs(Math.sin(phase * 3.8 + i * 0.45)) * 22 * energy;
        } else if (curState === 'thinking') {
          amp = 3 + (Math.sin(phase * 4.5 + i * 0.3) * 0.5 + 0.5) * 10;
        } else {
          amp = 2 + (Math.sin(phase * 1.4 + i * 0.2) * 0.5 + 0.5) * 3;
        }

        const x1 = cx + Math.cos(angle) * ringRadius;
        const y1 = cy + Math.sin(angle) * ringRadius;
        const x2 = cx + Math.cos(angle) * (ringRadius + amp);
        const y2 = cy + Math.sin(angle) * (ringRadius + amp);

        ctx.strokeStyle = i % 2 === 0 ? palette.primary : palette.secondary;
        ctx.globalAlpha = curState === 'idle' ? 0.35 : 0.85;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Subtle rose-gold warmth motes during Love Mode
      if (emotionWeights.love > 0.08 && !prefersReducedMotion) {
        ctx.save();
        for (let i = 0; i < 6; i++) {
          const a = phase * 0.55 + (i * Math.PI) / 3;
          const dist = 148 + Math.sin(phase * 1.6 + i) * 7;
          const mx = cx + Math.cos(a) * dist;
          const my = cy + Math.sin(a) * dist;
          ctx.fillStyle = `rgba(251, 113, 133, ${0.42 * emotionWeights.love})`;
          ctx.beginPath();
          ctx.arc(mx, my, 2.3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Rotating precision holographic arcs
      ctx.strokeStyle = palette.primary;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(cx, cy, 128, phase * 0.7, phase * 0.7 + Math.PI * 0.75);
      ctx.stroke();

      ctx.strokeStyle = palette.secondary;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, 128, phase * 0.7 + Math.PI, phase * 0.7 + Math.PI * 1.75);
      ctx.stroke();

      // Circular Holographic Portrait Viewport
      const faceRadius = 118;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, faceRadius, 0, Math.PI * 2);
      ctx.clip();

      // Subtle living breathing motion
      const breatheY = prefersReducedMotion ? 0 : Math.sin(phase * 1.4) * 1.4;
      const microSwayX =
        prefersReducedMotion || curState === 'idle' ? 0 : Math.sin(phase * 2.1) * 0.9;

      const drawSize = faceRadius * 2.28;
      const drawX = cx - drawSize / 2 + microSwayX;
      const drawY = cy - drawSize * 0.44 + breatheY;

      if (imageReady && offCtx) {
        // 1. Base hyper-realistic portrait
        ctx.drawImage(offscreen, drawX, drawY, drawSize, drawSize);

        // Helper to map normalized portrait coordinates (0..1) -> canvas pixels
        const px = (nx: number) => drawX + nx * drawSize;
        const py = (ny: number) => drawY + ny * drawSize;

        // 2. Emotional facial subtleties (cheek warmth, love blush, eye smile, sad mood)
        const warmWeight = emotionWeights.happy + emotionWeights.excited + emotionWeights.love * 1.25;
        if (warmWeight > 0.05) {
          ctx.save();
          ctx.globalAlpha = Math.min(0.28, warmWeight * 0.19);
          const cheekL = ctx.createRadialGradient(px(0.385), py(0.455), 2, px(0.385), py(0.455), 22);
          cheekL.addColorStop(0, emotionWeights.love > 0.2 ? 'rgba(244, 114, 182, 0.92)' : 'rgba(255, 142, 124, 0.85)');
          cheekL.addColorStop(1, 'rgba(255, 142, 124, 0)');
          ctx.fillStyle = cheekL;
          ctx.fillRect(px(0.28), py(0.38), 60, 50);

          const cheekR = ctx.createRadialGradient(px(0.625), py(0.455), 2, px(0.625), py(0.455), 22);
          cheekR.addColorStop(0, emotionWeights.love > 0.2 ? 'rgba(244, 114, 182, 0.92)' : 'rgba(255, 142, 124, 0.85)');
          cheekR.addColorStop(1, 'rgba(255, 142, 124, 0)');
          ctx.fillStyle = cheekR;
          ctx.fillRect(px(0.53), py(0.38), 60, 50);
          ctx.restore();
        }

        if (emotionWeights.sad + emotionWeights.empathetic > 0.05) {
          ctx.save();
          ctx.fillStyle = `rgba(24, 48, 112, ${(emotionWeights.sad * 0.13) + (emotionWeights.empathetic * 0.06)})`;
          ctx.fillRect(drawX, drawY, drawSize, drawSize);
          ctx.restore();
        }

        // 3. Real-time synchronized lip & jaw articulation at TRUE lip seam (0.506, 0.529)
        const effectiveMouthOpen = Math.min(
          1,
          curLipOpen + emotionWeights.surprised * 0.2 + emotionWeights.excited * 0.08 + emotionWeights.curious * 0.06
        );
        const mouthCenterX = px(0.506);
        const mouthSeamY = py(0.529);
        const cornerShift =
          (emotionWeights.happy + emotionWeights.excited + emotionWeights.love * 0.95) * -2.2 +
          (emotionWeights.sad + emotionWeights.empathetic) * 2.0;

        if (effectiveMouthOpen > 0.02) {
          const halfW =
            drawSize *
            (0.056 -
              curLipWidth * 0.008 -
              emotionWeights.surprised * 0.007 +
              emotionWeights.happy * 0.006);
          const jawDropPx = effectiveMouthOpen * (drawSize * 0.036);
          const cornerY = mouthSeamY - 1 + cornerShift * 0.55;

          // Recessed realistic oral cavity between static upper lip and displaced lower lip
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(mouthCenterX - halfW, cornerY);
          ctx.quadraticCurveTo(
            mouthCenterX,
            mouthSeamY - jawDropPx * 0.12,
            mouthCenterX + halfW,
            cornerY
          );
          ctx.quadraticCurveTo(
            mouthCenterX,
            mouthSeamY + jawDropPx * 1.18,
            mouthCenterX - halfW,
            cornerY
          );
          ctx.closePath();

          const cavityGrad = ctx.createLinearGradient(
            mouthCenterX,
            mouthSeamY - 1,
            mouthCenterX,
            mouthSeamY + jawDropPx * 1.15
          );
          cavityGrad.addColorStop(0, '#130508');
          cavityGrad.addColorStop(0.5, '#250B10');
          cavityGrad.addColorStop(1, '#160609');
          ctx.fillStyle = cavityGrad;
          ctx.fill();

          // Subtle natural shadowed upper teeth edge only on wider vowel openings
          if (effectiveMouthOpen > 0.28) {
            ctx.save();
            ctx.clip();
            ctx.fillStyle = `rgba(218, 206, 196, ${Math.min(0.42, (effectiveMouthOpen - 0.26) * 0.72)})`;
            ctx.beginPath();
            ctx.ellipse(
              mouthCenterX,
              mouthSeamY + jawDropPx * 0.14,
              halfW * 0.56,
              jawDropPx * 0.22,
              0,
              0,
              Math.PI * 2
            );
            ctx.fill();
            ctx.restore();
          }
          ctx.restore();

          // Pre-feathered lower lip & chin displacement
          const destX = px(JAW_SRC_X);
          const destY = py(JAW_SRC_Y) + jawDropPx * 0.88;
          const destW = drawSize * JAW_SRC_W;
          const destH = drawSize * JAW_SRC_H;
          ctx.drawImage(jawCanvas, destX, destY, destW, destH);

          // Subtle upper/lower lip rim shadow & mouth corner blend
          ctx.save();
          ctx.strokeStyle = 'rgba(42, 14, 15, 0.45)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(mouthCenterX - halfW, cornerY);
          ctx.quadraticCurveTo(
            mouthCenterX,
            mouthSeamY + jawDropPx * 0.96,
            mouthCenterX + halfW,
            cornerY
          );
          ctx.stroke();

          ctx.strokeStyle = lipColor;
          ctx.globalAlpha = 0.24;
          ctx.lineWidth = 1.4;
          ctx.stroke();
          ctx.restore();
        } else if (Math.abs(cornerShift) > 0.22) {
          // Subtle mouth-corner emotional expression when lips are closed
          ctx.save();
          ctx.strokeStyle = 'rgba(68, 28, 28, 0.42)';
          ctx.lineWidth = 1.4;
          ctx.lineCap = 'round';
          const leftX = px(0.448);
          const rightX = px(0.564);
          ctx.beginPath();
          ctx.moveTo(leftX + 7, mouthSeamY);
          ctx.quadraticCurveTo(leftX, mouthSeamY + cornerShift * 0.35, leftX - 3, mouthSeamY + cornerShift);
          ctx.moveTo(rightX - 7, mouthSeamY);
          ctx.quadraticCurveTo(rightX, mouthSeamY + cornerShift * 0.35, rightX + 3, mouthSeamY + cornerShift);
          ctx.stroke();
          ctx.restore();
        }

        // 4. Natural Eyelid Blinking + Surprised Gaze Lift (exact measured eye coordinates)
        const eyeCoords = [
          { x: px(0.422), y: py(0.356), rx: drawSize * 0.031, ry: drawSize * 0.017, lidColor: eyelidColorL },
          { x: px(0.585), y: py(0.356), rx: drawSize * 0.031, ry: drawSize * 0.017, lidColor: eyelidColorR },
        ];

        if (blinkAmount > 0.02) {
          for (const eye of eyeCoords) {
            ctx.save();
            ctx.beginPath();
            ctx.ellipse(eye.x, eye.y, eye.rx * 1.15, eye.ry * 1.35, 0, 0, Math.PI * 2);
            ctx.clip();

            const lidDrop = eye.ry * 2.45 * blinkAmount;
            ctx.fillStyle = eye.lidColor;
            ctx.beginPath();
            ctx.ellipse(
              eye.x,
              eye.y - eye.ry * 1.4 + lidDrop * 0.55,
              eye.rx * 1.25,
              eye.ry * 1.45,
              0,
              0,
              Math.PI * 2
            );
            ctx.fill();

            // Subtle natural eyelash crease line
            ctx.strokeStyle = 'rgba(22, 15, 13, 0.78)';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(eye.x - eye.rx, eye.y - eye.ry * 0.55 + lidDrop * 0.85);
            ctx.quadraticCurveTo(
              eye.x,
              eye.y - eye.ry * 0.05 + lidDrop * 0.95,
              eye.x + eye.rx,
              eye.y - eye.ry * 0.55 + lidDrop * 0.85
            );
            ctx.stroke();
            ctx.restore();
          }
        }

        if (emotionWeights.surprised > 0.08 && blinkAmount < 0.2) {
          ctx.save();
          ctx.globalAlpha = emotionWeights.surprised * 0.24;
          ctx.strokeStyle = '#E0F2FE';
          ctx.lineWidth = 1.3;
          for (const eye of eyeCoords) {
            ctx.beginPath();
            ctx.arc(eye.x, eye.y - 1.5, eye.rx * 0.88, Math.PI * 1.15, Math.PI * 1.85);
            ctx.stroke();
          }
          ctx.restore();
        }
      } else {
        // Fallback dark holographic gradient while loading
        const fbGrad = ctx.createRadialGradient(cx, cy - 10, 10, cx, cy, faceRadius);
        fbGrad.addColorStop(0, 'rgba(0, 245, 255, 0.22)');
        fbGrad.addColorStop(1, '#0D1117');
        ctx.fillStyle = fbGrad;
        ctx.fillRect(cx - faceRadius, cy - faceRadius, faceRadius * 2, faceRadius * 2);
      }

      // Futuristic holographic scanlines & inner edge vignette
      ctx.fillStyle = 'rgba(0, 245, 255, 0.025)';
      for (let sy = cy - faceRadius; sy < cy + faceRadius; sy += 4) {
        ctx.fillRect(cx - faceRadius, sy, faceRadius * 2, 1);
      }

      const vignette = ctx.createRadialGradient(cx, cy, faceRadius * 0.7, cx, cy, faceRadius);
      vignette.addColorStop(0, 'rgba(10, 10, 15, 0)');
      vignette.addColorStop(1, 'rgba(10, 10, 15, 0.68)');
      ctx.fillStyle = vignette;
      ctx.fillRect(cx - faceRadius, cy - faceRadius, faceRadius * 2, faceRadius * 2);

      ctx.restore();

      // Inner glass bezel ring
      ctx.strokeStyle = palette.primary;
      ctx.globalAlpha = 0.72;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, faceRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

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
      className="relative flex items-center justify-center"
      data-testid="holographic-avatar"
      data-state={state}
      data-emotion={emotion}
    >
      <canvas
        ref={canvasRef}
        className="h-[268px] w-[268px] sm:h-[284px] sm:w-[284px]"
        aria-label={`${assistantName} realistic holographic portrait: ${state}, expression ${emotion}`}
      />
    </div>
  );
}
