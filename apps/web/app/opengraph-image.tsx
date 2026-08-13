import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'TraceGraph — Understand your codebase through relationships.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Loads a Google Font woff2 for ImageResponse. The CSS-API dance is required
 * because ImageResponse needs raw font bytes (next/font does not expose them
 * as typed data in this Next version). Results are cached per family+weight.
 */
const FONT_CACHE = new Map<string, Promise<ArrayBuffer>>();

function loadGoogleFont(family: string, weight: string): Promise<ArrayBuffer> {
  const key = `${family}:${weight}`;
  const cached = FONT_CACHE.get(key);
  if (cached) {
    return cached;
  }
  const promise = (async () => {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:ital,wght@0,${weight}&display=swap`,
      {
        // A Chrome-36-era UA makes Google serve WOFF instead of WOFF2 —
        // ImageResponse (satori) can parse WOFF but not WOFF2.
        headers: {
          'User-Agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/36.0.1985.125 Safari/537.36',
        },
      },
    ).then((res) => res.text());
    const fontUrl = css.match(/url\((https:\/\/[^)]+)\)/)?.[1];
    if (!fontUrl) {
      throw new Error(`Could not resolve a font URL for ${family} ${weight}`);
    }
    return fetch(fontUrl).then((res) => res.arrayBuffer());
  })();
  FONT_CACHE.set(key, promise);
  return promise;
}

/** The brand mark, drawn at 24-unit coordinates (same geometry as Logo). */
function BrandMark({ size: s }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} fill="none">
      <path
        d="M6.5 7 L14.2 10.7"
        stroke="#ffffff"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M19.8 10.7 L8.4 16.1"
        stroke="#ffffff"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.55"
      />
      <circle cx="6.5" cy="7" r="2.1" fill="#ffffff" />
      <circle cx="6.5" cy="17" r="2.1" fill="#ffffff" />
      <circle cx="17" cy="12" r="3.1" stroke="#ffffff" strokeWidth="1.6" />
    </svg>
  );
}

/** Faint scattered graph nodes as background decoration. */
function Decoration() {
  const nodes: Array<{ left: number; top: number; size: number; opacity: number }> = [
    { left: 90, top: 84, size: 9, opacity: 0.22 },
    { left: 180, top: 150, size: 6, opacity: 0.16 },
    { left: 1010, top: 92, size: 11, opacity: 0.25 },
    { left: 1080, top: 200, size: 6, opacity: 0.15 },
    { left: 950, top: 480, size: 8, opacity: 0.2 },
    { left: 160, top: 470, size: 7, opacity: 0.18 },
  ];
  return (
    <>
      {/* soft glow behind the brand */}
      <div
        style={{
          position: 'absolute',
          top: -160,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 900,
          height: 500,
          borderRadius: '50%',
          background:
            'radial-gradient(ellipse at center, rgba(14,165,233,0.14), rgba(14,165,233,0) 70%)',
        }}
      />
      {nodes.map((n, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: n.left,
            top: n.top,
            width: n.size,
            height: n.size,
            borderRadius: '50%',
            background: '#ffffff',
            opacity: n.opacity,
          }}
        />
      ))}
    </>
  );
}

export default async function Image() {
  const [tomorrow400, tomorrow700, geo400] = await Promise.all([
    loadGoogleFont('Tomorrow', '400'),
    loadGoogleFont('Tomorrow', '700'),
    loadGoogleFont('Geo', '400'),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0d0d10',
        }}
      >
        <Decoration />

        <div
          style={{
            display: 'flex',
            width: 148,
            height: 148,
            borderRadius: 36,
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #0ea5e9, #4f46e5)',
            boxShadow: '0 24px 60px rgba(14,165,233,0.35)',
          }}
        >
          <BrandMark size={96} />
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginTop: 44,
          }}
        >
          <div
            style={{
              display: 'flex',
              fontFamily: 'Tomorrow',
              fontWeight: 700,
              fontSize: 92,
              lineHeight: 1,
              letterSpacing: '0.01em',
              color: '#ffffff',
            }}
          >
            TraceGraph
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 26,
              fontFamily: 'Tomorrow',
              fontWeight: 400,
              fontSize: 32,
              color: '#9ca3af',
            }}
          >
            Understand your codebase through relationships.
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 22,
              fontFamily: 'Geo',
              fontSize: 22,
              letterSpacing: '0.14em',
              color: '#6b7280',
            }}
          >
            LABELED PROPERTY GRAPH · openCypher
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Tomorrow', data: tomorrow400, weight: 400, style: 'normal' },
        { name: 'Tomorrow', data: tomorrow700, weight: 700, style: 'normal' },
        { name: 'Geo', data: geo400, weight: 400, style: 'normal' },
      ],
    },
  );
}
