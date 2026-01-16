import React, { useEffect, useRef } from 'react';

let modalOpenCount = 0;
let lockedScrollTop = 0;
let previousBodyStyles: {
  overflow?: string;
  position?: string;
  top?: string;
  width?: string;
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
      };
      lockedScrollTop = window.scrollY || 0;
      body.style.overflow = 'hidden';
      body.style.position = 'fixed';
      body.style.top = `-${lockedScrollTop}px`;
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
        window.scrollTo(0, lockedScrollTop);
        previousBodyStyles = null;
      }
    };
  }, []);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 flex items-center justify-center z-[70] p-4 backdrop-blur-sm bg-black/50"
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
        className={`rounded-2xl shadow-xl w-full ${containerClassName ?? ''}`}
        style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-main)' }}
        onClick={event => event.stopPropagation()}
      >
        <div className="flex h-full flex-col gap-4 p-6">
          <div>{header}</div>
          <div className="flex-1 min-h-0">{children}</div>
          {footer && <div>{footer}</div>}
        </div>
      </div>
    </div>
  );
};

export default ModalShell;
