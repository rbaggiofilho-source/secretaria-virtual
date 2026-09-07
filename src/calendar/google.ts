import { google, type calendar_v3 } from "googleapis";
import { getEnv } from "../config/env.js";
import { authorizedClient } from "../oauth/google.js";
import { timezone } from "../util/datetime.js";

/**
 * Integração com o Google Calendar. Há dois caminhos de autenticação, e o
 * SERVIDOR (nunca o modelo) escolhe qual usar por usuário:
 *
 *   - OAuth (beta): o usuário conectou a própria conta Google; escrevemos no
 *     calendário "primary" DELE, usando o refresh_token guardado.
 *   - Service account (dono/legado): escreve no calendário resolvido pelo
 *     GOOGLE_CALENDAR_ID (dono) ou pelo calendar_id compartilhado do usuário.
 *
 * REGRA DE NEGÓCIO INEGOCIÁVEL: todo evento vai no calendário PESSOAL do
 * usuário da conversa. O modelo NUNCA escolhe o calendarId nem o modo de auth —
 * é impossível, por construção, cair no calendário de outra pessoa/empresa.
 */

/** Quem autentica a chamada — decidido pelo servidor a partir do usuário. */
export type CalendarAuth =
  | { kind: "oauth"; refreshToken: string }
  | { kind: "service"; calendarId?: string | null };

let serviceClient: calendar_v3.Calendar | null = null;

function getServiceCalendar(): calendar_v3.Calendar {
  if (serviceClient) return serviceClient;
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

  serviceClient = google.calendar({ version: "v3", auth });
  return serviceClient;
}

/**
 * Resolve o calendário pessoal da conta de serviço: o do usuário (compartilhado)
 * ou, em fallback, o GOOGLE_CALENDAR_ID da env. Nunca aceita valor do modelo.
 */
function personalCalendarId(userCalendarId?: string | null): string {
  return userCalendarId?.trim() || getEnv().GOOGLE_CALENDAR_ID;
}

/**
 * A partir do modo de auth escolhido pelo servidor, devolve o cliente do
 * Calendar e o calendarId em que se deve gravar. OAuth => sempre "primary"
 * (a conta é do próprio usuário).
 */
function resolveCalendar(auth: CalendarAuth): {
  calendar: calendar_v3.Calendar;
  calendarId: string;
} {
  if (auth.kind === "oauth") {
    const client = authorizedClient(auth.refreshToken);
    return {
      calendar: google.calendar({ version: "v3", auth: client }),
      calendarId: "primary",
    };
  }
  return {
    calendar: getServiceCalendar(),
    calendarId: personalCalendarId(auth.calendarId),
  };
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
  auth: CalendarAuth,
): Promise<CalendarEventResult> {
  const { calendar, calendarId } = resolveCalendar(auth);
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
    calendarId,
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
  auth: CalendarAuth,
): Promise<CalendarEventResult> {
  const { calendar, calendarId } = resolveCalendar(auth);
  const tz = timezone();

  const patch: calendar_v3.Schema$Event = {};
  if (input.title !== undefined) patch.summary = input.title;
  if (input.location !== undefined) patch.location = input.location;
  if (input.startIso !== undefined) patch.start = { dateTime: input.startIso, timeZone: tz };
  if (input.endIso !== undefined) patch.end = { dateTime: input.endIso, timeZone: tz };

  const res = await calendar.events.patch({
    calendarId,
    eventId: input.eventId,
    requestBody: patch,
  });

  return toResult(res.data);
}

/** Busca eventos numa janela [startIso, endIso] no calendário pessoal. */
export async function searchCalendarEvents(
  startIso: string,
  endIso: string,
  auth: CalendarAuth,
): Promise<CalendarEventResult[]> {
  const { calendar, calendarId } = resolveCalendar(auth);
  const res = await calendar.events.list({
    calendarId,
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
