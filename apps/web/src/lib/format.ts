const TIME_ZONE = "America/New_York";

const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: TIME_ZONE,
});

const fullDateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});

export const formatShortDate = (date: Date) => shortDateFormatter.format(date);

export const formatFullDate = (date: Date) => fullDateFormatter.format(date);

export const formatMinutes = (minutes: number) => {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
};

export const formatDistance = (distanceKm: number | null) => {
  if (distanceKm === null) {
    return "—";
  }
  return `${distanceKm.toFixed(1)} km`;
};

export const formatWeekRange = (start: Date, end: Date) => {
  const endLabel = new Date(end.getTime() - 1);
  return `${formatShortDate(start)} - ${formatShortDate(endLabel)}`;
};

// Re-export pace and watts formatting from shared package
export { formatPace, formatPaceWithUnit, formatWatts } from "@rowbook/shared";

