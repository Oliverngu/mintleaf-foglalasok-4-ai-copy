import React from 'react';

export interface GlassOverlayProps {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  tintColor?: string;
  tintOpacity?: number;
  blur?: number;
  radius?: number;
  elevation?: 'low' | 'mid' | 'high';
  interactive?: boolean;
}

const elevationShadows: Record<NonNullable<GlassOverlayProps['elevation']>, string> = {
  low: '0 4px 12px rgba(0, 0, 0, 0.08)',
  mid: '0 6px 20px rgba(0, 0, 0, 0.12)',
  high: '0 12px 30px rgba(0, 0, 0, 0.18)',
};

export const GlassOverlay: React.FC<GlassOverlayProps> = ({
  children,
  className,
  style,
  tintColor = 'var(--color-primary)',
  tintOpacity = 0.12,
  blur = 2,
  radius = 14,
  elevation = 'mid',
  interactive = true,
}) => {
  const backgroundTint = `color-mix(in srgb, ${tintColor} ${Math.round(tintOpacity * 100)}%, transparent)`;

  const overlayStyle: React.CSSProperties = {
    position: 'relative',
    borderRadius: radius,
    background: `linear-gradient(145deg, rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0)), ${backgroundTint}`,
    backdropFilter: `blur(${blur}px)` as React.CSSProperties['backdropFilter'],
    WebkitBackdropFilter: `blur(${blur}px)` as React.CSSProperties['WebkitBackdropFilter'],
    boxShadow: `${elevationShadows[elevation]}, inset 0 1px 0 rgba(255, 255, 255, 0.35)`,
    border: `1px solid color-mix(in srgb, ${tintColor} 18%, rgba(255, 255, 255, 0.25))`,
    overflow: 'hidden',
    pointerEvents: interactive ? 'auto' : 'none',
    transition: 'box-shadow 150ms ease, transform 150ms ease, backdrop-filter 150ms ease',
    ...style,
  };

  return (
    <div className={className} style={overlayStyle} role="presentation">
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at 20% 20%, rgba(255, 255, 255, 0.16), transparent 40%)',
          pointerEvents: 'none',
        }}
      />
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  );
};

export const GlassOverlayExamples: React.FC = () => (
  <div
    style={{
      display: 'grid',
      gap: 16,
      padding: 16,
      background: '#f4f6fb',
      minHeight: '100vh',
    }}
  >
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <GlassOverlay style={{ padding: 12, minWidth: 220 }} elevation="low">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--accent, #7b6ef6)' }} />
          Floating toolbar background
        </div>
      </GlassOverlay>

      <GlassOverlay style={{ padding: 16, minWidth: 260 }} elevation="high">
        <div style={{ fontSize: 14, lineHeight: 1.5 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Card overlay</div>
          <div>
            This panel uses a frosted backdrop blur with subtle highlight for legible content on any image or
            gradient background.
          </div>
        </div>
      </GlassOverlay>
    </div>

    <GlassOverlay style={{ padding: 16, maxWidth: 420 }} blur={18} tintOpacity={0.42} elevation="mid">
      <div style={{ fontSize: 14, lineHeight: 1.6 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Selection highlight</div>
        <div>
          Wrap any selection area with this overlay to emphasize it without blocking interactions around it. The
          component is layout-agnostic, so position it with your own flex, grid, or absolute strategies.
        </div>
      </div>
    </GlassOverlay>
  </div>
);

export default GlassOverlay;
