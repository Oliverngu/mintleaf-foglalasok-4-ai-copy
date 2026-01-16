import React from 'react';

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
  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[70] p-4 backdrop-blur-sm"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--color-text-main) 55%, transparent)',
      }}
      onClick={event => {
        if (event.target === event.currentTarget) {
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
