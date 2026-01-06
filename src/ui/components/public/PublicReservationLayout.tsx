import React from 'react';
import GlassOverlay from '../common/GlassOverlay';
import { ReservationThemeTokens } from '../../../core/ui/reservationTheme';

interface PublicReservationLayoutProps {
  theme: ReservationThemeTokens;
  isMinimalGlassTheme?: boolean;
  header: React.ReactNode;
  body: React.ReactNode;
  footer?: React.ReactNode;
  topRightContent?: React.ReactNode;
  watermarkText?: string;
  decorations?: React.ReactNode;
}

const PublicReservationLayout: React.FC<PublicReservationLayoutProps> = ({
  theme,
  isMinimalGlassTheme = false,
  header,
  body,
  footer,
  topRightContent,
  watermarkText,
  decorations,
}) => {
  const wrapperClassName = `relative min-h-[100dvh] w-full overflow-x-hidden overflow-y-auto flex flex-col ${theme.styles.page}`;

  const cardContent = (
    <div
      className={`relative flex flex-col w-full gap-4 px-4 md:px-8 py-6 md:py-8 min-h-0 max-h-[calc(100dvh-4rem)] overflow-hidden ${theme.styles.card}`}
      style={theme.cardStyle}
    >
      {topRightContent && (
        <div className="absolute top-4 right-4 flex items-center gap-2 text-sm font-medium">
          {topRightContent}
        </div>
      )}
      <div className="flex flex-col flex-1 min-h-0 gap-4">
        <div className="flex-shrink-0 flex flex-col gap-3 text-center items-center">
          {header}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {body}
        </div>
        {footer && (
          <div className="flex-shrink-0 pt-2 pb-[calc(env(safe-area-inset-bottom)+12px)]">{footer}</div>
        )}
      </div>
      {watermarkText && (
        <div
          className={`pointer-events-none absolute bottom-3 right-4 text-xs md:text-sm z-10 drop-shadow ${theme.styles.watermark || ''}`}
          style={{
            color: theme.watermarkStyle?.color || theme.colors.textSecondary,
            ...(theme.watermarkStyle || {}),
          }}
        >
          {watermarkText}
        </div>
      )}
    </div>
  );

  return (
    <div
      className={wrapperClassName}
      style={{
        color: 'var(--color-text-primary)',
        ...(theme.pageStyle || {}),
      }}
    >
      {theme.styles.pageOverlay && (
        <div
          className={`pointer-events-none absolute inset-0 ${theme.styles.pageOverlay}`}
          aria-hidden
        />
      )}
      {decorations && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          {decorations}
        </div>
      )}
      <div className={`relative z-10 flex-1 flex flex-col items-center ${theme.styles.pageInner}`}>
        <div className="w-full max-w-5xl px-4 py-8 md:py-12">
          {isMinimalGlassTheme ? (
            <GlassOverlay variant="minimal-glass">{cardContent}</GlassOverlay>
          ) : (
            cardContent
          )}
        </div>
      </div>
    </div>
  );
};

export default PublicReservationLayout;
