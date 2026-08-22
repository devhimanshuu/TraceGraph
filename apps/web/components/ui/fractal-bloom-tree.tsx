"use client";

import React, { useEffect, useRef } from 'react';
import { motion, type Variants } from 'framer-motion';
import { ArrowRight, GitBranch } from 'lucide-react';

// A utility function for class names
const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

// Fractal Bloom Canvas Component
const FractalBloomCanvas = () => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;
        let width = window.innerWidth;
        let height = window.innerHeight;
        const mouse = { x: width / 2, y: height / 2 };
        let currentDepth = 0;
        const maxDepth = 10;

        const isDark = () => document.documentElement.classList.contains('dark');

        const resizeCanvas = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };

        const drawBranch = (
            x: number, 
            y: number, 
            angle: number, 
            length: number, 
            depth: number,
            time: number
        ) => {
            if (depth > currentDepth || depth > maxDepth) return;
            
            ctx.beginPath();
            ctx.moveTo(x, y);
            
            const endX = x + Math.cos(angle) * length;
            const endY = y + Math.sin(angle) * length;
            
            ctx.lineTo(endX, endY);
            
            const depthRatio = depth / maxDepth;
            const dark = isDark();
            const opacity = Math.max(0.18, (1 - depthRatio * 0.8) * 0.95);
            
            // In dark mode: glowing crisp white/slate; in light mode: deep slate/indigo
            ctx.strokeStyle = dark 
                ? `rgba(255, 255, 255, ${opacity})` 
                : `rgba(15, 23, 42, ${opacity * 0.85})`;
                
            ctx.lineWidth = Math.max(0.65, (1 - depthRatio * 0.8) * 2.8);
            ctx.lineCap = 'round';
            ctx.stroke();

            // ── Glowing Light Blue Dots on every branch node and tip ──────────────
            const pulse = 0.85 + Math.sin(time * 2.5 + depth * 0.85 + endX * 0.01) * 0.15;
            const dotOpacity = Math.min(1, (currentDepth - depth + 1)) * (dark ? 0.92 : 0.85) * pulse;
            const isTip = depth >= Math.floor(currentDepth) || depth >= maxDepth - 1;
            // Refined smaller dot radius
            const dotRadius = isTip 
                ? Math.max(1.2, 2.0 - depthRatio * 0.7) 
                : Math.max(0.7, 1.3 - depthRatio * 0.5);

            if (dotOpacity > 0.05) {
                // Outer soft glowing cyan/light-blue halo
                ctx.beginPath();
                ctx.arc(endX, endY, dotRadius * 2.2, 0, Math.PI * 2);
                ctx.fillStyle = dark 
                    ? `rgba(56, 189, 248, ${dotOpacity * 0.35})` 
                    : `rgba(2, 132, 199, ${dotOpacity * 0.25})`;
                ctx.fill();

                // Inner vibrant light-blue core
                ctx.beginPath();
                ctx.arc(endX, endY, dotRadius, 0, Math.PI * 2);
                ctx.fillStyle = dark 
                    ? `rgba(125, 211, 252, ${dotOpacity * 0.95})` 
                    : `rgba(14, 165, 233, ${dotOpacity * 0.92})`;
                ctx.fill();

                // Center bright white spark
                ctx.beginPath();
                ctx.arc(endX, endY, dotRadius * 0.45, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 255, 255, ${dotOpacity * 0.95})`;
                ctx.fill();
            }

            // Mouse influence on branching angle across the viewport
            const distToMouse = Math.hypot(endX - mouse.x, endY - mouse.y);
            const mouseEffect = Math.max(0, 1 - distToMouse / (Math.max(width, height) * 0.6));
            const angleOffset = (Math.PI / 10) * mouseEffect;

            const spreadAngle = (Math.PI / 7.2) + (depth < 3 ? 0.04 : 0);
            const nextLength = length * 0.80;

            // Main left and right branches
            drawBranch(endX, endY, angle - spreadAngle - angleOffset, nextLength, depth + 1, time);
            drawBranch(endX, endY, angle + spreadAngle + angleOffset, nextLength, depth + 1, time);

            // Additional center/canopy branches at intermediate depths covering 90% of hero
            if (depth >= 1 && depth <= 3) {
                drawBranch(endX, endY, angle + (angleOffset * 0.5), nextLength * 0.72, depth + 1.5, time);
            }
        };

        const animate = (timestamp: number) => {
            const time = timestamp ? timestamp * 0.001 : 0;
            const dark = isDark();
            // Smooth background trail adaptive to light and dark modes
            ctx.fillStyle = dark ? 'rgba(2, 6, 23, 0.22)' : 'rgba(248, 250, 252, 0.22)';
            ctx.fillRect(0, 0, width, height);

            const startX = width / 2;
            const startY = height;
            // Base trunk length calibrated to cover ~90% of the hero viewport height
            const startLength = Math.max(height * 0.23, Math.min(width, height) * 0.245);
            
            drawBranch(startX, startY, -Math.PI / 2, startLength, 0, time);

            if (currentDepth < maxDepth) {
                currentDepth += 0.035;
            }
            
            animationFrameId = requestAnimationFrame(animate);
        };

        const handleMouseMove = (event: MouseEvent) => {
            mouse.x = event.clientX;
            mouse.y = event.clientY;
        };

        window.addEventListener('resize', resizeCanvas);
        window.addEventListener('mousemove', handleMouseMove, { passive: true });
        
        resizeCanvas();
        animationFrameId = requestAnimationFrame(animate);

        return () => {
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener('resize', resizeCanvas);
            window.removeEventListener('mousemove', handleMouseMove);
        };
    }, []);

    return (
        <canvas 
            ref={canvasRef} 
            className="absolute inset-0 z-0 w-full h-full bg-slate-50 dark:bg-[#020617] transition-colors duration-500" 
        />
    );
};


// The main hero component
const FractalBloomHero = () => {
    const fadeUpVariants: Variants = {
        hidden: { opacity: 0, y: 20 },
        visible: (i: number) => ({
            opacity: 1,
            y: 0,
            transition: {
                delay: i * 0.2 + 1.5, // Delay for fractal to grow
                duration: 0.8,
                ease: "easeInOut",
            },
        }),
    };

    return (
        <div 
            className="relative h-screen w-full flex flex-col items-center justify-center overflow-hidden bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-slate-50 transition-colors duration-500"
        >
            <FractalBloomCanvas />
            
            {/* Multi-layered vignettes for high-contrast text visibility in both light & dark themes */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.85)_0%,rgba(248,250,252,0.55)_55%,rgba(241,245,249,0.95)_100%)] dark:bg-[radial-gradient(ellipse_at_center,rgba(2,6,23,0.78)_0%,rgba(2,6,23,0.45)_55%,rgba(2,6,23,0.9)_100%)] pointer-events-none z-10 transition-colors duration-500" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-100/90 via-transparent to-white/70 dark:from-[#020617] dark:via-transparent dark:to-[#020617]/60 pointer-events-none z-10 transition-colors duration-500" />

            {/* Overlay HTML Content */}
            <div className="relative z-20 max-w-3xl text-center p-6 mx-auto">
                <motion.div
                    custom={0} variants={fadeUpVariants} initial="hidden" animate="visible"
                    className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/80 dark:bg-slate-900/80 border border-slate-200/90 dark:border-slate-700/80 mb-6 backdrop-blur-md shadow-sm dark:shadow-lg dark:shadow-black/40 transition-colors"
                >
                    <GitBranch className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                    <span className="text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-100">
                        Generative Development Platform
                    </span>
                </motion.div>

                <motion.h1
                    custom={1} variants={fadeUpVariants} initial="hidden" animate="visible"
                    className="text-5xl md:text-7xl font-bold tracking-tighter mb-6 text-slate-900 dark:text-white drop-shadow-[0_2px_16px_rgba(255,255,255,0.8)] dark:drop-shadow-[0_4px_24px_rgba(0,0,0,0.95)]"
                >
                    Fractal Bloom
                </motion.h1>

                {/* Subtitle with Frosted Glass Backdrop Blur Effect */}
                <motion.div
                    custom={2} variants={fadeUpVariants} initial="hidden" animate="visible"
                    className="mb-8 mx-auto max-w-2xl"
                >
                    <p className="inline-block rounded-2xl border border-slate-200/80 bg-white/75 px-6 py-3.5 text-sm sm:text-base md:text-lg text-slate-800 backdrop-blur-md shadow-sm dark:border-slate-700/60 dark:bg-slate-950/70 dark:text-slate-200 dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] leading-relaxed">
                        An evolutionary framework that grows and adapts your code, creating complex, resilient, and beautiful software systems organically.
                    </p>
                </motion.div>

                {/* Action CTA & Small Meta Chips with Backdrop Blur */}
                <motion.div
                    custom={3} variants={fadeUpVariants} initial="hidden" animate="visible"
                    className="flex flex-col items-center gap-6"
                >
                    <button className="px-8 py-4 bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100 font-semibold rounded-lg shadow-[0_4px_20px_rgba(15,23,42,0.15)] dark:shadow-[0_0_30px_rgba(255,255,255,0.25)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 flex items-center gap-2 mx-auto cursor-pointer">
                        Start Growing
                        <ArrowRight className="h-5 w-5" />
                    </button>

                    {/* Small Meta Badges with Frosted Glass Blur */}
                    <div className="flex flex-wrap items-center justify-center gap-3 font-mono text-[11px] sm:text-xs">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/75 px-3.5 py-1 text-slate-700 backdrop-blur-md shadow-sm dark:border-slate-800 dark:bg-slate-900/75 dark:text-slate-300">
                            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Autonomous Growth
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/75 px-3.5 py-1 text-slate-700 backdrop-blur-md shadow-sm dark:border-slate-800 dark:bg-slate-900/75 dark:text-slate-300">
                            <span className="size-1.5 rounded-full bg-sky-500" />
                            Realtime Synthesis
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/75 px-3.5 py-1 text-slate-700 backdrop-blur-md shadow-sm dark:border-slate-800 dark:bg-slate-900/75 dark:text-slate-300">
                            <span className="size-1.5 rounded-full bg-violet-500" />
                            Organic Architecture
                        </span>
                    </div>
                </motion.div>
            </div>
        </div>
    );
};

export { FractalBloomCanvas, FractalBloomHero };
export default FractalBloomHero;
