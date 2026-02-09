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
  const idealLeftPx = (valueStartMinutes - openingMinutes) * pxPerMin;
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
      const nextMinutes = handlePointerToMinutes(event.clientX);
      if (nextMinutes !== valueStartMinutes) {
        onChangeStartMinutes(nextMinutes);
      }
    },
    [handlePointerToMinutes, onChangeStartMinutes, valueStartMinutes]
  );

  const handleDragPointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!isDragging || pointerIdRef.current !== event.pointerId) return;
      const nextMinutes = handlePointerToMinutes(event.clientX);
      if (nextMinutes !== valueStartMinutes) {
        onChangeStartMinutes(nextMinutes);
      }
    },
    [handlePointerToMinutes, isDragging, onChangeStartMinutes, valueStartMinutes]
  );

  const stopDragging = useCallback(() => {
    setIsDragging(false);
    pointerIdRef.current = null;
  }, []);

  const handleDragPointerUp = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (pointerIdRef.current !== event.pointerId) return;
      stopDragging();
    },
    [stopDragging]
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

  const renderTicks = (tone: 'base' | 'loupe', topOffset: string) => {
    const tickClass = tone === 'loupe' ? 'bg-slate-500/70' : 'bg-slate-200/50';
    const labelClass = tone === 'loupe' ? 'text-slate-900' : 'text-slate-300/70';
    return (
      <div className={`absolute left-0 right-0 h-[18px] ${topOffset}`}>
        {ticks.map(tick => (
          <div
            key={`tick-${tone}-${tick.minutes}`}
            className="absolute bottom-0 flex flex-col items-center"
            style={{ left: tick.left }}
          >
            <span
              className={`block w-px ${tickClass}`}
              style={{ height: tick.isHour ? 14 : 8 }}
            />
            {tick.isHour && (
              <span className={`mt-1 text-[9px] font-semibold leading-none ${labelClass}`}>
                {String(Math.floor(tick.minutes / 60)).padStart(2, '0')}:00
              </span>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      ref={trackRef}
      className="relative h-[64px] w-full min-w-0 select-none touch-none overflow-hidden"
      onPointerDown={handleTrackPointerDown}
    >
      <div className="absolute left-0 right-0 top-[36px] h-[4px] rounded-full bg-slate-100">
        {slotMetrics.map((slot, index) => {
          const left = index * stepMinutes * pxPerMin;
          const width = stepMinutes * pxPerMin;
          let tintClass = 'bg-emerald-200/60';
          if (slot.occupancyPct === 1) {
            tintClass = 'bg-red-500';
          } else if (slot.occupancyPct > 0.75) {
            tintClass = 'bg-orange-400';
          } else if (slot.occupancyPct > 0.6) {
            tintClass = 'bg-yellow-400';
          }
          return (
            <div
              key={slot.slotStart}
              className={`absolute top-0 h-full ${tintClass}`}
              style={{ left, width }}
            />
          );
        })}
      </div>
      {renderTicks('base', 'top-[36px]')}

      <div
        className="absolute top-[8px] h-[48px] border-2 border-slate-800 bg-white shadow-lg overflow-hidden cursor-grab active:cursor-grabbing rounded-lg z-10"
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
          className="absolute top-0 inset-x-0 h-4 bg-slate-50 border-b border-slate-200 flex justify-center items-center z-20 touch-none"
        >
          <span className="w-8 h-1 bg-slate-300 rounded-full" />
        </button>
        <div
          className="absolute inset-0"
          style={{ width: trackWidth, transform: `translateX(${innerTranslateX}px)` }}
        >
          <div className="absolute left-0 right-0 top-[28px] h-[4px] rounded-full bg-slate-100">
            {slotMetrics.map((slot, index) => {
              const left = index * stepMinutes * pxPerMin;
              const width = stepMinutes * pxPerMin;
              let tintClass = 'bg-emerald-200/60';
              if (slot.occupancyPct === 1) {
                tintClass = 'bg-red-500';
              } else if (slot.occupancyPct > 0.75) {
                tintClass = 'bg-orange-400';
              } else if (slot.occupancyPct > 0.6) {
                tintClass = 'bg-yellow-400';
              }
              return (
                <div
                  key={`loupe-slot-${slot.slotStart}`}
                  className={`absolute top-0 h-full ${tintClass}`}
                  style={{ left, width }}
                />
              );
            })}
          </div>
          {renderTicks('loupe', 'top-[28px]')}
        </div>
        <div className="absolute left-2 top-6">
          <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white">
            {overlappingBookingCount}
          </span>
        </div>
      </div>
    </div>
  );
};

export default LoupeTimeRangePicker;
