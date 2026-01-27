import type { ProofExtractedFields } from "../schemas/proof";
import type { ValidationStatus } from "../enums/validation-status";
import { compareAverageHr, compareDistanceKm } from "./validation";

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const normalizeYear = (year: number) => (year < 100 ? 2000 + year : year);

const buildIsoDate = (year: number, month: number, day: number) => {
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year
    || utc.getUTCMonth() + 1 !== month
    || utc.getUTCDate() !== day
  ) {
    return null;
  }
  return utc.toISOString();
};

const resolveYearlessDate = (month: number, day: number) => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const candidate = buildIsoDate(year, month, day);
  if (!candidate) {
    return null;
  }

  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const candidateUtc = Date.UTC(year, month - 1, day);
  const diffDays = Math.round((candidateUtc - todayUtc) / (1000 * 60 * 60 * 24));

  if (diffDays > 7) {
    return buildIsoDate(year - 1, month, day);
  }

  return candidate;
};

const isSameDate = (left: Date, right: Date) =>
  left.toISOString().slice(0, 10) === right.toISOString().slice(0, 10);

const parseDateFromText = (text: string) => {
  const lower = text.toLowerCase();
  if (/\btoday\b/.test(lower)) {
    const now = new Date();
    return buildIsoDate(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
  }
  if (/\byesterday\b/.test(lower)) {
    const now = new Date();
    const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
    return buildIsoDate(
      yesterday.getUTCFullYear(),
      yesterday.getUTCMonth() + 1,
      yesterday.getUTCDate(),
    );
  }

  const isoMatch = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    return buildIsoDate(year, month, day);
  }

  const numericMatch = text.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/);
  if (numericMatch) {
    const partA = Number(numericMatch[1]);
    const partB = Number(numericMatch[2]);
    const year = normalizeYear(Number(numericMatch[3]));
    let month = partA;
    let day = partB;

    if (partA > 12 && partB <= 12) {
      month = partB;
      day = partA;
    }

    return buildIsoDate(year, month, day);
  }

  const monthNameMatch = text.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*)?(\d{2,4})\b/i,
  );
  if (monthNameMatch) {
    const month = MONTHS[monthNameMatch[1].toLowerCase()];
    const day = Number(monthNameMatch[2]);
    const year = normalizeYear(Number(monthNameMatch[3]));
    return buildIsoDate(year, month, day);
  }

  const dayFirstMatch = text.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{2,4})\b/i,
  );
  if (dayFirstMatch) {
    const day = Number(dayFirstMatch[1]);
    const month = MONTHS[dayFirstMatch[2].toLowerCase()];
    const year = normalizeYear(Number(dayFirstMatch[3]));
    return buildIsoDate(year, month, day);
  }

  const monthNameNoYearMatch = text.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i,
  );
  if (monthNameNoYearMatch) {
    const month = MONTHS[monthNameNoYearMatch[1].toLowerCase()];
    const day = Number(monthNameNoYearMatch[2]);
    return resolveYearlessDate(month, day);
  }

  const dayFirstNoYearMatch = text.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i,
  );
  if (dayFirstNoYearMatch) {
    const day = Number(dayFirstNoYearMatch[1]);
    const month = MONTHS[dayFirstNoYearMatch[2].toLowerCase()];
    return resolveYearlessDate(month, day);
  }

  return null;
};

const parseNumber = (raw: string) => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const hasComma = trimmed.includes(",");
  const hasDot = trimmed.includes(".");
  let normalized = trimmed;

  if (hasComma && hasDot) {
    normalized = trimmed.replace(/,/g, "");
  } else if (hasComma) {
    if (/^\d{1,3}(,\d{3})+$/.test(trimmed)) {
      normalized = trimmed.replace(/,/g, "");
    } else {
      normalized = trimmed.replace(/,/g, ".");
    }
  }

  normalized = normalized.replace(/\s/g, "");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
};

const parseDistanceKmFromText = (text: string) => {
  const labelMatch = text.match(
    /\bdistance\s*[:\-]?\s*([0-9][0-9.,]*)\s*(km|kilometers?|kilometres?|mi|miles?|m|k)\b/i,
  );
  if (labelMatch) {
    const value = parseNumber(labelMatch[1]);
    if (value !== null) {
      const unit = labelMatch[2].toLowerCase();
      if (unit === "m") {
        return value / 1000;
      }
      const km = unit.startsWith("mi") ? value * 1.60934 : value;
      return km;
    }
  }

  const values: number[] = [];
  const distanceRegex = /(\d+(?:[.,]\d+)?)\s*(km|kilometers?|kilometres?|mi|miles?|k)\b/gi;
  let match = distanceRegex.exec(text);
  while (match) {
    const value = parseNumber(match[1]);
    if (value !== null) {
      const unit = match[2].toLowerCase();
      const km = unit.startsWith("mi") ? value * 1.60934 : value;
      values.push(km);
    }
    match = distanceRegex.exec(text);
  }

  const metersRegex = /(\d{3,6})\s*m\b/gi;
  match = metersRegex.exec(text);
  while (match) {
    const value = parseNumber(match[1]);
    if (value !== null && value >= 400) {
      values.push(value / 1000);
    }
    match = metersRegex.exec(text);
  }

  if (values.length === 0) {
    return null;
  }

  return Math.max(...values);
};

const parseDurationToMinutes = (raw: string) => {
  const cleaned = raw.replace(/,/g, ".").trim();
  const parts = cleaned.split(":").map((part) => part.trim());

  if (parts.length === 0) {
    return null;
  }

  const numbers = parts.map((value) => Number(value));
  if (numbers.some((value) => Number.isNaN(value))) {
    return null;
  }

  if (numbers.length === 3) {
    const [hours, minutes, seconds] = numbers;
    return Math.round((hours * 3600 + minutes * 60 + seconds) / 60);
  }

  if (numbers.length === 2) {
    const [minutes, seconds] = numbers;
    return Math.round((minutes * 60 + seconds) / 60);
  }

  return null;
};

const parseMinutesFromText = (text: string) => {
  const values: number[] = [];

  const labeledRegex =
    /(moving|total|elapsed)\s*time[:\s]*([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?(?:[.,][0-9])?)/gi;
  let labeledMatch = labeledRegex.exec(text);
  while (labeledMatch) {
    const parsed = parseDurationToMinutes(labeledMatch[2]);
    if (parsed !== null) {
      values.push(parsed);
    }
    labeledMatch = labeledRegex.exec(text);
  }

  const hoursRegex = /(\d{1,2})\s*h(?:ours?)?\s*(\d{1,2})?\s*(?:m|min|mins|minutes)?\b/gi;
  let match = hoursRegex.exec(text);
  while (match) {
    const hours = Number(match[1]);
    const minutes = match[2] ? Number(match[2]) : 0;
    if (Number.isFinite(hours) && Number.isFinite(minutes)) {
      values.push(hours * 60 + minutes);
    }
    match = hoursRegex.exec(text);
  }

  const minutesRegex = /(\d{1,3})\s*(?:min|mins|minutes)\b/gi;
  match = minutesRegex.exec(text);
  while (match) {
    const minutes = Number(match[1]);
    if (Number.isFinite(minutes)) {
      values.push(minutes);
    }
    match = minutesRegex.exec(text);
  }

  const hhmmssRegex = /(\d{1,2}):(\d{2}):(\d{2})(?:[.,](\d{1,2}))?/g;
  match = hhmmssRegex.exec(text);
  while (match) {
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    const fraction = match[4] ? Number(`0.${match[4]}`) : 0;
    if (
      Number.isFinite(hours)
      && Number.isFinite(minutes)
      && Number.isFinite(seconds)
    ) {
      values.push(hours * 60 + minutes + (seconds + fraction) / 60);
    }
    match = hhmmssRegex.exec(text);
  }

  const hhmmRegex = /(\d{1,2}):(\d{2})/g;
  match = hhmmRegex.exec(text);
  while (match) {
    const startIndex = match.index;
    const endIndex = startIndex + match[0].length;
    const context = text.slice(Math.max(0, startIndex - 8), endIndex + 8).toLowerCase();
    if (
      context.includes("/km")
      || context.includes("/mi")
      || /\/\d{2,4}\s*m/.test(context)
      || context.includes("pace")
    ) {
      match = hhmmRegex.exec(text);
      continue;
    }

    const first = Number(match[1]);
    const second = Number(match[2]);
    if (Number.isFinite(first) && Number.isFinite(second)) {
      const minutes = first >= 10 ? first + second / 60 : first * 60 + second;
      values.push(minutes);
    }
    match = hhmmRegex.exec(text);
  }

  if (values.length === 0) {
    return null;
  }

  return Math.round(Math.max(...values));
};

const parseAvgHrFromText = (text: string) => {
  const avgRegex = /(avg|average)\s*(?:heart\s*rate|hr|bpm)?\s*[:\-]?\s*(\d{2,3})\b/i;
  const avgMatch = text.match(avgRegex);
  if (avgMatch) {
    const value = Number(avgMatch[2]);
    if (Number.isFinite(value) && value >= 40 && value <= 230) {
      return value;
    }
  }

  const bpmRegex = /(\d{2,3})\s*bpm\b/i;
  const bpmMatch = text.match(bpmRegex);
  if (bpmMatch) {
    const value = Number(bpmMatch[1]);
    if (Number.isFinite(value) && value >= 40 && value <= 230) {
      return value;
    }
  }

  const rateMatch = text.match(/\br\s*([0-9]{2,3})\b/i);
  if (rateMatch) {
    const value = Number(rateMatch[1]);
    if (Number.isFinite(value) && value >= 40 && value <= 230) {
      return value;
    }
  }

  return null;
};

const parseConcept2TotalTimeMinutes = (text: string) => {
  const totalMatch = text.match(
    /total\s*time[^0-9]{0,6}([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?(?:[.,][0-9])?)/i,
  );
  if (!totalMatch) {
    return null;
  }
  return parseDurationToMinutes(totalMatch[1]);
};

const parseConcept2MetersFromLines = (lines: string[]) => {
  const headerIndex = lines.findIndex((line) => /meter/i.test(line));
  const candidateLines =
    headerIndex >= 0 ? lines.slice(headerIndex + 1, headerIndex + 8) : lines;

  const candidates: number[] = [];
  for (const line of candidateLines) {
    const numbers = line.match(/\b\d{4,6}\b/g);
    if (!numbers) {
      continue;
    }
    for (const value of numbers) {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed >= 400) {
        candidates.push(parsed);
      }
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  return Math.max(...candidates);
};

const detectConcept2 = (rawText: string) =>
  /concept\s*2|pm5|view detail|total time/i.test(rawText);

const extractConcept2Fields = (rawText: string) => {
  if (!detectConcept2(rawText)) {
    return null;
  }

  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const normalized = lines.join(" ");

  const date = parseDateFromText(normalized);
  const minutes = parseConcept2TotalTimeMinutes(normalized);
  const meters = parseConcept2MetersFromLines(lines);
  const distance = meters !== null ? meters / 1000 : null;
  const avgHr = parseAvgHrFromText(normalized);

  return { date, minutes, distance, avgHr };
};

export const summarizeExtractedFields = (extractedFields: ProofExtractedFields) => {
  const hasAny = [
    extractedFields.date,
    extractedFields.minutes,
    extractedFields.distance,
    extractedFields.avgHr,
  ].some((value) => value !== null && value !== undefined);

  const hasRequired = Boolean(extractedFields.date)
    && extractedFields.minutes !== null
    && extractedFields.minutes !== undefined
    && extractedFields.distance !== null
    && extractedFields.distance !== undefined;

  return { hasAny, hasRequired };
};

export const extractProofFieldsFromText = (rawText: string) => {
  const normalizedText = rawText.replace(/\s+/g, " ").trim();
  const baseDate = parseDateFromText(normalizedText);
  const baseMinutes = parseMinutesFromText(normalizedText);
  const baseDistance = parseDistanceKmFromText(normalizedText);
  const baseAvgHr = parseAvgHrFromText(normalizedText);

  const concept2 = extractConcept2Fields(rawText);
  const date = concept2?.date ?? baseDate;
  const minutes = concept2 ? concept2.minutes : baseMinutes;
  const distance = concept2 ? concept2.distance : baseDistance;
  const avgHr = concept2?.avgHr ?? baseAvgHr;

  const extractedFields: ProofExtractedFields = {
    date: date ?? null,
    minutes: minutes ?? null,
    distance: distance ?? null,
    avgHr: avgHr ?? null,
    activityType: null,
  };

  const { hasAny, hasRequired } = summarizeExtractedFields(extractedFields);

  return { extractedFields, hasAny, hasRequired };
};

export const shouldAutoVerifyProof = (
  entry: {
    date: Date;
    minutes: number;
    distance: number;
    avgHr: number | null;
  } | null,
  extractedFields: ProofExtractedFields,
) => {
  if (!entry) {
    return false;
  }

  if (!extractedFields.date || extractedFields.minutes === null || extractedFields.distance === null) {
    return false;
  }

  const parsedDate = new Date(extractedFields.date);
  if (Number.isNaN(parsedDate.getTime())) {
    return false;
  }

  const minutesMatch = extractedFields.minutes === entry.minutes;
  const distanceMatch = compareDistanceKm(entry.distance, extractedFields.distance).matches;
  const dateMatch = isSameDate(entry.date, parsedDate);
  const hrMatch = entry.avgHr === null
    ? true
    : extractedFields.avgHr !== null
      && compareAverageHr(entry.avgHr, extractedFields.avgHr).matches;

  return minutesMatch && distanceMatch && dateMatch && hrMatch;
};

export const resolveValidationStatus = (
  hasRequired: boolean,
  autoVerified: boolean,
): ValidationStatus => {
  if (autoVerified) {
    return "VERIFIED";
  }

  return hasRequired ? "PENDING" : "EXTRACTION_INCOMPLETE";
};
