import React, { useEffect, useRef } from 'react';

let modalOpenCount = 0;
let previousBodyStyles: {
  overflow?: string;
  position?: string;
  top?: string;
  width?: string;
  scrollTop?: number;
} | null = null;

interface ModalShellProps {
  onClose: () => void;
  header: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  ariaLabelledBy?: string;
  containerClassName?: string;
}

const ModalShell: React.FC<ModalShellProps> = ({
  onClose,
  header,
  children,
  footer,
  ariaLabelledBy,
  containerClassName,
}) => {
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    overlayRef.current?.focus();
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    const body = document.body;
    if (modalOpenCount === 0) {
      previousBodyStyles = {
        overflow: body.style.overflow,
        position: body.style.position,
        top: body.style.top,
        width: body.style.width,
        scrollTop: window.pageYOffset ?? window.scrollY ?? 0,
      };
      body.style.overflow = 'hidden';
      body.style.position = 'fixed';
      body.style.top = `-${previousBodyStyles.scrollTop ?? 0}px`;
      body.style.width = '100%';
    }
    // Reference count ensures nested modals keep the scroll lock active.
    modalOpenCount += 1;
    return () => {
      modalOpenCount = Math.max(0, modalOpenCount - 1);
      if (modalOpenCount === 0 && previousBodyStyles) {
        body.style.overflow = previousBodyStyles.overflow ?? '';
        body.style.position = previousBodyStyles.position ?? '';
        body.style.top = previousBodyStyles.top ?? '';
        body.style.width = previousBodyStyles.width ?? '';
        window.scrollTo(0, previousBodyStyles.scrollTop ?? 0);
        previousBodyStyles = null;
      }
    };
  }, []);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 flex items-center justify-start z-[70] p-4 backdrop-blur-sm bg-black/50"
      tabIndex={-1}
      onClick={event => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          onClose();
        }
      }}
    >
     <div
  role="dialog"
  aria-modal="true"
  aria-labelledby={ariaLabelledBy}
  className={[
    'rounded-2xl shadow-xl w-full',
    // 🔒 constrain modal height to viewport and clip overflow
    'max-h-[calc(100dvh-2rem)] overflow-hidden',
    containerClassName ?? '',
  ].join(' ')}
  style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-main)' }}
  onClick={event => event.stopPropagation()}
>
  <div className="flex h-full min-h-0 flex-col gap-4 p-6">
    {/* header never scrolls */}
    <div className="shrink-0">{header}</div>

    {/* ✅ scroll body */}
    <div className="flex-1 min-h-0 overflow-y-auto">
      {children}
    </div>

    {/* footer never scrolls */}
    {footer && <div className="shrink-0">{footer}</div>}
  </div>
</div>
    </div>
  );
};

export default ModalShell;
