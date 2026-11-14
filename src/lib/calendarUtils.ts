import type { CalendarBlock, EventCategory } from '../shared/types';

export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(iso: string, delta: number): string {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() + delta);
  return toIsoDate(d);
}

export function getRangeDates(startIso: string, count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(addDays(startIso, i));
  }
  return out;
}

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesToHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatTimeRange(startTime: string, durationMinutes: number): string {
  const startMin = hhmmToMinutes(startTime);
  const endMin = startMin + durationMinutes;
  return `${startTime} – ${minutesToHHMM(endMin)}`;
}

export function formatShortDay(iso: string): { weekday: string; dayNum: string; month: string } {
  const d = parseIsoDate(iso);
  return {
    weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
    dayNum: String(d.getDate()),
    month: d.toLocaleDateString('en-US', { month: 'short' }),
  };
}

export function formatLongDate(iso: string): string {
  const d = parseIsoDate(iso);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export const CATEGORY_META: Record<
  EventCategory,
  { label: string; bg: string; border: string; text: string }
> = {
  client_call: {
    label: 'Client Call',
    bg: 'bg-[#EFF6FF]',
    border: 'border-[#BFDBFE]',
    text: 'text-[#1E40AF]',
  },
  consultation: {
    label: 'Consultation',
    bg: 'bg-[#ECFDF5]',
    border: 'border-[#A7F3D0]',
    text: 'text-[#065F46]',
  },
  deep_work: {
    label: 'Deep Work',
    bg: 'bg-[#F1F5F9]',
    border: 'border-[#CBD5E1]',
    text: 'text-[#334155]',
  },
  personal_hold: {
    label: 'Hold',
    bg: 'bg-[#FFFBEB]',
    border: 'border-[#FDE68A]',
    text: 'text-[#92400E]',
  },
};

function toIcsTimestamp(dateIso: string, hhmm: string): string {
  return `${dateIso.replace(/-/g, '')}T${hhmm.replace(':', '')}00`;
}

function escapeIcsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function downloadEventIcs(event: CalendarBlock) {
  const startMin = hhmmToMinutes(event.startTime);
  const endHHMM = minutesToHHMM(startMin + event.durationMinutes);
  const dtStart = toIcsTimestamp(event.date, event.startTime);
  const dtEnd = toIcsTimestamp(event.date, endHHMM);
  const dtStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const descriptionParts = [
    `Client: ${event.clientName}`,
    event.clientEmail ? `Email: ${event.clientEmail}` : '',
    event.notes ? `Notes: ${event.notes}` : '',
    `Booked via: ${event.source === 'voice_ai' ? 'Cadence Voice AI' : 'Manual Entry'}`,
  ].filter(Boolean);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cadence//Voice Calendar Assistant//EN',
    'BEGIN:VEVENT',
    `UID:${event.id}@cadence.local`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(`${event.title} — ${event.clientName}`)}`,
    `DESCRIPTION:${escapeIcsText(descriptionParts.join('\n'))}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${event.date}-${event.id}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
