import { addslashes } from 'locutus/php/strings';
import { DateTime } from 'luxon';

/**
 * Processes tag inputs prior to insertion/query in the database.
 * Performs the following:
 *  1. Convert to lowercase
 *  2. Trim whitespace
 *  3. Replace the unicode replacement character with ?, if present
 *  4. Truncate to 25 characters (an emoji counts as 1 character even if
 *     represented with multiple code points)
 *  5. Apply php addslashes function (ported to ts)
 *  6. Validates that the tag string is not empty, else throws an error
 * @param tagName the raw tag string
 * @returns string: the cleaned tag
 * @throws Error if cleaning results in an empty string
 */
export function cleanAndValidateTag(tagName: string): string {
  // Use array to shorten length rather than substring, which
  // might split emojis
  const trimmedLower = Array.from(
    tagName
      .replace(new RegExp('\uFFFD', 'g'), '?') // unicode replacement character
      .trim()
      .toLowerCase()
  )
    .slice(0, 25)
    .join('');
  if (trimmedLower == '') {
    throw new Error('Invalid tag: empty string');
  }
  return addslashes(trimmedLower);
}

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
 * decode a string from base 64 to plain text
 * @param encodedString string to be decpded
 * @returns decoded plain text
 */
export function decodeBase64ToPlainText(encodedString: string): string {
  return Buffer.from(encodedString, 'base64').toString();
}
