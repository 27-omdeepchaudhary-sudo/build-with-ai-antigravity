export type EventCategory =
  | 'client_call'
  | 'consultation'
  | 'deep_work'
  | 'personal_hold';

export type VoicePersona = 'Zephyr' | 'Kore' | 'Puck' | 'Charon' | 'Fenrir';

export interface CalendarBlock {
  id: string;
  title: string;
  clientName: string;
  clientEmail?: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM (24-hour)
  durationMinutes: number;
  category: EventCategory;
  notes?: string;
  source: 'voice_ai' | 'manual';
  createdAt: string;
}

export interface WorkingHours {
  startHour: number; // e.g. 8
  endHour: number; // e.g. 19
  bufferMinutes: number; // e.g. 0 or 15
}

export interface ParsedIntentLog {
  id: string;
  timestamp: string;
  toolName:
    | 'checkAvailability'
    | 'listCalendarBlocks'
    | 'blockCalendarSlot'
    | 'rescheduleCalendarBlock'
    | 'cancelCalendarBlock';
  args: Record<string, unknown>;
  status: 'success' | 'conflict' | 'not_found' | 'error';
  summary: string;
  affectedEventId?: string;
}

export interface TranscriptEntry {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

export interface OpenSlot {
  startTime: string;
  endTime: string;
  durationMinutes: number;
}
