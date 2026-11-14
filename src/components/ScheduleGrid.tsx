import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  CATEGORY_META,
  formatShortDay,
  formatTimeRange,
  getRangeDates,
  hhmmToMinutes,
  toIsoDate,
} from '../lib/calendarUtils';
import type { CalendarBlock, WorkingHours } from '../shared/types';

interface ScheduleGridProps {
  events: CalendarBlock[];
  workingHours: WorkingHours;
  anchorDate: string;
  viewMode: 'day' | '4day';
  onChangeViewMode: (mode: 'day' | '4day') => void;
  onChangeAnchorDate: (iso: string) => void;
  onShiftAnchorDate: (days: number) => void;
  onSelectSlot: (date: string, startTime: string) => void;
  onSelectEvent: (event: CalendarBlock) => void;
  highlightedEventId?: string | null;
}

const HOUR_HEIGHT = 60; // 1px per minute

export function ScheduleGrid({
  events,
  workingHours,
  anchorDate,
  viewMode,
  onChangeViewMode,
  onChangeAnchorDate,
  onShiftAnchorDate,
  onSelectSlot,
  onSelectEvent,
  highlightedEventId,
}: ScheduleGridProps) {
  const todayIso = toIsoDate(new Date());
  const dayCount = viewMode === 'day' ? 1 : 4;
  const visibleDates = getRangeDates(anchorDate, dayCount);

  const startHour = workingHours.startHour;
  const endHour = workingHours.endHour;
  const hours: number[] = [];
  for (let h = startHour; h < endHour; h++) {
    hours.push(h);
  }
  const totalHeight = hours.length * HOUR_HEIGHT;

  const firstDay = formatShortDay(visibleDates[0]);
  const lastDay = formatShortDay(visibleDates[visibleDates.length - 1]);
  const headerRangeLabel =
    dayCount === 1
      ? `${firstDay.weekday}, ${firstDay.month} ${firstDay.dayNum}`
      : `${firstDay.month} ${firstDay.dayNum} – ${lastDay.month} ${lastDay.dayNum}`;

  return (
    <div className="flex flex-col h-full bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
      {/* Calendar Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[#E2E8F0] bg-white">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-[#0F172A] tracking-tight whitespace-nowrap">
            {headerRangeLabel}
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onShiftAnchorDate(-dayCount)}
              aria-label="Previous period"
              className="p-1.5 rounded-md border border-[#E2E8F0] text-[#475569] hover:text-[#0F172A] hover:bg-[#F8FAFC] transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onChangeAnchorDate(todayIso)}
              className="px-2.5 py-1 text-xs font-medium rounded-md border border-[#E2E8F0] text-[#334155] hover:text-[#0F172A] hover:bg-[#F8FAFC] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => onShiftAnchorDate(dayCount)}
              aria-label="Next period"
              className="p-1.5 rounded-md border border-[#E2E8F0] text-[#475569] hover:text-[#0F172A] hover:bg-[#F8FAFC] transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center p-0.5 bg-[#F1F5F9] rounded-md border border-[#E2E8F0]">
            <button
              type="button"
              onClick={() => onChangeViewMode('day')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === 'day'
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              Day
            </button>
            <button
              type="button"
              onClick={() => onChangeViewMode('4day')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === '4day'
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              4-Day Grid
            </button>
          </div>

          <button
            type="button"
            onClick={() => onSelectSlot(anchorDate, '10:00')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[#2563EB] text-white hover:bg-[#1D4ED8] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            <span>Block Time</span>
          </button>
        </div>
      </div>

      {/* Day Column Headers */}
      <div
        className="grid border-b border-[#E2E8F0] bg-[#F8FAFC]"
        style={{
          gridTemplateColumns: `64px repeat(${visibleDates.length}, minmax(0, 1fr))`,
        }}
      >
        <div className="py-2.5 px-2 text-right font-mono text-[11px] text-[#64748B] border-r border-[#E2E8F0]">
          Local
        </div>
        {visibleDates.map((dateIso) => {
          const d = formatShortDay(dateIso);
          const isToday = dateIso === todayIso;
          const dayBlockCount = events.filter((e) => e.date === dateIso).length;
          return (
            <div
              key={dateIso}
              className="py-2 px-3 border-r last:border-r-0 border-[#E2E8F0] flex items-center justify-between gap-2"
            >
              <div className="flex items-baseline gap-1.5">
                <span
                  className={`text-xs font-medium ${
                    isToday ? 'text-[#2563EB]' : 'text-[#64748B]'
                  }`}
                >
                  {d.weekday}
                </span>
                <span
                  className={`font-mono text-sm font-semibold tabular-nums ${
                    isToday ? 'text-[#2563EB]' : 'text-[#0F172A]'
                  }`}
                >
                  {d.dayNum}
                </span>
              </div>
              <span className="font-mono text-[11px] text-[#64748B] tabular-nums">
                {dayBlockCount} {dayBlockCount === 1 ? 'block' : 'blocks'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Scrollable Hourly Grid */}
      <div className="flex-1 overflow-y-auto">
        <div
          className="grid relative"
          style={{
            gridTemplateColumns: `64px repeat(${visibleDates.length}, minmax(0, 1fr))`,
            height: `${totalHeight}px`,
          }}
        >
          {/* Time Ruler */}
          <div className="border-r border-[#E2E8F0] bg-[#F8FAFC] relative select-none">
            {hours.map((h) => (
              <div
                key={h}
                className="h-[60px] pr-2 pt-1 text-right font-mono text-[11px] text-[#64748B] tabular-nums border-b border-[#E2E8F0]/70"
              >
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Day Columns */}
          {visibleDates.map((dateIso) => {
            const dayEvents = events.filter((e) => e.date === dateIso);
            return (
              <div
                key={dateIso}
                className="relative border-r last:border-r-0 border-[#E2E8F0]"
              >
                {/* Clickable Empty Hour Slots */}
                {hours.map((h) => {
                  const hhmm = `${String(h).padStart(2, '0')}:00`;
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => onSelectSlot(dateIso, hhmm)}
                      aria-label={`Block ${dateIso} at ${hhmm}`}
                      className="block w-full h-[60px] border-b border-[#E2E8F0]/70 hover:bg-[#F8FAFC] transition-colors text-left group cursor-pointer"
                    >
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 text-[11px] font-mono text-[#64748B] inline-block">
                        + {hhmm}
                      </span>
                    </button>
                  );
                })}

                {/* Scheduled Blocks */}
                {dayEvents.map((ev) => {
                  const startMin = hhmmToMinutes(ev.startTime);
                  const topPx = startMin - startHour * 60;
                  const heightPx = Math.max(32, ev.durationMinutes);
                  if (topPx + heightPx <= 0 || topPx >= totalHeight) return null;

                  const clampedTop = Math.max(0, topPx);
                  const clampedHeight = Math.min(totalHeight - clampedTop, heightPx);
                  const meta = CATEGORY_META[ev.category];
                  const isHighlighted = highlightedEventId === ev.id;

                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectEvent(ev);
                      }}
                      style={{
                        top: `${clampedTop + 1}px`,
                        height: `${Math.max(28, clampedHeight - 2)}px`,
                      }}
                      className={`absolute left-1.5 right-1.5 rounded-md border px-2.5 py-1.5 text-left transition-all overflow-hidden cursor-pointer ${
                        meta.bg
                      } ${meta.border} ${
                        isHighlighted
                          ? 'ring-2 ring-[#2563EB] shadow-sm'
                          : 'hover:brightness-97'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-xs font-semibold truncate ${meta.text}`}
                        >
                          {ev.title}
                        </span>
                        <span className="font-mono text-[11px] text-[#475569] tabular-nums shrink-0">
                          {ev.durationMinutes}m
                        </span>
                      </div>
                      {clampedHeight >= 46 && (
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#475569] truncate">
                          <span className="truncate">{ev.clientName}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums shrink-0">
                            {formatTimeRange(ev.startTime, ev.durationMinutes)}
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
