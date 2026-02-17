import React, { useMemo, useState } from 'react';
import { getDeepGlassVars, getDeepGlassClass } from './buttonVariants/deepGlass';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'deep' | string;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const readPrimaryColor = (): string => {
  if (typeof document === 'undefined') return '#166534';
  const primary = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
  return primary || '#166534';
};

const readUiTheme = (): string | undefined => {
  if (typeof document === 'undefined') return undefined;
  return document.documentElement.dataset.uiTheme;
};

const Button: React.FC<ButtonProps> = ({
  variant,
  className = '',
  style,
  disabled,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onPointerLeave,
  children,
  ...rest
}) => {
  const [isPressed, setIsPressed] = useState(false);
  const uiTheme = useMemo(readUiTheme, []);
  const explicitVariantProvided = variant !== undefined;

  const resolvedVariant = useMemo(() => {
    if (uiTheme === 'minimal_glass' && !explicitVariantProvided) {
      return 'deep';
    }
    return variant ?? 'primary';
  }, [uiTheme, explicitVariantProvided, variant]);

  const deepVars = useMemo(
    () => (resolvedVariant === 'deep' ? getDeepGlassVars(readPrimaryColor()) : undefined),
    [resolvedVariant]
  );

  const mergedClassName = [
    className,
    resolvedVariant === 'deep' ? getDeepGlassClass(!disabled && isPressed) : null,
  ]
    .filter(Boolean)
    .join(' ');

  const mergedStyle = resolvedVariant === 'deep' && deepVars ? { ...deepVars, ...style } : style;

  const handlePointerDown: React.PointerEventHandler<HTMLButtonElement> = event => {
    if (!disabled) {
      setIsPressed(true);
    }
    onPointerDown?.(event);
  };

  const handlePointerUp: React.PointerEventHandler<HTMLButtonElement> = event => {
    setIsPressed(false);
    onPointerUp?.(event);
  };

  const handlePointerCancel: React.PointerEventHandler<HTMLButtonElement> = event => {
    setIsPressed(false);
    onPointerCancel?.(event);
  };

  const handlePointerLeave: React.PointerEventHandler<HTMLButtonElement> = event => {
    setIsPressed(false);
    onPointerLeave?.(event);
  };

  return (
    <button
      {...rest}
      disabled={disabled}
      className={mergedClassName}
      style={mergedStyle}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerLeave}
    >
      {children}
    </button>
  );
};

export default Button;
