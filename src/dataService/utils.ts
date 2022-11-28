import { DateTime } from 'luxon';

/**
 * Convert date object to timestamp as a string (yyyy-MM-dd HH:mm:ss)
 * localized to a time zone.
 * Used for database timestamp strings in text columns
 * (e.g. users_meta.value)
 * @param timestamp the date object to localize and return as string
 * @param tz the timezone string for the timezone
 */
export function mysqlTimeString(timestamp: Date, tz: string): string {
  const dt = DateTime.fromMillis(timestamp.getTime()).setZone(tz);
  return dt.toFormat('yyyy-MM-dd HH:mm:ss');
}
