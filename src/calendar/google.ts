import { google, type calendar_v3 } from "googleapis";
import { getEnv } from "../config/env.js";
import { timezone } from "../util/datetime.js";

/**
 * Integração com o Google Calendar via Service Account.
 *
 * REGRA DE NEGÓCIO INEGOCIÁVEL: todo evento vai no calendário PESSOAL do dono,
 * cujo ID vem de GOOGLE_CALENDAR_ID. As funções de criação/atualização IGNORAM
 * qualquer calendarId vindo do modelo e usam sempre o do env — é impossível,
 * por construção, cair no calendário da ENGETEC.
 */

let calendarClient: calendar_v3.Calendar | null = null;

function getCalendar(): calendar_v3.Calendar {
  if (calendarClient) return calendarClient;
  const env = getEnv();

  let creds: { client_email: string; private_key: string };
  try {
    creds = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } catch {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON não é um JSON válido. Cole o JSON inteiro da conta de serviço em uma linha.",
    );
  }

  // Usa o JWT embutido no googleapis (evita conflito de versão de tipos).
  const auth = new google.auth.JWT({
    email: creds.client_email,
    // Chaves coladas em .env costumam vir com \n literais; normalizamos.
    key: creds.private_key?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });

  calendarClient = google.calendar({ version: "v3", auth });
  return calendarClient;
}

/** Sempre o calendário PESSOAL do env. Nunca aceita override. */
function personalCalendarId(): string {
  return getEnv().GOOGLE_CALENDAR_ID;
}

export interface CreateEventInput {
  title: string;
  startIso: string;
  endIso: string;
  location?: string;
  description?: string;
  reminderMinutes?: number;
}

export interface CalendarEventResult {
  id: string;
  htmlLink: string | null;
  start: string | null;
  end: string | null;
  title: string;
}

/** Cria um evento SEMPRE no calendário pessoal. */
export async function createCalendarEvent(
  input: CreateEventInput,
): Promise<CalendarEventResult> {
  const calendar = getCalendar();
  const tz = timezone();

  const event: calendar_v3.Schema$Event = {
    summary: input.title,
    location: input.location,
    description: input.description,
    start: { dateTime: input.startIso, timeZone: tz },
    end: { dateTime: input.endIso, timeZone: tz },
  };

  if (typeof input.reminderMinutes === "number") {
    event.reminders = {
      useDefault: false,
      overrides: [{ method: "popup", minutes: input.reminderMinutes }],
    };
  }

  const res = await calendar.events.insert({
    calendarId: personalCalendarId(),
    requestBody: event,
  });

  return toResult(res.data);
}

export interface UpdateEventInput {
  eventId: string;
  startIso?: string;
  endIso?: string;
  title?: string;
  location?: string;
}

/**
 * Atualiza um evento. O calendarId é sempre o pessoal do env, mesmo que o
 * modelo tente passar outro. Usa patch (atualização parcial).
 */
export async function updateCalendarEvent(
  input: UpdateEventInput,
): Promise<CalendarEventResult> {
  const calendar = getCalendar();
  const tz = timezone();

  const patch: calendar_v3.Schema$Event = {};
  if (input.title !== undefined) patch.summary = input.title;
  if (input.location !== undefined) patch.location = input.location;
  if (input.startIso !== undefined) patch.start = { dateTime: input.startIso, timeZone: tz };
  if (input.endIso !== undefined) patch.end = { dateTime: input.endIso, timeZone: tz };

  const res = await calendar.events.patch({
    calendarId: personalCalendarId(),
    eventId: input.eventId,
    requestBody: patch,
  });

  return toResult(res.data);
}

/** Busca eventos numa janela [startIso, endIso] no calendário pessoal. */
export async function searchCalendarEvents(
  startIso: string,
  endIso: string,
): Promise<CalendarEventResult[]> {
  const calendar = getCalendar();
  const res = await calendar.events.list({
    calendarId: personalCalendarId(),
    timeMin: startIso,
    timeMax: endIso,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 50,
  });

  return (res.data.items ?? []).map(toResult);
}

function toResult(event: calendar_v3.Schema$Event): CalendarEventResult {
  return {
    id: event.id ?? "",
    htmlLink: event.htmlLink ?? null,
    start: event.start?.dateTime ?? event.start?.date ?? null,
    end: event.end?.dateTime ?? event.end?.date ?? null,
    title: event.summary ?? "(sem título)",
  };
}
