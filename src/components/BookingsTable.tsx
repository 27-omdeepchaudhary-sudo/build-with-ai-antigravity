import { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import {
  CATEGORY_META,
  downloadEventIcs,
  formatLongDate,
  formatTimeRange,
} from '../lib/calendarUtils';
import type { CalendarBlock, EventCategory } from '../shared/types';

interface BookingsTableProps {
  events: CalendarBlock[];
  onSelectEvent: (event: CalendarBlock) => void;
  onCreateNew: () => void;
}

export function BookingsTable({
  events,
  onSelectEvent,
  onCreateNew,
}: BookingsTableProps) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | EventCategory>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'voice_ai' | 'manual'>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((ev) => {
      if (categoryFilter !== 'all' && ev.category !== categoryFilter) return false;
      if (sourceFilter !== 'all' && ev.source !== sourceFilter) return false;
      if (!q) return true;
      return (
        ev.title.toLowerCase().includes(q) ||
        ev.clientName.toLowerCase().includes(q) ||
        (ev.notes?.toLowerCase().includes(q) ?? false) ||
        ev.date.includes(q)
      );
    });
  }, [events, search, categoryFilter, sourceFilter]);

  return (
    <div className="flex flex-col h-full bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[#E2E8F0]">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client, title, or date..."
            className="w-full pl-9 pr-3 py-1.5 text-sm bg-[#F8FAFC] border border-[#E2E8F0] rounded-md text-[#0F172A] placeholder:text-[#64748B] focus:outline-none focus:border-[#2563EB]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center p-0.5 bg-[#F1F5F9] rounded-md border border-[#E2E8F0]">
            {(['all', 'voice_ai', 'manual'] as const).map((src) => (
              <button
                key={src}
                type="button"
                onClick={() => setSourceFilter(src)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  sourceFilter === src
                    ? 'bg-white text-[#0F172A] shadow-xs'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                {src === 'all' ? 'All Sources' : src === 'voice_ai' ? 'Voice AI' : 'Manual'}
              </button>
            ))}
          </div>

          <select
            value={categoryFilter}
            onChange={(e) =>
              setCategoryFilter(e.target.value as 'all' | EventCategory)
            }
            aria-label="Filter by category"
            className="px-2.5 py-1.5 text-xs font-medium bg-white border border-[#E2E8F0] rounded-md text-[#334155] focus:outline-none focus:border-[#2563EB] cursor-pointer"
          >
            <option value="all">All Categories</option>
            <option value="client_call">Client Call</option>
            <option value="consultation">Consultation</option>
            <option value="deep_work">Deep Work</option>
            <option value="personal_hold">Hold</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 px-6 text-center">
            <p className="text-sm font-medium text-[#0F172A]">
              No matching calendar blocks
            </p>
            <p className="mt-1 text-xs text-[#64748B] max-w-sm">
              Adjust your search filters, speak a client request into the Voice Assistant, or create a manual block.
            </p>
            <button
              type="button"
              onClick={onCreateNew}
              className="mt-4 px-4 py-2 text-xs font-medium rounded-md bg-[#2563EB] text-white hover:bg-[#1D4ED8] transition-colors cursor-pointer"
            >
              Block Time Manually
            </button>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] sticky top-0">
              <tr className="text-[11px] font-semibold text-[#64748B]">
                <th className="py-2.5 px-4">Date &amp; Time</th>
                <th className="py-2.5 px-4">Session &amp; Client</th>
                <th className="py-2.5 px-4">Category</th>
                <th className="py-2.5 px-4">Origin</th>
                <th className="py-2.5 px-4 text-right">Duration</th>
                <th className="py-2.5 px-4 text-right">Export</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {filtered.map((ev) => {
                const meta = CATEGORY_META[ev.category];
                return (
                  <tr
                    key={ev.id}
                    onClick={() => onSelectEvent(ev)}
                    className="hover:bg-[#F8FAFC] transition-colors cursor-pointer"
                  >
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <div className="text-xs font-medium text-[#0F172A]">
                        {formatLongDate(ev.date)}
                      </div>
                      <div className="font-mono text-xs text-[#64748B] tabular-nums">
                        {formatTimeRange(ev.startTime, ev.durationMinutes)}
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="text-sm font-medium text-[#0F172A]">
                        {ev.title}
                      </div>
                      <div className="text-xs text-[#64748B]">
                        {ev.clientName}
                        {ev.clientEmail ? ` · ${ev.clientEmail}` : ''}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-xs text-[#334155] whitespace-nowrap">
                      {meta.label}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-[#64748B] whitespace-nowrap">
                      {ev.source === 'voice_ai' ? 'Gemini Live' : 'Manual'}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs text-[#0F172A] tabular-nums whitespace-nowrap">
                      {ev.durationMinutes} min
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadEventIcs(ev);
                        }}
                        aria-label={`Download ICS for ${ev.title}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#334155] hover:text-[#0F172A] border border-[#E2E8F0] rounded hover:bg-white transition-colors cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>ICS</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
