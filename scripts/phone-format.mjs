import { AsYouType, parsePhoneNumberFromString } from 'libphonenumber-js/max';

// Never infer a calling code from the site language, location or national digits.
const international = value => /^\+[\d\s().-]+$/u.test(value);
export function normalizePhone(value) {
  const entered = value.trim();
  if (!international(entered)) return entered;
  const phone = parsePhoneNumberFromString(entered, { extract: false });
  return phone?.isValid() && !phone.ext ? phone.number : entered;
}

export function formatPhone(value) {
  if (!international(value)) return value;
  const formatted = new AsYouType().input(value)
    .replace(/^(\+31 6 \d{4})(\d{1,4})$/, '$1 $2');
  // Formatting may add separators, but must never remove digits (e.g. a trunk 0).
  return formatted.replace(/\D/g, '') === value.replace(/\D/g, '') ? formatted : value;
}

const attached = new WeakSet();
export function attachPhoneInput(input) {
  if (attached.has(input)) return;
  attached.add(input);
  input.addEventListener('input', event => {
    if (event.isComposing || event.inputType?.startsWith('delete') ||
        input.selectionStart !== input.value.length || input.selectionEnd !== input.value.length) return;
    const formatted = formatPhone(input.value);
    if (formatted !== input.value) {
      input.value = formatted;
      input.setSelectionRange(formatted.length, formatted.length);
    }
  });
}
