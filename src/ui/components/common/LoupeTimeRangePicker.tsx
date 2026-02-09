import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

type LoupeBooking = {
  id: string;
  startMinutes: number;
  endMinutes: number;
  partySize: number;
};

type LoupeTimeRangePickerProps = {
  openingMinutes: number;
  maxWindowStartMinutes: number;
  stepMinutes: number;
  valueStartMinutes: number;
  onChangeStartMinutes: (nextStart: number) => void;
  capacity: number;
  bookings: LoupeBooking[];
};

const WINDOW_DURATION = 120;

const clampValue = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const minutesToTime = (minutes: number) => {
  const safeMinutes = Math.max(0, minutes);
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

const LoupeTimeRangePicker: React.FC<LoupeTimeRangePickerProps> = ({
  openingMinutes,
  maxWindowStartMinutes,
  stepMinutes,
  valueStartMinutes,
  onChangeStartMinutes,
  capacity,
  bookings,
}) => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragValue, setDragValue] = useState(valueStartMinutes);
  const [trackWidth, setTrackWidth] = useState(0);

  useLayoutEffect(() => {
    const element = trackRef.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) return;
      setTrackWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const totalDuration = (maxWindowStartMinutes - openingMinutes) + WINDOW_DURATION;
  const pxPerMin = trackWidth > 0 && totalDuration > 0 ? trackWidth / totalDuration : 0;
  const frameWidthPx = WINDOW_DURATION * pxPerMin;
  const displayValue = isDragging ? dragValue : valueStartMinutes;
  const idealLeftPx = (displayValue - openingMinutes) * pxPerMin;
  const maxLeft = Math.max(0, trackWidth - frameWidthPx);
  const clampedLeftPx = clampValue(idealLeftPx, 0, maxLeft);
  const contentOffsetPx = idealLeftPx - clampedLeftPx;
  const innerTranslateX = -idealLeftPx + contentOffsetPx;

  const slotCount = Math.ceil(totalDuration / stepMinutes);
  const capacitySafe = Math.max(capacity, 1);

  const slotMetrics = useMemo(() => {
    return Array.from({ length: slotCount }, (_, index) => {
      const slotStart = openingMinutes + index * stepMinutes;
      const slotEnd = slotStart + stepMinutes;
      const totalPartySize = bookings.reduce((sum, booking) => {
        if (booking.startMinutes < slotEnd && booking.endMinutes > slotStart) {
          return sum + booking.partySize;
        }
        return sum;
      }, 0);
      const occupancyPct = clampValue(totalPartySize / capacitySafe, 0, 1);
      return { slotStart, occupancyPct };
    });
  }, [bookings, capacitySafe, openingMinutes, slotCount, stepMinutes]);

  const overlappingBookingCount = useMemo(() => {
    const rangeStart = valueStartMinutes;
    const rangeEnd = valueStartMinutes + WINDOW_DURATION;
    return bookings.filter(booking => booking.startMinutes < rangeEnd && booking.endMinutes > rangeStart)
      .length;
  }, [bookings, valueStartMinutes]);

  const snapMinutes = useCallback(
    (rawMinutes: number) => {
      if (!Number.isFinite(rawMinutes)) return valueStartMinutes;
      const snapped = Math.round((rawMinutes - openingMinutes) / stepMinutes) * stepMinutes + openingMinutes;
      return clampValue(snapped, openingMinutes, maxWindowStartMinutes);
    },
    [maxWindowStartMinutes, openingMinutes, stepMinutes, valueStartMinutes]
  );

  const handlePointerToMinutes = useCallback(
    (clientX: number) => {
      if (!trackRef.current || pxPerMin <= 0) return valueStartMinutes;
      const rect = trackRef.current.getBoundingClientRect();
      const offsetX = clientX - rect.left;
      const minutes = openingMinutes + offsetX / pxPerMin;
      return snapMinutes(minutes);
    },
    [openingMinutes, pxPerMin, snapMinutes, valueStartMinutes]
  );

  const handleTrackPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const nextMinutes = handlePointerToMinutes(event.clientX);
      if (nextMinutes !== valueStartMinutes) {
        onChangeStartMinutes(nextMinutes);
      }
    },
    [handlePointerToMinutes, onChangeStartMinutes, valueStartMinutes]
  );

  const handleDragPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      pointerIdRef.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsDragging(true);
      setDragValue(valueStartMinutes);
    },
    [valueStartMinutes]
  );

  const handleDragPointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!isDragging || pointerIdRef.current !== event.pointerId) return;
      if (!trackRef.current || pxPerMin <= 0) return;
      const rect = trackRef.current.getBoundingClientRect();
      const relativeX = event.clientX - rect.left;
      const rawX = relativeX - frameWidthPx / 2;
      const rawMinutes = openingMinutes + rawX / pxPerMin;
      const clamped = clampValue(rawMinutes, openingMinutes, maxWindowStartMinutes);
      setDragValue(clamped);
    },
    [frameWidthPx, isDragging, maxWindowStartMinutes, openingMinutes, pxPerMin]
  );

  const stopDragging = useCallback(() => {
    setIsDragging(false);
    pointerIdRef.current = null;
  }, []);

  const handleDragPointerUp = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (pointerIdRef.current !== event.pointerId) return;
      const snapped = Math.round(dragValue / stepMinutes) * stepMinutes;
      const nextMinutes = clampValue(snapped, openingMinutes, maxWindowStartMinutes);
      if (nextMinutes !== valueStartMinutes) {
        onChangeStartMinutes(nextMinutes);
      }
      stopDragging();
    },
    [
      dragValue,
      maxWindowStartMinutes,
      onChangeStartMinutes,
      openingMinutes,
      stepMinutes,
      stopDragging,
      valueStartMinutes,
    ]
  );

  const handleDragPointerCancel = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (pointerIdRef.current !== event.pointerId) return;
      stopDragging();
    },
    [stopDragging]
  );

  const tickCount = Math.ceil(totalDuration / stepMinutes);
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) => {
    const minutes = openingMinutes + index * stepMinutes;
    const left = index * stepMinutes * pxPerMin;
    return { minutes, left, isHour: minutes % 60 === 0 };
  });

  const renderContent = (tone: 'base' | 'loupe') => {
    const tickClass = tone === 'loupe' ? 'border-slate-600/80' : 'border-slate-300/60';
    const railClass =
      tone === 'loupe'
        ? 'bg-slate-300/90 shadow-[0_1px_0_rgba(0,0,0,0.06)]'
        : 'bg-slate-300/40 shadow-[0_1px_0_rgba(0,0,0,0.06)]';
    return (
      <div className="relative w-full h-full">
        <div className={`absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[4px] rounded-full ${railClass}`} />
        <div className="absolute left-0 right-0 top-1/2 h-[4px] -translate-y-1/2 overflow-hidden rounded-full">
          {slotMetrics.map((slot, index) => {
            const left = index * stepMinutes * pxPerMin;
            const width = stepMinutes * pxPerMin;
            if (slot.occupancyPct === 1) {
              return (
                <div
                  key={index}
                  className={`absolute top-0 h-full ${
                    tone === 'loupe' ? 'bg-red-500' : 'bg-red-500/45'
                  }`}
                  style={{ left, width }}
                />
              );
            }
            if (slot.occupancyPct > 0.75) {
              return (
                <div
                  key={index}
                  className={`absolute top-0 h-full ${
                    tone === 'loupe' ? 'bg-orange-400/90' : 'bg-orange-400/40'
                  }`}
                  style={{ left, width }}
                />
              );
            }
            if (slot.occupancyPct > 0.6) {
              return (
                <div
                  key={index}
                  className={`absolute top-0 h-full ${
                    tone === 'loupe' ? 'bg-yellow-400/90' : 'bg-yellow-400/40'
                  }`}
                  style={{ left, width }}
                />
              );
            }
            if (slot.occupancyPct > 0) {
              return (
                <div
                  key={index}
                  className={`absolute top-0 h-full ${
                    tone === 'loupe' ? 'bg-emerald-400/80' : 'bg-emerald-400/35'
                  }`}
                  style={{ left, width }}
                />
              );
            }
            return null;
          })}
        </div>
        {ticks.map(tick => (
          <div
            key={`grid-${tone}-${tick.minutes}`}
            className={`absolute -translate-x-1/2 border-l pointer-events-none ${tickClass}`}
            style={{
              left: tick.left,
              top: 'calc(50% + 1px)',
              height: tick.isHour ? 14 : 8,
            }}
          />
        ))}
        {ticks
          .filter(tick => tick.isHour)
          .map(tick => {
            const pad = 12;
            const maxX = Math.max(pad, trackWidth - pad);
            const clampedLeft = clampValue(tick.left, pad, maxX);
            return (
              <span
                key={`label-${tone}-${tick.minutes}`}
                className="absolute bottom-1 -translate-x-1/2 text-[9px] text-slate-400 pointer-events-none"
                style={{ left: clampedLeft }}
              >
                {minutesToTime(tick.minutes)}
              </span>
            );
          })}
      </div>
    );
  };

  return (
    <div
      ref={trackRef}
      className="relative w-full h-12 min-w-0 select-none touch-none overflow-visible bg-transparent"
      onPointerDown={handleTrackPointerDown}
    >
      <div className="absolute inset-0">{renderContent('base')}</div>

      <div
        className="absolute top-1/2 -translate-y-1/2 h-11 rounded-lg border-2 border-slate-900 bg-white shadow-xl overflow-hidden cursor-grab active:cursor-grabbing"
        style={{ left: clampedLeftPx, width: frameWidthPx }}
      >
        <button
          type="button"
          aria-label="Idősáv mozgatása"
          onPointerDown={event => {
            event.stopPropagation();
            handleDragPointerDown(event);
          }}
          onPointerMove={handleDragPointerMove}
          onPointerUp={handleDragPointerUp}
          onPointerCancel={handleDragPointerCancel}
          onLostPointerCapture={handleDragPointerCancel}
          className="absolute top-0 inset-x-0 h-4 bg-slate-100 border-b border-slate-200 flex justify-center items-center z-20 touch-none"
        >
          <span className="w-8 h-1 bg-slate-300 rounded-full" />
        </button>
        <div
          className="absolute top-0 bottom-0 left-0"
          style={{ width: trackWidth, transform: `translateX(${innerTranslateX}px)` }}
        >
          {renderContent('loupe')}
        </div>
        {overlappingBookingCount > 0 && (
          <div className="absolute left-2 top-6">
            <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white">
              {overlappingBookingCount}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoupeTimeRangePicker;
