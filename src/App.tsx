import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock, ListFilter, Plus, SlidersHorizontal } from 'lucide-react';
import { BlockModal } from './components/BlockModal';
import { BookingsTable } from './components/BookingsTable';
import { ScheduleGrid } from './components/ScheduleGrid';
import { SettingsModal } from './components/SettingsModal';
import { VoiceAssistantPanel } from './components/VoiceAssistantPanel';
import { addDays, toIsoDate } from './lib/calendarUtils';
import type {
  CalendarBlock,
  ParsedIntentLog,
  VoicePersona,
  WorkingHours,
} from './shared/types';

type ActiveView = 'grid' | 'table';

export default function App() {
  const [events, setEvents] = useState<CalendarBlock[]>([]);
  const [workingHours, setWorkingHours] = useState<WorkingHours>({
    startHour: 8,
    endHour: 19,
    bufferMinutes: 0,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeView, setActiveView] = useState<ActiveView>('grid');
  const [calendarViewMode, setCalendarViewMode] = useState<'day' | '4day'>('4day');
  const [anchorDate, setAnchorDate] = useState<string>(() => toIsoDate(new Date()));
  const [voicePersona, setVoicePersona] = useState<VoicePersona>('Zephyr');
  const [intents, setIntents] = useState<ParsedIntentLog[]>([]);
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null);

  const [modalState, setModalState] = useState<{
    open: boolean;
    mode: 'create' | 'edit';
    date: string;
    startTime: string;
    event: CalendarBlock | null;
  }>({
    open: false,
    mode: 'create',
    date: toIsoDate(new Date()),
    startTime: '10:00',
    event: null,
  });

  const [settingsOpen, setSettingsOpen] = useState(false);

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [eventsRes, settingsRes] = await Promise.all([
        fetch('/api/events'),
        fetch('/api/settings'),
      ]);
      if (!eventsRes.ok || !settingsRes.ok) {
        throw new Error('Failed to load schedule data.');
      }
      const eventsJson = (await eventsRes.json()) as { events: CalendarBlock[] };
      const settingsJson = (await settingsRes.json()) as {
        workingHours: WorkingHours;
      };
      setEvents(eventsJson.events || []);
      if (settingsJson.workingHours) {
        setWorkingHours(settingsJson.workingHours);
      }
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Could not reach scheduling server.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  const handleIntentLogged = useCallback((intent: ParsedIntentLog) => {
    setIntents((prev) => [intent, ...prev]);
    if (intent.affectedEventId) {
      setHighlightedEventId(intent.affectedEventId);
      setTimeout(() => {
        setHighlightedEventId((curr) =>
          curr === intent.affectedEventId ? null : curr
        );
      }, 4500);
    }
    const targetDate = intent.args?.date || intent.args?.newDate;
    if (typeof targetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      setAnchorDate(targetDate);
    }
  }, []);

  const todayIso = toIsoDate(new Date());
  const stats = useMemo(() => {
    const todayBlocks = events.filter((e) => e.date === todayIso);
    const totalMinutes = events.reduce((sum, e) => sum + e.durationMinutes, 0);
    const voiceBooked = events.filter((e) => e.source === 'voice_ai').length;
    return {
      todayCount: todayBlocks.length,
      totalHours: (totalMinutes / 60).toFixed(1),
      voiceBooked,
      totalBlocks: events.length,
    };
  }, [events, todayIso]);

  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    []
  );

  return (
    <div className="min-h-screen lg:h-screen flex flex-col lg:flex-row bg-[#F8FAFC] text-[#0F172A] lg:overflow-hidden">
      {/* Sidebar Navigation */}
      <aside className="w-full lg:w-[248px] shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-[#E2E8F0] flex flex-col justify-between">
        <div>
          {/* Brand */}
          <div className="h-14 px-5 flex items-center border-b border-[#E2E8F0]">
            <a
              href="/"
              className="font-display text-lg font-bold tracking-tight text-[#0F172A] whitespace-nowrap shrink-0"
            >
              Cadence
            </a>
          </div>

          {/* Primary Nav */}
          <nav className="p-3 space-y-1" aria-label="Workspace views">
            <button
              type="button"
              onClick={() => setActiveView('grid')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeView === 'grid'
                  ? 'bg-[#EFF6FF] text-[#1D4ED8]'
                  : 'text-[#475569] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
              }`}
            >
              <CalendarDays className="w-4 h-4 shrink-0" />
              <span>Schedule Grid</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('table')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeView === 'table'
                  ? 'bg-[#EFF6FF] text-[#1D4ED8]'
                  : 'text-[#475569] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
              }`}
            >
              <ListFilter className="w-4 h-4 shrink-0" />
              <span>Client Bookings</span>
            </button>
          </nav>

          {/* Compact Tabular Summary */}
          <div className="px-5 py-4 border-t border-[#E2E8F0] space-y-2.5">
            <div className="text-xs font-semibold text-[#64748B]">
              Schedule Overview
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#475569]">Today&apos;s blocks</span>
              <span className="font-mono font-semibold text-[#0F172A] tabular-nums">
                {stats.todayCount}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#475569]">Total scheduled</span>
              <span className="font-mono font-semibold text-[#0F172A] tabular-nums">
                {stats.totalHours}h
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#475569]">Booked by voice</span>
              <span className="font-mono font-semibold text-[#0F172A] tabular-nums">
                {stats.voiceBooked} / {stats.totalBlocks}
              </span>
            </div>
          </div>

          {/* Working Hours Configuration */}
          <div className="px-5 py-4 border-t border-[#E2E8F0] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#64748B]">
                Availability Window
              </span>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#2563EB] hover:text-[#1D4ED8] cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[#334155] font-mono tabular-nums">
              <Clock className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
              <span>
                {String(workingHours.startHour).padStart(2, '0')}:00 –{' '}
                {String(workingHours.endHour).padStart(2, '0')}:00
              </span>
              {workingHours.bufferMinutes > 0 && (
                <span>· {workingHours.bufferMinutes}m buffer</span>
              )}
            </div>
          </div>
        </div>

        {/* Footer Note */}
        <div className="hidden lg:block px-5 py-3.5 border-t border-[#E2E8F0] text-[11px] text-[#64748B] leading-relaxed">
          Local schedule store with one-click .ICS export for any calendar client.
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Top Bar */}
        <header className="h-14 px-5 bg-white border-b border-[#E2E8F0] flex items-center justify-between gap-8 shrink-0">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <span className="text-[#64748B] truncate">Workspace</span>
            <span className="text-[#CBD5E1]" aria-hidden="true">
              /
            </span>
            <h1 className="font-semibold text-[#0F172A] truncate">
              {activeView === 'grid'
                ? 'Voice Calendar & Availability'
                : 'Client Bookings Ledger'}
            </h1>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <span className="hidden sm:inline font-mono text-xs text-[#64748B] whitespace-nowrap">
              {timezone}
            </span>
            <button
              type="button"
              onClick={() =>
                setModalState({
                  open: true,
                  mode: 'create',
                  date: anchorDate,
                  startTime: '10:00',
                  event: null,
                })
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md bg-[#0F172A] text-white hover:bg-[#1E293B] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Block</span>
            </button>
          </div>
        </header>

        {/* Split Workspace */}
        <main className="flex-1 p-4 lg:p-5 flex flex-col lg:flex-row gap-4 min-h-0 lg:overflow-hidden">
          <section className="flex-1 min-w-0 min-h-[520px] lg:min-h-0">
            {loading ? (
              <div className="h-full bg-white border border-[#E2E8F0] rounded-lg p-6 space-y-4">
                <div className="h-7 w-48 bg-[#F1F5F9] rounded animate-pulse" />
                <div className="grid grid-cols-4 gap-3 pt-2">
                  {[0, 1, 2, 3].map((col) => (
                    <div
                      key={col}
                      className="h-80 bg-[#F8FAFC] border border-[#E2E8F0] rounded animate-pulse"
                    />
                  ))}
                </div>
              </div>
            ) : loadError ? (
              <div className="h-full bg-white border border-[#E2E8F0] rounded-lg p-8 flex flex-col items-center justify-center text-center">
                <p className="text-sm font-semibold text-[#0F172A]">{loadError}</p>
                <button
                  type="button"
                  onClick={() => void loadInitialData()}
                  className="mt-3 px-4 py-2 text-xs font-medium rounded-md bg-[#2563EB] text-white hover:bg-[#1D4ED8] cursor-pointer"
                >
                  Retry
                </button>
              </div>
            ) : activeView === 'grid' ? (
              <ScheduleGrid
                events={events}
                workingHours={workingHours}
                anchorDate={anchorDate}
                viewMode={calendarViewMode}
                onChangeViewMode={setCalendarViewMode}
                onChangeAnchorDate={setAnchorDate}
                onShiftAnchorDate={(days) =>
                  setAnchorDate((prev) => addDays(prev, days))
                }
                onSelectSlot={(date, startTime) =>
                  setModalState({
                    open: true,
                    mode: 'create',
                    date,
                    startTime,
                    event: null,
                  })
                }
                onSelectEvent={(ev) =>
                  setModalState({
                    open: true,
                    mode: 'edit',
                    date: ev.date,
                    startTime: ev.startTime,
                    event: ev,
                  })
                }
                highlightedEventId={highlightedEventId}
              />
            ) : (
              <BookingsTable
                events={events}
                onSelectEvent={(ev) =>
                  setModalState({
                    open: true,
                    mode: 'edit',
                    date: ev.date,
                    startTime: ev.startTime,
                    event: ev,
                  })
                }
                onCreateNew={() =>
                  setModalState({
                    open: true,
                    mode: 'create',
                    date: anchorDate,
                    startTime: '10:00',
                    event: null,
                  })
                }
              />
            )}
          </section>

          <div className="w-full lg:w-[390px] xl:w-[420px] shrink-0 min-h-[480px] lg:min-h-0">
            <VoiceAssistantPanel
              voicePersona={voicePersona}
              onChangeVoicePersona={setVoicePersona}
              onCalendarUpdated={setEvents}
              onIntentLogged={handleIntentLogged}
              intents={intents}
            />
          </div>
        </main>
      </div>

      {modalState.open && (
        <BlockModal
          mode={modalState.mode}
          initialDate={modalState.date}
          initialStartTime={modalState.startTime}
          event={modalState.event}
          onClose={() => setModalState((s) => ({ ...s, open: false }))}
          onSaved={setEvents}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          workingHours={workingHours}
          onClose={() => setSettingsOpen(false)}
          onSaved={setWorkingHours}
        />
      )}
    </div>
  );
}
