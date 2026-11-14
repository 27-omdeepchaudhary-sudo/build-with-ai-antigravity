import http from 'node:http';
import path from 'node:path';
import { URL } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';
import {
  GoogleGenAI,
  Modality,
  Type,
  type FunctionDeclaration,
  type LiveServerMessage,
} from '@google/genai';
import { calendarStore, formatDateOffset } from './src/server/calendarStore.ts';
import type { EventCategory, ParsedIntentLog, VoicePersona } from './src/shared/types.ts';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const VALID_VOICES: VoicePersona[] = ['Zephyr', 'Kore', 'Puck', 'Charon', 'Fenrir'];

function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      apiVersion: 'v1beta',
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const calendarTools: FunctionDeclaration[] = [
  {
    name: 'checkAvailability',
    description:
      'Checks busy calendar blocks and open time slots for a specific date within working hours.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        date: {
          type: Type.STRING,
          description: 'Target date in YYYY-MM-DD format.',
        },
        durationMinutes: {
          type: Type.NUMBER,
          description: 'Desired meeting duration in minutes (default 30).',
        },
      },
      required: ['date'],
    },
  },
  {
    name: 'listCalendarBlocks',
    description:
      'Lists scheduled calendar blocks and client appointments optionally filtered by date range or client/title search.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        fromDate: {
          type: Type.STRING,
          description: 'Optional start date filter (YYYY-MM-DD).',
        },
        toDate: {
          type: Type.STRING,
          description: 'Optional end date filter (YYYY-MM-DD).',
        },
        clientQuery: {
          type: Type.STRING,
          description: 'Optional client name or meeting title search string.',
        },
      },
    },
  },
  {
    name: 'blockCalendarSlot',
    description:
      'Books and blocks a time slot on the calendar for a client or internal focus session. Automatically checks for scheduling conflicts.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: {
          type: Type.STRING,
          description: 'Clear event title, e.g. "Architecture Review" or "Client Onboarding".',
        },
        clientName: {
          type: Type.STRING,
          description: 'Name of the client or user requesting the block.',
        },
        clientEmail: {
          type: Type.STRING,
          description: 'Optional client email address if mentioned.',
        },
        date: {
          type: Type.STRING,
          description: 'Date for the block in YYYY-MM-DD format.',
        },
        startTime: {
          type: Type.STRING,
          description: 'Start time in 24-hour HH:MM format (e.g. "14:30").',
        },
        durationMinutes: {
          type: Type.NUMBER,
          description: 'Duration in minutes (e.g. 30, 45, 60, 90). Defaults to 30 if unspecified.',
        },
        category: {
          type: Type.STRING,
          description:
            'One of: client_call, consultation, deep_work, personal_hold.',
        },
        notes: {
          type: Type.STRING,
          description: 'Optional agenda or context notes parsed from the request.',
        },
      },
      required: ['title', 'clientName', 'date', 'startTime', 'durationMinutes'],
    },
  },
  {
    name: 'rescheduleCalendarBlock',
    description:
      'Moves an existing calendar block to a new date, start time, or duration after checking for conflicts.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        eventId: {
          type: Type.STRING,
          description: 'Exact ID of the calendar block if known.',
        },
        searchQuery: {
          type: Type.STRING,
          description: 'Client name or event title to locate the existing block.',
        },
        newDate: {
          type: Type.STRING,
          description: 'New date in YYYY-MM-DD format.',
        },
        newStartTime: {
          type: Type.STRING,
          description: 'New start time in 24-hour HH:MM format.',
        },
        newDurationMinutes: {
          type: Type.NUMBER,
          description: 'Optional updated duration in minutes.',
        },
      },
    },
  },
  {
    name: 'cancelCalendarBlock',
    description:
      'Cancels and removes an existing calendar block. Only call after the user clearly confirms which meeting to cancel.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        eventId: {
          type: Type.STRING,
          description: 'Exact ID of the calendar block if known.',
        },
        searchQuery: {
          type: Type.STRING,
          description: 'Client name or event title to locate the block to cancel.',
        },
      },
    },
  },
];

function buildSystemInstruction(timezone: string): string {
  const now = new Date();
  const todayStr = formatDateOffset(now, 0);
  const tomorrowStr = formatDateOffset(now, 1);
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone || 'UTC' });
  const workingHours = calendarStore.getWorkingHours();

  return [
    'You are Cadence, a concise, executive voice AI calendar assistant.',
    'Your purpose is to parse spoken or typed client scheduling intents, check real-time availability, detect conflicts, and block, reschedule, or cancel calendar slots.',
    `Current reference date: ${todayStr} (${weekday}). Tomorrow is ${tomorrowStr}. User timezone: ${timezone || 'local'}.`,
    `Configured working hours: ${String(workingHours.startHour).padStart(2, '0')}:00 to ${String(workingHours.endHour).padStart(2, '0')}:00 with ${workingHours.bufferMinutes}m buffer.`,
    '',
    'Operating rules:',
    '1. Always convert relative dates ("today", "tomorrow", "next Monday") into exact YYYY-MM-DD dates using the current reference date above.',
    '2. When a user or client asks to book or block time, call blockCalendarSlot (or checkAvailability first if they are asking when you are free).',
    '3. If blockCalendarSlot reports a conflict, do NOT double-book. Clearly tell the user what conflicts and offer the returned suggestedOpenSlots.',
    '4. If critical details like the date or time are missing, ask one crisp clarifying question instead of guessing.',
    '5. Keep spoken responses brief, natural, and conversational (1–3 sentences). Confirm the exact client name, date, start time, and duration once blocked.',
    '6. Before calling cancelCalendarBlock, verify the exact meeting with the user unless they explicitly named it with an unmistakable command to remove it.',
  ].join('\n');
}

function executeCalendarTool(
  name: string,
  args: Record<string, unknown>
): { toolResponse: Record<string, unknown>; intentLog: ParsedIntentLog; mutated: boolean } {
  const logId = `int-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const timestamp = new Date().toISOString();

  if (name === 'checkAvailability') {
    const date = String(args.date || formatDateOffset(new Date(), 0));
    const duration = Number(args.durationMinutes || 30);
    const result = calendarStore.checkAvailability(date, duration);
    return {
      toolResponse: result,
      mutated: false,
      intentLog: {
        id: logId,
        timestamp,
        toolName: 'checkAvailability',
        args,
        status: 'success',
        summary: `Checked ${date} (${result.openSlots.length} open window${result.openSlots.length === 1 ? '' : 's'} for ${duration}m)`,
      },
    };
  }

  if (name === 'listCalendarBlocks') {
    const events = calendarStore.getAllEvents({
      from: args.fromDate ? String(args.fromDate) : undefined,
      to: args.toDate ? String(args.toDate) : undefined,
      query: args.clientQuery ? String(args.clientQuery) : undefined,
    });
    return {
      toolResponse: { count: events.length, events },
      mutated: false,
      intentLog: {
        id: logId,
        timestamp,
        toolName: 'listCalendarBlocks',
        args,
        status: 'success',
        summary: `Retrieved ${events.length} scheduled block${events.length === 1 ? '' : 's'}`,
      },
    };
  }

  if (name === 'blockCalendarSlot') {
    const rawCat = String(args.category || 'client_call');
    const validCategories: EventCategory[] = [
      'client_call',
      'consultation',
      'deep_work',
      'personal_hold',
    ];
    const category: EventCategory = validCategories.includes(rawCat as EventCategory)
      ? (rawCat as EventCategory)
      : 'client_call';

    const res = calendarStore.createBlock({
      title: String(args.title || 'Client Booking'),
      clientName: String(args.clientName || 'Client'),
      clientEmail: args.clientEmail ? String(args.clientEmail) : undefined,
      date: String(args.date || ''),
      startTime: String(args.startTime || ''),
      durationMinutes: Number(args.durationMinutes || 30),
      category,
      notes: args.notes ? String(args.notes) : undefined,
      source: 'voice_ai',
    });

    if (res.ok) {
      return {
        toolResponse: { status: 'booked', event: res.event },
        mutated: true,
        intentLog: {
          id: logId,
          timestamp,
          toolName: 'blockCalendarSlot',
          args,
          status: 'success',
          affectedEventId: res.event.id,
          summary: `Blocked ${res.event.date} at ${res.event.startTime} (${res.event.durationMinutes}m) for ${res.event.clientName}`,
        },
      };
    }

    if (res.conflict) {
      return {
        toolResponse: {
          status: 'conflict',
          conflictingEvents: res.conflictingEvents,
          suggestedOpenSlots: res.suggestedOpenSlots,
        },
        mutated: false,
        intentLog: {
          id: logId,
          timestamp,
          toolName: 'blockCalendarSlot',
          args,
          status: 'conflict',
          summary: `Conflict at ${String(args.date)} ${String(args.startTime)} with "${res.conflictingEvents[0]?.title}"`,
        },
      };
    }

    return {
      toolResponse: { status: 'error', error: res.error },
      mutated: false,
      intentLog: {
        id: logId,
        timestamp,
        toolName: 'blockCalendarSlot',
        args,
        status: 'error',
        summary: res.error,
      },
    };
  }

  if (name === 'rescheduleCalendarBlock') {
    const target = calendarStore.findEvent(
      args.eventId ? String(args.eventId) : undefined,
      args.searchQuery ? String(args.searchQuery) : undefined
    );
    if (!target) {
      return {
        toolResponse: { status: 'not_found', message: 'No matching calendar block found.' },
        mutated: false,
        intentLog: {
          id: logId,
          timestamp,
          toolName: 'rescheduleCalendarBlock',
          args,
          status: 'not_found',
          summary: `Could not locate block matching "${String(args.searchQuery || args.eventId || '')}"`,
        },
      };
    }

    const res = calendarStore.updateBlock(target.id, {
      date: args.newDate ? String(args.newDate) : undefined,
      startTime: args.newStartTime ? String(args.newStartTime) : undefined,
      durationMinutes:
        args.newDurationMinutes !== undefined ? Number(args.newDurationMinutes) : undefined,
    });

    if (res.ok) {
      return {
        toolResponse: { status: 'rescheduled', event: res.event },
        mutated: true,
        intentLog: {
          id: logId,
          timestamp,
          toolName: 'rescheduleCalendarBlock',
          args,
          status: 'success',
          affectedEventId: res.event.id,
          summary: `Moved "${res.event.title}" to ${res.event.date} at ${res.event.startTime}`,
        },
      };
    }

    if (res.conflict) {
      return {
        toolResponse: {
          status: 'conflict',
          conflictingEvents: res.conflictingEvents,
          suggestedOpenSlots: res.suggestedOpenSlots,
        },
        mutated: false,
        intentLog: {
          id: logId,
          timestamp,
          toolName: 'rescheduleCalendarBlock',
          args,
          status: 'conflict',
          summary: `Target slot conflicts with "${res.conflictingEvents?.[0]?.title}"`,
        },
      };
    }

    return {
      toolResponse: { status: 'error', error: res.error },
      mutated: false,
      intentLog: {
        id: logId,
        timestamp,
        toolName: 'rescheduleCalendarBlock',
        args,
        status: 'error',
        summary: res.error || 'Failed to reschedule block',
      },
    };
  }

  if (name === 'cancelCalendarBlock') {
    const target = calendarStore.findEvent(
      args.eventId ? String(args.eventId) : undefined,
      args.searchQuery ? String(args.searchQuery) : undefined
    );
    if (!target) {
      return {
        toolResponse: { status: 'not_found', message: 'No matching calendar block found.' },
        mutated: false,
        intentLog: {
          id: logId,
          timestamp,
          toolName: 'cancelCalendarBlock',
          args,
          status: 'not_found',
          summary: `No block found for "${String(args.searchQuery || args.eventId || '')}"`,
        },
      };
    }

    const removed = calendarStore.deleteBlock(target.id);
    if (removed) {
      return {
        toolResponse: { status: 'cancelled', removedEvent: removed },
        mutated: true,
        intentLog: {
          id: logId,
          timestamp,
          toolName: 'cancelCalendarBlock',
          args,
          status: 'success',
          affectedEventId: removed.id,
          summary: `Cancelled "${removed.title}" (${removed.date} at ${removed.startTime})`,
        },
      };
    }
  }

  return {
    toolResponse: { status: 'error', message: `Unsupported tool: ${name}` },
    mutated: false,
    intentLog: {
      id: logId,
      timestamp,
      toolName: 'listCalendarBlocks',
      args,
      status: 'error',
      summary: `Unknown tool ${name}`,
    },
  };
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, geminiConfigured: Boolean(process.env.GEMINI_API_KEY) });
  });

  app.get('/api/events', (req, res) => {
    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;
    const query = typeof req.query.q === 'string' ? req.query.q : undefined;
    res.json({ events: calendarStore.getAllEvents({ from, to, query }) });
  });

  app.post('/api/events', (req, res) => {
    const result = calendarStore.createBlock({
      ...req.body,
      source: 'manual',
    });
    if (result.ok) {
      res.status(201).json({ event: result.event, events: calendarStore.getAllEvents() });
      return;
    }
    if (result.conflict) {
      res.status(409).json({
        error: 'Time slot conflicts with an existing block.',
        conflictingEvents: result.conflictingEvents,
        suggestedOpenSlots: result.suggestedOpenSlots,
      });
      return;
    }
    res.status(400).json({ error: result.error });
  });

  app.patch('/api/events/:id', (req, res) => {
    const result = calendarStore.updateBlock(req.params.id, req.body);
    if (result.ok) {
      res.json({ event: result.event, events: calendarStore.getAllEvents() });
      return;
    }
    if (result.conflict) {
      res.status(409).json({
        error: 'Updated time slot conflicts with an existing block.',
        conflictingEvents: result.conflictingEvents,
        suggestedOpenSlots: result.suggestedOpenSlots,
      });
      return;
    }
    res.status(400).json({ error: result.error || 'Unable to update block.' });
  });

  app.delete('/api/events/:id', (req, res) => {
    const removed = calendarStore.deleteBlock(req.params.id);
    if (!removed) {
      res.status(404).json({ error: 'Calendar block not found.' });
      return;
    }
    res.json({ removed, events: calendarStore.getAllEvents() });
  });

  app.get('/api/availability', (req, res) => {
    const date =
      typeof req.query.date === 'string'
        ? req.query.date
        : formatDateOffset(new Date(), 0);
    const duration = Number(req.query.duration || 30);
    res.json(calendarStore.checkAvailability(date, duration));
  });

  app.get('/api/settings', (_req, res) => {
    res.json({ workingHours: calendarStore.getWorkingHours() });
  });

  app.put('/api/settings', (req, res) => {
    const updated = calendarStore.updateWorkingHours(req.body);
    res.json({ workingHours: updated });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/api/live' });

  wss.on('connection', (clientWs: WebSocket, req) => {
    const reqUrl = new URL(req.url || '/api/live', `http://${req.headers.host || 'localhost'}`);
    const requestedVoice = reqUrl.searchParams.get('voice') as VoicePersona | null;
    const voiceName: VoicePersona =
      requestedVoice && VALID_VOICES.includes(requestedVoice) ? requestedVoice : 'Zephyr';
    const timezone = reqUrl.searchParams.get('tz') || 'UTC';

    const sendToClient = (payload: Record<string, unknown>) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    let ai: GoogleGenAI;
    try {
      ai = getGenAIClient();
    } catch (err) {
      sendToClient({
        type: 'error',
        message: err instanceof Error ? err.message : 'Missing GEMINI_API_KEY.',
      });
      clientWs.close();
      return;
    }

    let isClosed = false;
    const sessionPromise = ai.live.connect({
      model: 'gemini-3.8-live',
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        tools: [{ functionDeclarations: calendarTools }],
        systemInstruction: buildSystemInstruction(timezone),
      },
      callbacks: {
        onopen: () => {
          // Wait for setupComplete via sessionPromise before marking ready
        },
        onmessage: (message: LiveServerMessage) => {
          const content = message.serverContent;

          if (content?.inputTranscription?.text) {
            sendToClient({
              type: 'inputTranscript',
              text: content.inputTranscription.text,
            });
          }

          if (content?.outputTranscription?.text) {
            sendToClient({
              type: 'outputTranscript',
              text: content.outputTranscription.text,
            });
          }

          for (const part of content?.modelTurn?.parts ?? []) {
            if (part.inlineData?.data) {
              sendToClient({
                type: 'audio',
                data: part.inlineData.data,
              });
            }
          }

          if (content?.interrupted) {
            sendToClient({ type: 'interrupted' });
          }

          if (content?.turnComplete) {
            sendToClient({ type: 'turnComplete' });
          }

          const functionCalls = message.toolCall?.functionCalls;
          if (functionCalls && functionCalls.length > 0) {
            const functionResponses = functionCalls.map((call) => {
              const args = (call.args ?? {}) as Record<string, unknown>;
              const { toolResponse, intentLog, mutated } = executeCalendarTool(
                call.name || '',
                args
              );

              sendToClient({ type: 'intentParsed', intent: intentLog });
              if (mutated) {
                sendToClient({
                  type: 'calendarUpdated',
                  events: calendarStore.getAllEvents(),
                });
              }

              return {
                id: call.id,
                name: call.name,
                response: toolResponse,
              };
            });

            sessionPromise
              .then((session) => {
                if (!isClosed) {
                  session.sendToolResponse({ functionResponses });
                }
              })
              .catch((err) => {
                sendToClient({
                  type: 'error',
                  message:
                    err instanceof Error
                      ? err.message
                      : 'Failed to return tool response to Gemini Live.',
                });
              });
          }
        },
        onerror: (err) => {
          const msg =
            err instanceof Error
              ? err.message
              : typeof (err as { message?: unknown })?.message === 'string'
              ? (err as { message: string }).message
              : 'Gemini Live session encountered an error.';
          console.error('Gemini Live onerror:', msg);
          sendToClient({
            type: 'error',
            message: msg,
          });
        },
        onclose: (ev) => {
          console.log('Gemini Live onclose:', ev?.code, ev?.reason);
          if (!isClosed) {
            sendToClient({
              type: 'closed',
              reason: ev?.reason || undefined,
            });
          }
        },
      },
    });

    sessionPromise
      .then(() => {
        if (!isClosed) {
          sendToClient({ type: 'ready', voiceName });
        }
      })
      .catch((err) => {
        const msg =
          err instanceof Error
            ? err.message
            : 'Unable to connect to Gemini Live API.';
        console.error('Gemini Live connect failed:', msg);
        sendToClient({
          type: 'error',
          message: msg,
        });
        clientWs.close();
      });

    clientWs.on('message', (raw) => {
      let msg: { type?: string; data?: string; text?: string };
      try {
        msg = JSON.parse(raw.toString()) as { type?: string; data?: string; text?: string };
      } catch {
        return;
      }

      sessionPromise
        .then((session) => {
          if (isClosed) return;
          if (msg.type === 'audio' && msg.data) {
            session.sendRealtimeInput({
              audio: {
                data: msg.data,
                mimeType: 'audio/pcm;rate=16000',
              },
            });
          } else if (msg.type === 'text' && msg.text) {
            session.sendRealtimeInput({
              text: msg.text,
            });
          }
        })
        .catch(() => {
          // Handled in sessionPromise.catch above
        });
    });

    clientWs.on('close', () => {
      isClosed = true;
      sessionPromise
        .then((session) => {
          session.close();
        })
        .catch(() => {
          // Ignore close errors
        });
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Cadence server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
