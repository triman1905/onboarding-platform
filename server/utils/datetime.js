/**
 * Converts a wall-clock date + time in a given IANA timezone to a correct UTC
 * ISO string, without relying on the server process's own timezone.
 *
 * Uses the standard two-pass Intl.DateTimeFormat offset trick: format a UTC
 * guess in the target zone, diff against the guess to recover the zone's
 * offset for that instant, then apply it. This is correct for zones with a
 * fixed offset (Asia/Kolkata, no DST) and also for DST-observing zones.
 */
export function zonedTimeToUtcIso(dateStr, timeStr, timeZone = "Asia/Kolkata") {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr ?? "").trim());
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(String(timeStr ?? "").trim());
  if (!dateMatch) throw new Error("Send date must be in YYYY-MM-DD format");
  if (!timeMatch) throw new Error("Send time must be in HH:MM format");

  const [, year, month, day] = dateMatch.map(Number);
  const [, hour, minute] = timeMatch.map(Number);

  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  if (Number.isNaN(utcGuess.getTime())) throw new Error("Invalid send date/time");

  const offsetMinutes = getTimeZoneOffsetMinutes(timeZone, utcGuess);
  return new Date(utcGuess.getTime() - offsetMinutes * 60000).toISOString();
}

function getTimeZoneOffsetMinutes(timeZone, date) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = {};
  for (const { type, value } of dtf.formatToParts(date)) parts[type] = value;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - date.getTime()) / 60000;
}
