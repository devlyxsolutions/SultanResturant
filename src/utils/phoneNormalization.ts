/**
 * Pakistani Phone Number Normalization Utility
 * 
 * Converts any Pakistani format:
 * - 0300-1234567
 * - 03001234567
 * - +92 300 1234567
 * - 0092 300 1234567
 * - 923001234567
 * 
 * Into one standard international E.164 format:
 * +923001234567
 * 
 * Also supports Pakistani landlines (e.g. 051, 042, 021) and display formatting.
 */

/**
 * Normalizes any Pakistani phone string into standard `+92XXXXXXXXXX` format.
 * Returns null or cleaned string if invalid/non-parseable.
 */
export function normalizePakistaniPhone(rawPhone: string | null | undefined): string {
  if (!rawPhone || typeof rawPhone !== 'string') {
    return '';
  }

  // Strip all non-digit characters except an initial '+' if present
  const trimmed = rawPhone.trim();
  // Extract all digits
  let digits = trimmed.replace(/\D/g, '');

  if (!digits) {
    return '';
  }

  // Handle leading "0092" -> convert to "92"
  if (digits.startsWith('0092')) {
    digits = digits.slice(2); // removes "00"
  }

  // Case 1: Starts with country code "92"
  if (digits.startsWith('92')) {
    // Expected standard mobile: 92 + 10 digits = 12 digits total (e.g. 923001234567)
    // Or landline: 92 + 9 or 10 digits = 11 or 12 digits
    if (digits.length >= 11 && digits.length <= 13) {
      return `+${digits}`;
    }
  }

  // Case 2: Starts with local leading '0' (e.g. 03001234567, 0511234567)
  if (digits.startsWith('0')) {
    const withoutZero = digits.slice(1);
    // Standard Pakistani mobile without leading 0 has 10 digits (e.g. 3001234567)
    // Landline without leading 0 has 9 or 10 digits
    if (withoutZero.length >= 9 && withoutZero.length <= 11) {
      return `+92${withoutZero}`;
    }
  }

  // Case 3: 10 digits starting with '3' (e.g. 3001234567 entered without 0 or +92)
  if (digits.length === 10 && digits.startsWith('3')) {
    return `+92${digits}`;
  }

  // If already prefixed with something else or odd length, return with '+' if digits >= 10
  if (digits.length >= 10 && digits.length <= 13) {
    return `+${digits.startsWith('92') ? digits : '92' + digits}`;
  }

  // Return best-effort standard digits with +
  return digits ? `+${digits}` : '';
}

/**
 * Validates if the phone number represents a valid Pakistani mobile or landline number.
 */
export function isValidPakistaniPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const normalized = normalizePakistaniPhone(phone);
  // Must start with +92
  if (!normalized.startsWith('+92')) return false;

  const numberPart = normalized.slice(3); // after +92

  // Mobile: 10 digits, starts with 3 (e.g. 300, 312, 321, 333, 345, 355)
  if (numberPart.length === 10 && numberPart.startsWith('3')) {
    return true;
  }

  // Landline: 9 to 10 digits (e.g. 51xxxxxxx for Islamabad, 42xxxxxxx for Lahore, 21xxxxxxx for Karachi)
  if (numberPart.length >= 9 && numberPart.length <= 10) {
    return true;
  }

  return false;
}

/**
 * Formats a phone number for local UI display.
 * E.g. "+923001234567" -> "0300-1234567" (Local style)
 * or international "+92 300 1234567"
 */
export function formatPakistaniDisplayPhone(
  phone: string | null | undefined,
  style: 'local' | 'international' = 'local'
): string {
  const normalized = normalizePakistaniPhone(phone);
  if (!normalized || !normalized.startsWith('+92')) {
    return phone || '';
  }

  const numberPart = normalized.slice(3); // e.g. 3001234567

  if (style === 'international') {
    // +92 300 1234567
    if (numberPart.length === 10) {
      return `+92 ${numberPart.slice(0, 3)} ${numberPart.slice(3)}`;
    }
    return `+92 ${numberPart}`;
  }

  // Local style: 0300-1234567
  if (numberPart.length === 10) {
    return `0${numberPart.slice(0, 3)}-${numberPart.slice(3)}`;
  }

  // Landline local: 051-1234567
  if (numberPart.length === 9) {
    return `0${numberPart.slice(0, 2)}-${numberPart.slice(2)}`;
  }

  return `0${numberPart}`;
}

/**
 * Compares two phone numbers to see if they match the same person,
 * regardless of how either number was typed.
 */
export function arePhonesEqual(phone1: string | null | undefined, phone2: string | null | undefined): boolean {
  if (!phone1 || !phone2) return false;
  const n1 = normalizePakistaniPhone(phone1);
  const n2 = normalizePakistaniPhone(phone2);
  return n1.length > 5 && n1 === n2;
}
