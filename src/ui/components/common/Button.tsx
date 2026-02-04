import React, { useEffect, useMemo, useState } from 'react';
import { getDeepGlassClass, getDeepGlassVars } from './buttonVariants/deepGlass';
import '../../styles/buttons.css';

export type ButtonVariant = 'deep' | string | undefined;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const getUiTheme = (): string | undefined => {
  if (typeof document === 'undefined') return undefined;
  const rootTheme = document.documentElement.dataset.uiTheme;
  const bodyTheme = typeof document !== 'undefined' ? document.body?.dataset?.uiTheme : undefined;
  return rootTheme || bodyTheme || undefined;
};

const getPrimaryHex = (): string => {
  if (typeof window === 'undefined') return '#166534';
  const root = document.documentElement;
  const value = getComputedStyle(root).getPropertyValue('--color-primary').trim();
  return value || '#166534';
};

const Button: React.FC<ButtonProps> = ({
  children,
  className,
  style,
  variant,
  disabled,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onPointerLeave,
  ...rest
}) => {
  const [isPressed, setIsPressed] = useState(false);
  const [primaryHex, setPrimaryHex] = useState('#166534');

  useEffect(() => {
    setPrimaryHex(getPrimaryHex());
  }, []);

  const uiTheme = useMemo(() => getUiTheme(), []);
  const explicitVariantProvided = variant !== undefined;
  const resolvedVariant: ButtonVariant =
    uiTheme === 'minimal_glass' && !explicitVariantProvided ? 'deep' : variant;

  const deepVars = useMemo(
    () => (resolvedVariant === 'deep' ? getDeepGlassVars(primaryHex) : undefined),
    [primaryHex, resolvedVariant]
  );

  const deepClass = resolvedVariant === 'deep' ? getDeepGlassClass(!disabled && isPressed) : '';
  const mergedClassName = [className, deepClass].filter(Boolean).join(' ');
  const mergedStyle = deepVars ? { ...deepVars, ...style } : style;

  const handlePointerDown: React.PointerEventHandler<HTMLButtonElement> = (event) => {
    if (!disabled) {
      setIsPressed(true);
    }
    onPointerDown?.(event);
  };

  const handlePointerUp: React.PointerEventHandler<HTMLButtonElement> = (event) => {
    setIsPressed(false);
    onPointerUp?.(event);
  };

  const handlePointerCancel: React.PointerEventHandler<HTMLButtonElement> = (event) => {
    setIsPressed(false);
    onPointerCancel?.(event);
  };

  const handlePointerLeave: React.PointerEventHandler<HTMLButtonElement> = (event) => {
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
