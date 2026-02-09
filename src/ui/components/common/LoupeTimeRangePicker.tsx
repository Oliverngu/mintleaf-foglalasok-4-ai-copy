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

  return (
    <div className="w-full min-w-0 space-y-3">
      <div
        ref={trackRef}
        className="relative h-3 w-full min-w-0 overflow-hidden rounded-full bg-gray-100"
        onPointerDown={handleTrackPointerDown}
      >
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

      <div className="relative h-12 w-full min-w-0">
        <div
          className="absolute top-0 h-12 rounded-2xl border border-emerald-300 bg-white/80 shadow-sm backdrop-blur-sm"
          style={{ left: clampedLeftPx, width: frameWidthPx }}
        >
          <div className="relative h-full overflow-hidden rounded-2xl">
            <div
              className="absolute inset-0"
              style={{ width: trackWidth, transform: `translateX(${innerTranslateX}px)` }}
            >
              {slotMetrics.map((slot, index) => {
                const left = index * stepMinutes * pxPerMin;
                const width = stepMinutes * pxPerMin;
                const isHour = slot.slotStart % 60 === 0;
                return (
                  <div
                    key={`tick-${slot.slotStart}`}
                    className="absolute bottom-1 flex flex-col items-center"
                    style={{ left, width }}
                  >
                    <span
                      className={`block w-px ${isHour ? 'h-4 bg-gray-500' : 'h-2 bg-gray-300'}`}
                    />
                  </div>
                );
              })}
            </div>
            <div className="absolute left-2 top-2 flex items-center gap-2">
              <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                {overlappingBookingCount}
              </span>
              <span className="text-[10px] font-semibold uppercase text-emerald-700">
                Foglalás
              </span>
            </div>
          </div>
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
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm touch-none"
          >
            <span className="h-4 w-1 rounded-full bg-white" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoupeTimeRangePicker;
