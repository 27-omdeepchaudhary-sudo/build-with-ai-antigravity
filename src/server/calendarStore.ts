import fs from 'node:fs';
import path from 'node:path';
import type {
  CalendarBlock,
  EventCategory,
  OpenSlot,
  WorkingHours,
} from '../shared/types.ts';

interface StoreState {
  events: CalendarBlock[];
  workingHours: WorkingHours;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'calendar-store.json');

export function timeToMinutes(hhmm: string): number {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return -1;
  return h * 60 + m;
}

export function minutesToTime(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, totalMinutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatDateOffset(baseDate: Date, daysOffset: number): string {
  const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + daysOffset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function createInitialState(): StoreState {
  const today = new Date();
  const d0 = formatDateOffset(today, 0);
  const d1 = formatDateOffset(today, 1);
  const d2 = formatDateOffset(today, 2);
  const d3 = formatDateOffset(today, 3);

  const nowIso = today.toISOString();

  return {
    workingHours: {
      startHour: 8,
      endHour: 19,
      bufferMinutes: 0,
    },
    events: [
      {
        id: 'blk-101',
        title: 'Q4 Product Roadmap Alignment',
        clientName: 'Elena Rostova · Meridian Labs',
        clientEmail: 'elena@meridianlabs.io',
        date: d0,
        startTime: '09:30',
        durationMinutes: 60,
        category: 'client_call',
        notes: 'Confirm sprint milestones and API rollout timeline.',
        source: 'manual',
        createdAt: nowIso,
      },
      {
        id: 'blk-102',
        title: 'Architecture Intake & Scoping',
        clientName: 'Marcus Vance · Kestrel Capital',
        clientEmail: 'mvance@kestrel.vc',
        date: d0,
        startTime: '14:00',
        durationMinutes: 45,
        category: 'consultation',
        notes: 'Initial discovery call for multi-region cloud setup.',
        source: 'manual',
        createdAt: nowIso,
      },
      {
        id: 'blk-103',
        title: 'Protected Deep Work Block',
        clientName: 'Internal Focus',
        date: d1,
        startTime: '09:00',
        durationMinutes: 120,
        category: 'deep_work',
        notes: 'No client bookings during morning engineering block.',
        source: 'manual',
        createdAt: nowIso,
      },
      {
        id: 'blk-104',
        title: 'Onboarding Kickoff',
        clientName: 'Priya Nair · Solis Health',
        clientEmail: 'priya@solishealth.org',
        date: d1,
        startTime: '13:30',
        durationMinutes: 60,
        category: 'client_call',
        notes: 'Stakeholder walkthrough and access provisioning.',
        source: 'manual',
        createdAt: nowIso,
      },
      {
        id: 'blk-105',
        title: 'Contract Renewal Review',
        clientName: 'David Park · Northstar Freight',
        clientEmail: 'dpark@northstarfreight.com',
        date: d2,
        startTime: '11:00',
        durationMinutes: 30,
        category: 'consultation',
        notes: 'Annual SLA terms and seat expansion.',
        source: 'manual',
        createdAt: nowIso,
      },
      {
        id: 'blk-106',
        title: 'Design Critique & Prototype Sign-Off',
        clientName: 'Claire Moreau · Atelier Verve',
        clientEmail: 'claire@atelierverve.co',
        date: d3,
        startTime: '15:00',
        durationMinutes: 60,
        category: 'client_call',
        notes: 'Review final checkout flows.',
        source: 'manual',
        createdAt: nowIso,
      },
    ],
  };
}

class CalendarStore {
  private state: StoreState;

  constructor() {
    this.state = this.loadState();
  }

  private loadState(): StoreState {
    try {
      if (fs.existsSync(STORE_PATH)) {
        const raw = fs.readFileSync(STORE_PATH, 'utf-8');
        const parsed = JSON.parse(raw) as StoreState;
        if (Array.isArray(parsed.events) && parsed.workingHours) {
          return parsed;
        }
      }
    } catch {
      // Fall back to seeded state if file is unreadable
    }
    const initial = createInitialState();
    this.saveState(initial);
    return initial;
  }

  private saveState(nextState: StoreState) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(STORE_PATH, JSON.stringify(nextState, null, 2), 'utf-8');
    } catch {
      // Ignore write failures in read-only environments
    }
  }

  private sortEvents(events: CalendarBlock[]): CalendarBlock[] {
    return [...events].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
    });
  }

  getAllEvents(filters?: { from?: string; to?: string; query?: string }): CalendarBlock[] {
    let list = this.sortEvents(this.state.events);
    if (filters?.from) {
      list = list.filter((e) => e.date >= filters.from!);
    }
    if (filters?.to) {
      list = list.filter((e) => e.date <= filters.to!);
    }
    if (filters?.query) {
      const q = filters.query.toLowerCase();
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.clientName.toLowerCase().includes(q) ||
          (e.notes?.toLowerCase().includes(q) ?? false)
      );
    }
    return list;
  }

  getWorkingHours(): WorkingHours {
    return { ...this.state.workingHours };
  }

  updateWorkingHours(patch: Partial<WorkingHours>): WorkingHours {
    this.state.workingHours = {
      startHour:
        typeof patch.startHour === 'number'
          ? Math.max(0, Math.min(22, patch.startHour))
          : this.state.workingHours.startHour,
      endHour:
        typeof patch.endHour === 'number'
          ? Math.max(1, Math.min(24, patch.endHour))
          : this.state.workingHours.endHour,
      bufferMinutes:
        typeof patch.bufferMinutes === 'number'
          ? Math.max(0, Math.min(60, patch.bufferMinutes))
          : this.state.workingHours.bufferMinutes,
    };
    this.saveState(this.state);
    return this.getWorkingHours();
  }

  findConflicts(
    date: string,
    startTime: string,
    durationMinutes: number,
    excludeId?: string
  ): CalendarBlock[] {
    const startMin = timeToMinutes(startTime);
    if (startMin < 0) return [];
    const endMin = startMin + durationMinutes;
    const buffer = this.state.workingHours.bufferMinutes;

    return this.state.events.filter((ev) => {
      if (ev.date !== date) return false;
      if (excludeId && ev.id === excludeId) return false;
      const evStart = timeToMinutes(ev.startTime) - buffer;
      const evEnd = timeToMinutes(ev.startTime) + ev.durationMinutes + buffer;
      return startMin < evEnd && evStart < endMin;
    });
  }

  getOpenSlots(date: string, minDurationMinutes = 30): OpenSlot[] {
    const { startHour, endHour, bufferMinutes } = this.state.workingHours;
    const dayStart = startHour * 60;
    const dayEnd = endHour * 60;

    const dayEvents = this.sortEvents(
      this.state.events.filter((e) => e.date === date)
    );

    const busyIntervals = dayEvents.map((e) => ({
      start: Math.max(dayStart, timeToMinutes(e.startTime) - bufferMinutes),
      end: Math.min(
        dayEnd,
        timeToMinutes(e.startTime) + e.durationMinutes + bufferMinutes
      ),
    }));

    const open: OpenSlot[] = [];
    let cursor = dayStart;

    for (const interval of busyIntervals) {
      if (interval.start > cursor) {
        const gap = interval.start - cursor;
        if (gap >= minDurationMinutes) {
          open.push({
            startTime: minutesToTime(cursor),
            endTime: minutesToTime(interval.start),
            durationMinutes: gap,
          });
        }
      }
      cursor = Math.max(cursor, interval.end);
    }

    if (dayEnd > cursor) {
      const gap = dayEnd - cursor;
      if (gap >= minDurationMinutes) {
        open.push({
          startTime: minutesToTime(cursor),
          endTime: minutesToTime(dayEnd),
          durationMinutes: gap,
        });
      }
    }

    return open;
  }

  checkAvailability(date: string, durationMinutes = 30) {
    const dayEvents = this.getAllEvents({ from: date, to: date });
    const openSlots = this.getOpenSlots(date, durationMinutes);
    return {
      date,
      workingHours: this.getWorkingHours(),
      bookedBlocks: dayEvents.map((e) => ({
        id: e.id,
        title: e.title,
        clientName: e.clientName,
        startTime: e.startTime,
        endTime: minutesToTime(timeToMinutes(e.startTime) + e.durationMinutes),
        durationMinutes: e.durationMinutes,
        category: e.category,
      })),
      openSlots,
    };
  }

  createBlock(input: {
    title: string;
    clientName: string;
    clientEmail?: string;
    date: string;
    startTime: string;
    durationMinutes: number;
    category?: EventCategory;
    notes?: string;
    source?: 'voice_ai' | 'manual';
  }):
    | { ok: true; event: CalendarBlock }
    | {
        ok: false;
        conflict: true;
        conflictingEvents: CalendarBlock[];
        suggestedOpenSlots: OpenSlot[];
      }
    | { ok: false; conflict: false; error: string } {
    const startMin = timeToMinutes(input.startTime);
    if (startMin < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
      return {
        ok: false,
        conflict: false,
        error: 'Invalid date (expected YYYY-MM-DD) or startTime (expected HH:MM).',
      };
    }

    const duration = Math.max(15, Math.min(480, Math.round(input.durationMinutes || 30)));
    const conflicts = this.findConflicts(input.date, input.startTime, duration);
    if (conflicts.length > 0) {
      return {
        ok: false,
        conflict: true,
        conflictingEvents: conflicts,
        suggestedOpenSlots: this.getOpenSlots(input.date, duration),
      };
    }

    const newEvent: CalendarBlock = {
      id: `blk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      title: input.title.trim() || 'Client Session',
      clientName: input.clientName.trim() || 'Client',
      clientEmail: input.clientEmail?.trim() || undefined,
      date: input.date,
      startTime: minutesToTime(startMin),
      durationMinutes: duration,
      category: input.category || 'client_call',
      notes: input.notes?.trim() || undefined,
      source: input.source || 'manual',
      createdAt: new Date().toISOString(),
    };

    this.state.events = this.sortEvents([...this.state.events, newEvent]);
    this.saveState(this.state);
    return { ok: true, event: newEvent };
  }

  findEvent(eventId?: string, query?: string): CalendarBlock | undefined {
    if (eventId) {
      const byId = this.state.events.find((e) => e.id === eventId);
      if (byId) return byId;
    }
    if (query) {
      const q = query.toLowerCase();
      return this.state.events.find(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.clientName.toLowerCase().includes(q)
      );
    }
    return undefined;
  }

  updateBlock(
    eventId: string,
    patch: Partial<{
      title: string;
      clientName: string;
      clientEmail: string;
      date: string;
      startTime: string;
      durationMinutes: number;
      category: EventCategory;
      notes: string;
    }>
  ):
    | { ok: true; event: CalendarBlock }
    | {
        ok: false;
        conflict?: true;
        conflictingEvents?: CalendarBlock[];
        suggestedOpenSlots?: OpenSlot[];
        error?: string;
      } {
    const existing = this.state.events.find((e) => e.id === eventId);
    if (!existing) {
      return { ok: false, error: 'Calendar block not found.' };
    }

    const nextDate = patch.date ?? existing.date;
    const nextStartTime = patch.startTime ?? existing.startTime;
    const nextDuration =
      typeof patch.durationMinutes === 'number'
        ? Math.max(15, Math.min(480, Math.round(patch.durationMinutes)))
        : existing.durationMinutes;

    const startMin = timeToMinutes(nextStartTime);
    if (startMin < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) {
      return { ok: false, error: 'Invalid date or startTime format.' };
    }

    const conflicts = this.findConflicts(
      nextDate,
      minutesToTime(startMin),
      nextDuration,
      eventId
    );
    if (conflicts.length > 0) {
      return {
        ok: false,
        conflict: true,
        conflictingEvents: conflicts,
        suggestedOpenSlots: this.getOpenSlots(nextDate, nextDuration),
      };
    }

    const updated: CalendarBlock = {
      ...existing,
      title: patch.title !== undefined ? patch.title.trim() : existing.title,
      clientName:
        patch.clientName !== undefined ? patch.clientName.trim() : existing.clientName,
      clientEmail:
        patch.clientEmail !== undefined
          ? patch.clientEmail.trim() || undefined
          : existing.clientEmail,
      date: nextDate,
      startTime: minutesToTime(startMin),
      durationMinutes: nextDuration,
      category: patch.category ?? existing.category,
      notes: patch.notes !== undefined ? patch.notes.trim() || undefined : existing.notes,
    };

    this.state.events = this.sortEvents(
      this.state.events.map((e) => (e.id === eventId ? updated : e))
    );
    this.saveState(this.state);
    return { ok: true, event: updated };
  }

  deleteBlock(eventId: string): CalendarBlock | null {
    const existing = this.state.events.find((e) => e.id === eventId);
    if (!existing) return null;
    this.state.events = this.state.events.filter((e) => e.id !== eventId);
    this.saveState(this.state);
    return existing;
  }
}

export const calendarStore = new CalendarStore();
