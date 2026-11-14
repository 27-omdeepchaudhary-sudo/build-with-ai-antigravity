import { useState } from 'react';
import { AlertTriangle, Download, Trash2, X } from 'lucide-react';
import { downloadEventIcs } from '../lib/calendarUtils';
import type { CalendarBlock, EventCategory, OpenSlot } from '../shared/types';

interface BlockModalProps {
  mode: 'create' | 'edit';
  initialDate: string;
  initialStartTime: string;
  event?: CalendarBlock | null;
  onClose: () => void;
  onSaved: (events: CalendarBlock[]) => void;
}

export function BlockModal({
  mode,
  initialDate,
  initialStartTime,
  event,
  onClose,
  onSaved,
}: BlockModalProps) {
  const [title, setTitle] = useState(event?.title || '');
  const [clientName, setClientName] = useState(event?.clientName || '');
  const [clientEmail, setClientEmail] = useState(event?.clientEmail || '');
  const [date, setDate] = useState(event?.date || initialDate);
  const [startTime, setStartTime] = useState(event?.startTime || initialStartTime);
  const [durationMinutes, setDurationMinutes] = useState(
    event?.durationMinutes || 45
  );
  const [category, setCategory] = useState<EventCategory>(
    event?.category || 'client_call'
  );
  const [notes, setNotes] = useState(event?.notes || '');

  const [submitting, setSubmitting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestedSlots, setSuggestedSlots] = useState<OpenSlot[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuggestedSlots([]);

    try {
      const endpoint =
        mode === 'edit' && event ? `/api/events/${event.id}` : '/api/events';
      const method = mode === 'edit' && event ? 'PATCH' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || 'Client Session',
          clientName: clientName.trim() || 'Client',
          clientEmail: clientEmail.trim() || undefined,
          date,
          startTime,
          durationMinutes: Number(durationMinutes),
          category,
          notes: notes.trim() || undefined,
        }),
      });

      const data = (await res.json()) as {
        events?: CalendarBlock[];
        error?: string;
        suggestedOpenSlots?: OpenSlot[];
      };

      if (!res.ok) {
        setError(data.error || 'Could not save calendar block.');
        if (data.suggestedOpenSlots) {
          setSuggestedSlots(data.suggestedOpenSlots);
        }
        return;
      }

      if (data.events) {
        onSaved(data.events);
      }
      onClose();
    } catch {
      setError('Network error while saving calendar block.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!event) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${event.id}`, { method: 'DELETE' });
      const data = (await res.json()) as { events?: CalendarBlock[]; error?: string };
      if (!res.ok) {
        setError(data.error || 'Failed to delete block.');
        return;
      }
      if (data.events) {
        onSaved(data.events);
      }
      onClose();
    } catch {
      setError('Network error while deleting block.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0F172A]/40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="block-modal-title"
    >
      <div className="w-full max-w-lg bg-white border border-[#E2E8F0] rounded-lg shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#E2E8F0]">
          <h3 id="block-modal-title" className="text-sm font-semibold text-[#0F172A]">
            {mode === 'edit' ? 'Edit Calendar Block' : 'Block Calendar Slot'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1 rounded text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-md bg-[#FFFBEB] border border-[#FDE68A] text-xs text-[#92400E] space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#D97706]" />
                <span>{error}</span>
              </div>
              {suggestedSlots.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] font-medium">Open slots:</span>
                  {suggestedSlots.slice(0, 4).map((slot) => (
                    <button
                      key={slot.startTime}
                      type="button"
                      onClick={() => setStartTime(slot.startTime)}
                      className="px-2 py-0.5 font-mono text-[11px] rounded bg-white border border-[#F59E0B]/40 text-[#92400E] hover:bg-[#FEF3C7] cursor-pointer"
                    >
                      {slot.startTime}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#334155] mb-1">
                Session Title
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Architecture Discovery Call"
                className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-md text-[#0F172A] focus:outline-none focus:border-[#2563EB]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#334155] mb-1">
                Client / Participant
              </label>
              <input
                type="text"
                required
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g. Jordan Lee"
                className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-md text-[#0F172A] focus:outline-none focus:border-[#2563EB]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#334155] mb-1">
                Client Email (optional)
              </label>
              <input
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="jordan@company.com"
                className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-md text-[#0F172A] focus:outline-none focus:border-[#2563EB]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#334155] mb-1">
                Date
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-md text-[#0F172A] focus:outline-none focus:border-[#2563EB]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-[#334155] mb-1">
                  Start Time
                </label>
                <input
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-2.5 py-2 text-sm font-mono border border-[#E2E8F0] rounded-md text-[#0F172A] focus:outline-none focus:border-[#2563EB]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#334155] mb-1">
                  Duration
                </label>
                <select
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="w-full px-2 py-2 text-sm font-mono border border-[#E2E8F0] rounded-md text-[#0F172A] bg-white focus:outline-none focus:border-[#2563EB]"
                >
                  {[15, 30, 45, 60, 90, 120].map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#334155] mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as EventCategory)}
                className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-md text-[#0F172A] bg-white focus:outline-none focus:border-[#2563EB]"
              >
                <option value="client_call">Client Call</option>
                <option value="consultation">Consultation</option>
                <option value="deep_work">Deep Work</option>
                <option value="personal_hold">Hold</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#334155] mb-1">
                Notes
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Agenda or client context..."
                className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-md text-[#0F172A] focus:outline-none focus:border-[#2563EB]"
              />
            </div>
          </div>

          {/* Delete Confirmation Bar */}
          {mode === 'edit' && event && confirmingDelete && (
            <div className="p-3 rounded-md bg-[#FEF2F2] border border-[#FECACA] flex items-center justify-between gap-3">
              <span className="text-xs text-[#991B1B] font-medium">
                Remove &ldquo;{event.title}&rdquo; from your schedule?
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="px-2.5 py-1 text-xs font-medium text-[#334155] bg-white border border-[#E2E8F0] rounded hover:bg-[#F8FAFC] cursor-pointer"
                >
                  Keep
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleDelete()}
                  className="px-2.5 py-1 text-xs font-medium text-white bg-[#DC2626] rounded hover:bg-[#B91C1C] cursor-pointer"
                >
                  Confirm Delete
                </button>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[#E2E8F0]">
            <div className="flex items-center gap-2">
              {mode === 'edit' && event && (
                <>
                  <button
                    type="button"
                    onClick={() => downloadEventIcs(event)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#334155] border border-[#E2E8F0] rounded-md hover:bg-[#F8FAFC] transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export .ICS</span>
                  </button>
                  {!confirmingDelete && (
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#DC2626] border border-[#FECACA] rounded-md hover:bg-[#FEF2F2] transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 text-xs font-medium text-[#475569] border border-[#E2E8F0] rounded-md hover:bg-[#F8FAFC] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-1.5 text-xs font-medium text-white bg-[#2563EB] rounded-md hover:bg-[#1D4ED8] disabled:opacity-60 transition-colors cursor-pointer"
              >
                {submitting
                  ? 'Saving...'
                  : mode === 'edit'
                  ? 'Save Changes'
                  : 'Block Slot'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
