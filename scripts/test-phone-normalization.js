// Self-contained test runner for Pakistani Phone Normalization
const assert = require('assert');

function normalizePakistaniPhone(rawPhone) {
  if (!rawPhone || typeof rawPhone !== 'string') return '';
  let digits = rawPhone.trim().replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('0092')) {
    digits = digits.slice(2);
  }

  if (digits.startsWith('92')) {
    if (digits.length >= 11 && digits.length <= 13) {
      return `+${digits}`;
    }
  }

  if (digits.startsWith('0')) {
    const withoutZero = digits.slice(1);
    if (withoutZero.length >= 9 && withoutZero.length <= 11) {
      return `+92${withoutZero}`;
    }
  }

  if (digits.length === 10 && digits.startsWith('3')) {
    return `+92${digits}`;
  }

  if (digits.length >= 10 && digits.length <= 13) {
    return `+${digits.startsWith('92') ? digits : '92' + digits}`;
  }

  return digits ? `+${digits}` : '';
}

function isValidPakistaniPhone(phone) {
  if (!phone) return false;
  const normalized = normalizePakistaniPhone(phone);
  if (!normalized.startsWith('+92')) return false;
  const numberPart = normalized.slice(3);
  if (numberPart.length === 10 && numberPart.startsWith('3')) return true;
  if (numberPart.length >= 9 && numberPart.length <= 10) return true;
  return false;
}

function formatPakistaniDisplayPhone(phone, style = 'local') {
  const normalized = normalizePakistaniPhone(phone);
  if (!normalized || !normalized.startsWith('+92')) return phone || '';
  const numberPart = normalized.slice(3);
  if (style === 'international') {
    if (numberPart.length === 10) return `+92 ${numberPart.slice(0, 3)} ${numberPart.slice(3)}`;
    return `+92 ${numberPart}`;
  }
  if (numberPart.length === 10) return `0${numberPart.slice(0, 3)}-${numberPart.slice(3)}`;
  if (numberPart.length === 9) return `0${numberPart.slice(0, 2)}-${numberPart.slice(2)}`;
  return `0${numberPart}`;
}

function arePhonesEqual(p1, p2) {
  if (!p1 || !p2) return false;
  const n1 = normalizePakistaniPhone(p1);
  const n2 = normalizePakistaniPhone(p2);
  return n1.length > 5 && n1 === n2;
}

// RUN TESTS
console.log('Testing Pakistani Phone Normalization...');

const expected = '+923001234567';
assert.strictEqual(normalizePakistaniPhone('0300-1234567'), expected, '0300-1234567 failed');
assert.strictEqual(normalizePakistaniPhone('03001234567'), expected, '03001234567 failed');
assert.strictEqual(normalizePakistaniPhone('+92 300 1234567'), expected, '+92 300 1234567 failed');
assert.strictEqual(normalizePakistaniPhone('00923001234567'), expected, '00923001234567 failed');
assert.strictEqual(normalizePakistaniPhone('923001234567'), expected, '923001234567 failed');
assert.strictEqual(normalizePakistaniPhone('3001234567'), expected, '3001234567 failed');

// Landlines
assert.strictEqual(normalizePakistaniPhone('051-9261234'), '+92519261234', '051 landline failed');
assert.strictEqual(normalizePakistaniPhone('+92 42 35876543'), '+924235876543', '042 landline failed');
assert.strictEqual(normalizePakistaniPhone('02134567890'), '+922134567890', '021 landline failed');

// Null / empty
assert.strictEqual(normalizePakistaniPhone(''), '');
assert.strictEqual(normalizePakistaniPhone(null), '');
assert.strictEqual(normalizePakistaniPhone(undefined), '');

// Validations
assert.strictEqual(isValidPakistaniPhone('0300-1234567'), true);
assert.strictEqual(isValidPakistaniPhone('+92 321 9876543'), true);
assert.strictEqual(isValidPakistaniPhone('03451122334'), true);
assert.strictEqual(isValidPakistaniPhone('051-2233445'), true);
assert.strictEqual(isValidPakistaniPhone('12345'), false);
assert.strictEqual(isValidPakistaniPhone('abcdef'), false);

// Formatting
assert.strictEqual(formatPakistaniDisplayPhone('+923001234567', 'local'), '0300-1234567');
assert.strictEqual(formatPakistaniDisplayPhone('+923001234567', 'international'), '+92 300 1234567');

// Equality
assert.strictEqual(arePhonesEqual('0300-1234567', '+92 300 1234567'), true);
assert.strictEqual(arePhonesEqual('00923001234567', '03001234567'), true);
assert.strictEqual(arePhonesEqual('0300-1234567', '0300-7654321'), false);

console.log('✅ ALL PHONE NORMALIZATION TESTS PASSED SUCCESSFULLY!');
