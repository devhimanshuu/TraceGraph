"use client";

import React, { useEffect, useRef } from "react";

interface Point {
  x: number;
  y: number;
  vx: number;
  vy: number;
  pulse: number;
  pulseSpeed: number;
}

export interface LatticeBackgroundProps {
  title?: string;
  subtitle?: string;
  description?: string;
  className?: string;
}

export function LatticeBackground({
  title = "Geometric",
  subtitle = "",
  description = "Dynamic Delaunay triangulation lattice with real-time cursor field deformation and vertex energy pulses.",
  className = "",
}: LatticeBackgroundProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;

    const mouse = { x: -1000, y: -1000, targetX: -1000, targetY: -1000 };
    let points: Point[] = [];

    // Pre-calculate theme colors to avoid string creation inside frame loop.
    // TraceGraph forces dark via `html.dark`, so prefer the class and fall back
    // to the OS media query.
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const isDarkClass = () => document.documentElement.classList.contains("dark");
    let isDarkMode = isDarkClass() || mediaQuery.matches;

    const updateTheme = () => {
      isDarkMode = isDarkClass() || mediaQuery.matches;
    };
    mediaQuery.addEventListener("change", updateTheme);

    // Respect the app's reduced-motion preference: draw a single static frame
    // instead of running the animation loop.
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const maxDistance = 140;
    const maxDistSq = maxDistance * maxDistance;

    const initPoints = (w: number, h: number) => {
      points = [];
      // Dynamic count capped for smooth 60fps across screen sizes
      const density = Math.floor((w * h) / 9000);
      const count = Math.min(Math.max(density, 50), 120);

      for (let i = 0; i < count; i++) {
        points.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.8,
          vy: (Math.random() - 0.5) * 0.8,
          pulse: Math.random() * Math.PI * 2,
          pulseSpeed: 1 + Math.random() * 1.5,
        });
      }
    };

    const handleResize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
      initPoints(width, height);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.targetX = e.clientX - rect.left;
      mouse.targetY = e.clientY - rect.top;
    };

    const handleMouseLeave = () => {
      mouse.targetX = -1000;
      mouse.targetY = -1000;
    };

    handleResize();
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    container.addEventListener("mousemove", handleMouseMove, { passive: true });
    container.addEventListener("mouseleave", handleMouseLeave, { passive: true });

    let lastTime = performance.now();

    const render = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.033); // Cap dt to 30fps lower bound
      lastTime = now;

      // Smooth cursor lerp
      mouse.x += (mouse.targetX - mouse.x) * 0.1;
      mouse.y += (mouse.targetY - mouse.y) * 0.1;

      // Clear Canvas
      ctx.fillStyle = isDarkMode ? "#04060a" : "#f1f5f9";
      ctx.fillRect(0, 0, width, height);

      // Color Definitions
      const strokeRGB = isDarkMode ? "148, 163, 184" : "51, 65, 85";
      const accentRGB = isDarkMode ? "129, 140, 248" : "79, 70, 229";

      // 1. Update Particle Physics
      const pCount = points.length;
      for (let i = 0; i < pCount; i++) {
        const p = points[i];
        p.pulse += dt * p.pulseSpeed;

        p.x += p.vx * dt * 60;
        p.y += p.vy * dt * 60;

        // Bounce walls
        if (p.x < 0) {
          p.x = 0;
          p.vx *= -1;
        } else if (p.x > width) {
          p.x = width;
          p.vx *= -1;
        }

        if (p.y < 0) {
          p.y = 0;
          p.vy *= -1;
        } else if (p.y > height) {
          p.y = height;
          p.vy *= -1;
        }

        // Mouse repelling force
        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < 40000 && distSq > 0) {
          // 200px radius
          const dist = Math.sqrt(distSq);
          const force = (1 - dist / 200) * 35;
          p.x -= (dx / dist) * force * dt * 6;
          p.y -= (dy / dist) * force * dt * 6;
        }
      }

      // 2. Spatial Grid Partitioning (Fast O(N) Triangulation Lookup)
      const cellSize = maxDistance;
      const cols = Math.max(1, Math.ceil(width / cellSize));
      const rows = Math.max(1, Math.ceil(height / cellSize));
      const grid: number[][][] = Array.from({ length: cols }, () =>
        Array.from({ length: rows }, () => [])
      );

      for (let i = 0; i < pCount; i++) {
        const c = Math.min(cols - 1, Math.max(0, Math.floor(points[i].x / cellSize)));
        const r = Math.min(rows - 1, Math.max(0, Math.floor(points[i].y / cellSize)));
        grid[c][r].push(i);
      }

      // 3. Draw Triangulated Geometry Mesh using Grid Lookup
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const cellPoints = grid[c][r];

          // Check adjacent neighboring cells (3x3 neighborhood)
          const neighbors: number[] = [];
          for (let nc = Math.max(0, c - 1); nc <= Math.min(cols - 1, c + 1); nc++) {
            for (let nr = Math.max(0, r - 1); nr <= Math.min(rows - 1, r + 1); nr++) {
              const nList = grid[nc][nr];
              for (let k = 0; k < nList.length; k++) {
                neighbors.push(nList[k]);
              }
            }
          }

          const neighborCount = neighbors.length;

          for (let i = 0; i < cellPoints.length; i++) {
            const idx1 = cellPoints[i];
            const p1 = points[idx1];

            for (let j = 0; j < neighborCount; j++) {
              const idx2 = neighbors[j];
              if (idx1 >= idx2) continue;
              const p2 = points[idx2];

              const dx12 = p1.x - p2.x;
              const dy12 = p1.y - p2.y;
              const d12Sq = dx12 * dx12 + dy12 * dy12;
              if (d12Sq > maxDistSq) continue;

              for (let k = j + 1; k < neighborCount; k++) {
                const idx3 = neighbors[k];
                if (idx2 >= idx3) continue;
                const p3 = points[idx3];

                const dx23 = p2.x - p3.x;
                const dy23 = p2.y - p3.y;
                const d23Sq = dx23 * dx23 + dy23 * dy23;
                if (d23Sq > maxDistSq) continue;

                const dx31 = p3.x - p1.x;
                const dy31 = p3.y - p1.y;
                const d31Sq = dx31 * dx31 + dy31 * dy31;
                if (d31Sq > maxDistSq) continue;

                // Polygon rendering
                const avgX = (p1.x + p2.x + p3.x) * 0.3333;
                const avgY = (p1.y + p2.y + p3.y) * 0.3333;
                const mDx = mouse.x - avgX;
                const mDy = mouse.y - avgY;
                const mouseDistSq = mDx * mDx + mDy * mDy;

                const isNearMouse = mouseDistSq < 48400; // 220px radius
                const fillAlpha = isNearMouse
                  ? (1 - Math.sqrt(mouseDistSq) / 220) * (isDarkMode ? 0.25 : 0.15)
                  : 0.03;

                ctx.fillStyle = isNearMouse
                  ? `rgba(${accentRGB}, ${fillAlpha.toFixed(2)})`
                  : `rgba(${strokeRGB}, ${fillAlpha.toFixed(2)})`;

                ctx.strokeStyle = isNearMouse
                  ? `rgba(${accentRGB}, ${(fillAlpha * 1.5).toFixed(2)})`
                  : `rgba(${strokeRGB}, 0.08)`;
                ctx.lineWidth = isNearMouse ? 0.8 : 0.4;

                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.lineTo(p3.x, p3.y);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
              }
            }
          }
        }
      }

      // 4. Render Nodes & Active Pulse Rings (Batched Paths)
      for (let i = 0; i < pCount; i++) {
        const p = points[i];
        const mDx = mouse.x - p.x;
        const mDy = mouse.y - p.y;
        const isNear = mDx * mDx + mDy * mDy < 48400;

        const pulseRadius = 1.8 + Math.sin(p.pulse) * 1.0;

        ctx.fillStyle = isNear
          ? `rgba(${accentRGB}, 0.9)`
          : `rgba(${strokeRGB}, 0.4)`;

        ctx.beginPath();
        ctx.arc(p.x, p.y, isNear ? 3.5 : pulseRadius, 0, Math.PI * 2);
        ctx.fill();

        if (isNear) {
          ctx.strokeStyle = `rgba(${accentRGB}, 0.35)`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 7 + Math.sin(p.pulse * 2) * 2.5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      if (!reduceMotion) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    if (reduceMotion) {
      // Static frame — draw once, no animation loop.
      render(performance.now());
    } else {
      animationFrameId = requestAnimationFrame(render);
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      mediaQuery.removeEventListener("change", updateTheme);
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-screen overflow-hidden select-none bg-slate-950 ${className}`}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block cursor-crosshair"
      />

      <div className="relative z-10 flex h-full flex-col items-center justify-center text-center px-4 pointer-events-none mix-blend-difference text-white">
        {subtitle && (
          <span className="font-mono text-xs tracking-widest uppercase mb-3 opacity-80">
            {subtitle}
          </span>
        )}
        {title && (
          <h1 className="font-mono text-6xl md:text-9xl font-black tracking-tighter uppercase leading-none">
            {title}
          </h1>
        )}
        {description && (
          <p className="mt-4 font-mono text-xs md:text-sm max-w-lg opacity-70">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

export default LatticeBackground;
