import { useState } from 'react';
import { X } from 'lucide-react';
import type { WorkingHours } from '../shared/types';

interface SettingsModalProps {
  workingHours: WorkingHours;
  onClose: () => void;
  onSaved: (hours: WorkingHours) => void;
}

export function SettingsModal({
  workingHours,
  onClose,
  onSaved,
}: SettingsModalProps) {
  const [startHour, setStartHour] = useState(workingHours.startHour);
  const [endHour, setEndHour] = useState(workingHours.endHour);
  const [bufferMinutes, setBufferMinutes] = useState(workingHours.bufferMinutes);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startHour: Number(startHour),
          endHour: Math.max(Number(startHour) + 1, Number(endHour)),
          bufferMinutes: Number(bufferMinutes),
        }),
      });
      const data = (await res.json()) as { workingHours?: WorkingHours };
      if (data.workingHours) {
        onSaved(data.workingHours);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0F172A]/40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div className="w-full max-w-md bg-white border border-[#E2E8F0] rounded-lg shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#E2E8F0]">
          <h3
            id="settings-modal-title"
            className="text-sm font-semibold text-[#0F172A]"
          >
            Scheduling Hours &amp; Buffer
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1 rounded text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#334155] mb-1">
                Day Starts
              </label>
              <select
                value={startHour}
                onChange={(e) => setStartHour(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-md bg-white text-[#0F172A]"
              >
                {Array.from({ length: 14 }, (_, i) => i + 5).map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#334155] mb-1">
                Day Ends
              </label>
              <select
                value={endHour}
                onChange={(e) => setEndHour(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-md bg-white text-[#0F172A]"
              >
                {Array.from({ length: 14 }, (_, i) => i + 10).map((h) => (
                  <option key={h} value={h} disabled={h <= startHour}>
                    {String(h).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#334155] mb-1">
              Buffer Between Client Blocks
            </label>
            <select
              value={bufferMinutes}
              onChange={(e) => setBufferMinutes(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-md bg-white text-[#0F172A]"
            >
              {[0, 10, 15, 30].map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? 'No buffer (0 min)' : `${m} minutes`}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[#64748B]">
              Gemini Live automatically respects this buffer when checking open slots.
            </p>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#E2E8F0]">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-medium text-[#475569] border border-[#E2E8F0] rounded-md hover:bg-[#F8FAFC] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 text-xs font-medium text-white bg-[#2563EB] rounded-md hover:bg-[#1D4ED8] disabled:opacity-60 cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save Hours'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
