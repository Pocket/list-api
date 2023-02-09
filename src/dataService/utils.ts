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

/**
 * Convert MySQL Date fields to Typescript Date objects
 * or null if the MySQL Date field is invalied for Typescript Dates
 * (e.g. "0000-00-00 00:00:00").
 * @param mysqlDate the date value from MySQL (could be Date, NaN, or string)
 */
export function mysqlDateConvert(mysqlDate: Date | string | null): Date | null {
  if (mysqlDate instanceof Date && !isNaN(mysqlDate.getTime())) {
    return mysqlDate;
  }
  return null;
}
