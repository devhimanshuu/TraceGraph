'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

interface FadeInProps {
  children: ReactNode;
  /** Stagger delay in ms (cards in a row). */
  delay?: number;
  className?: string;
}

/**
 * Subtle scroll-reveal: fades and lifts content the first time it enters the
 * viewport. Motion-safe only — the global `prefers-reduced-motion` rule forces
 * transition durations to ~0, so this becomes an instant reveal for those
 * users. Content is rendered fully visible for no-JS clients (the hidden
 * styles only apply after mount + intersection).
 */
export function FadeIn({ children, delay = 0, className = '' }: FadeInProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    // Client-only marker so the pre-reveal (hidden) styles never apply to
    // SSR/no-JS HTML — content is visible until the observer takes over.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- idempotent mounted flag, no loop risk
    setMounted(true);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const hidden = mounted && !shown;
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: hidden ? 0 : 1,
        transform: hidden ? 'translateY(16px)' : 'none',
        transition: `opacity 0.5s ease ${delay}ms, transform 0.5s ease ${delay}ms`,
        willChange: hidden ? 'opacity, transform' : 'auto',
      }}
    >
      {children}
    </div>
  );
}
