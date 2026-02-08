import React, { useCallback, useEffect, useMemo, useRef } from 'react';

type WheelItemState = { isSelected: boolean };

type WheelItemClassName<T> =
  | string
  | ((item: T, state: WheelItemState) => string | undefined);

type HorizontalWheelPickerProps<T> = {
  items: T[];
  getKey: (item: T) => string;
  renderLabel: (item: T, state: WheelItemState) => React.ReactNode;
  selectedKey: string;
  onSelect: (key: string) => void;
  isDisabled?: (item: T) => boolean;
  infinite?: boolean;
  repeatCount?: number;
  className?: string;
  itemClassName?: WheelItemClassName<T>;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const HorizontalWheelPicker = <T,>({
  items,
  getKey,
  renderLabel,
  selectedKey,
  onSelect,
  isDisabled,
  infinite = false,
  repeatCount = 5,
  className,
  itemClassName,
}: HorizontalWheelPickerProps<T>) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const programmaticRef = useRef(false);
  const blockWidthRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const scrollEndTimeoutRef = useRef<number | null>(null);
  const initialCenteredRef = useRef(false);

  const safeRepeatCount = infinite ? Math.max(3, repeatCount) : 1;
  const middleBlock = Math.floor(safeRepeatCount / 2);

  const repeatedItems = useMemo(
    () =>
      Array.from({ length: safeRepeatCount }, (_, blockIndex) =>
        items.map(item => ({
          item,
          blockIndex,
          key: `${blockIndex}-${getKey(item)}`,
        }))
      ).flat(),
    [getKey, items, safeRepeatCount]
  );

  const getItemElement = useCallback(
    (key: string, blockIndex: number) => {
      const container = containerRef.current;
      if (!container) return null;
      return container.querySelector<HTMLButtonElement>(
        `[data-wheel-key="${key}"][data-wheel-block="${blockIndex}"]`
      );
    },
    []
  );

  const computeBlockWidth = useCallback(() => {
    if (!infinite || items.length === 0) return null;
    const firstKey = getKey(items[0]);
    const anchor2 = getItemElement(firstKey, middleBlock);
    const anchor3 = getItemElement(firstKey, middleBlock + 1);
    if (!anchor2 || !anchor3) return null;
    const width = anchor3.offsetLeft - anchor2.offsetLeft;
    if (width > 0) {
      blockWidthRef.current = width;
    }
    return blockWidthRef.current;
  }, [getItemElement, getKey, infinite, items, middleBlock]);

  const centerSelected = useCallback(
    (behavior: ScrollBehavior) => {
      const target = getItemElement(selectedKey, infinite ? middleBlock : 0);
      if (!target) return;
      target.scrollIntoView({ inline: 'center', block: 'nearest', behavior });
    },
    [getItemElement, infinite, middleBlock, selectedKey]
  );

  const applyWheelEffect = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const center = container.scrollLeft + container.clientWidth / 2;
    const nodes = container.querySelectorAll<HTMLButtonElement>('[data-wheel-item="true"]');
    nodes.forEach(node => {
      const nodeCenter = node.offsetLeft + node.offsetWidth / 2;
      const distance = nodeCenter - center;
      const normalized = clamp(distance / (container.clientWidth / 2), -1, 1);
      const scale = 1 - Math.abs(normalized) * 0.12;
      const rotateY = normalized * -12;
      const opacity = 1 - Math.abs(normalized) * 0.4;
      node.style.transform = `perspective(600px) rotateY(${rotateY}deg) scale(${scale})`;
      node.style.opacity = `${opacity}`;
    });
  }, []);

  const handleScroll = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;
      applyWheelEffect();
      if (!infinite) return;
      if (programmaticRef.current) return;
      const blockWidth = blockWidthRef.current ?? computeBlockWidth();
      if (!blockWidth) return;
      const threshold = blockWidth * 0.35;
      const maxScroll = container.scrollWidth - container.clientWidth;
      if (container.scrollLeft < threshold) {
        programmaticRef.current = true;
        container.scrollLeft = container.scrollLeft + blockWidth;
        programmaticRef.current = false;
      } else if (container.scrollLeft > maxScroll - threshold) {
        programmaticRef.current = true;
        container.scrollLeft = container.scrollLeft - blockWidth;
        programmaticRef.current = false;
      }
    });

    if (scrollEndTimeoutRef.current !== null) {
      window.clearTimeout(scrollEndTimeoutRef.current);
    }
    scrollEndTimeoutRef.current = window.setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;
      const center = container.scrollLeft + container.clientWidth / 2;
      const nodes = Array.from(
        container.querySelectorAll<HTMLButtonElement>('[data-wheel-item="true"]')
      );
      let closest: HTMLButtonElement | null = null;
      let minDistance = Number.POSITIVE_INFINITY;
      nodes.forEach(node => {
        const nodeCenter = node.offsetLeft + node.offsetWidth / 2;
        const distance = Math.abs(nodeCenter - center);
        if (distance < minDistance) {
          minDistance = distance;
          closest = node;
        }
      });
      if (!closest) return;
      const key = closest.getAttribute('data-wheel-key');
      const disabled = closest.getAttribute('data-wheel-disabled') === 'true';
      if (!key || disabled || key === selectedKey) return;
      onSelect(key);
    }, 100);
  }, [applyWheelEffect, computeBlockWidth, infinite, onSelect, selectedKey]);

  useEffect(() => {
    blockWidthRef.current = null;
    initialCenteredRef.current = false;
    computeBlockWidth();
  }, [computeBlockWidth, items, selectedKey]);

  useEffect(() => {
    centerSelected('smooth');
  }, [centerSelected, selectedKey]);

  useEffect(() => {
    if (initialCenteredRef.current) return;
    const container = containerRef.current;
    if (!container) return;
    const blockWidth = blockWidthRef.current ?? computeBlockWidth();
    if (infinite && !blockWidth) return;
    programmaticRef.current = true;
    centerSelected('auto');
    programmaticRef.current = false;
    initialCenteredRef.current = true;
    applyWheelEffect();
  }, [applyWheelEffect, centerSelected, computeBlockWidth, infinite]);

  useEffect(() => {
    const handleResize = () => applyWheelEffect();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [applyWheelEffect]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (scrollEndTimeoutRef.current !== null) {
        window.clearTimeout(scrollEndTimeoutRef.current);
      }
    },
    []
  );

  return (
    <div
      ref={containerRef}
      className={`flex items-center gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden ${className ?? ''}`}
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      onScroll={handleScroll}
    >
      {repeatedItems.map(({ item, blockIndex, key }) => {
        const itemKey = getKey(item);
        const isSelected = itemKey === selectedKey;
        const disabled = isDisabled?.(item) ?? false;
        const extraClass =
          typeof itemClassName === 'function' ? itemClassName(item, { isSelected }) : itemClassName;
        return (
          <button
            key={key}
            type="button"
            data-wheel-item="true"
            data-wheel-key={itemKey}
            data-wheel-block={blockIndex}
            data-wheel-disabled={disabled}
            disabled={disabled}
            onClick={() => {
              if (disabled) return;
              onSelect(itemKey);
            }}
            className={`shrink-0 transition ${extraClass ?? ''}`}
          >
            {renderLabel(item, { isSelected })}
          </button>
        );
      })}
    </div>
  );
};

export default HorizontalWheelPicker;
