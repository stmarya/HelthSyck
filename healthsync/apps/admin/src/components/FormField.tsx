import React from 'react';
import styles from './FormField.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Tipe Umum
// ─────────────────────────────────────────────────────────────────────────────

type FieldSize = 'sm' | 'md' | 'lg';

interface BaseFieldProps {
  /** Label field */
  label?: string;
  /** Tanda wajib diisi */
  required?: boolean;
  /** Pesan error — tampilkan dalam state error */
  error?: string;
  /** Teks bantuan di bawah field */
  helperText?: string;
  /** Ukuran field */
  size?: FieldSize;
  /** Nonaktifkan field */
  disabled?: boolean;
  /** ID HTML eksplisit (jika tidak ada, akan di-generate otomatis) */
  id?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Counter ID otomatis untuk aksesibilitas
// ─────────────────────────────────────────────────────────────────────────────

let _counter = 0;
function useFieldId(providedId?: string): string {
  const id = React.useRef(providedId ?? `field-${++_counter}`);
  return id.current;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: class input berdasarkan size
// ─────────────────────────────────────────────────────────────────────────────

function sizeClass(size: FieldSize, type: 'input' | 'select'): string {
  if (type === 'input') {
    if (size === 'sm') return styles.inputSm;
    if (size === 'lg') return styles.inputLg;
  }
  if (type === 'select') {
    if (size === 'sm') return styles.selectSm;
  }
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Komponen: FieldWrapper — label + children + error/helper
// ─────────────────────────────────────────────────────────────────────────────

function FieldWrapper({
  label,
  required,
  error,
  helperText,
  htmlFor,
  children,
}: {
  label?: string;
  required?: boolean;
  error?: string;
  helperText?: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.fieldGroup}>
      {label && (
        <label
          htmlFor={htmlFor}
          className={`${styles.label} ${required ? styles.labelRequired : ''}`}
        >
          {label}
        </label>
      )}
      {children}
      {error && (
        <span className={styles.errorMessage} role="alert">
          ⚠ {error}
        </span>
      )}
      {!error && helperText && (
        <span className={styles.helperText}>{helperText}</span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// InputField — input text, email, password, search, number, tel
// ─────────────────────────────────────────────────────────────────────────────

export interface InputFieldProps
  extends BaseFieldProps,
    Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'id'> {
  type?: 'text' | 'email' | 'password' | 'search' | 'number' | 'tel' | 'url';
  /** Icon/elemen di sisi kiri input */
  prefixIcon?: React.ReactNode;
  /** Icon/elemen di sisi kanan input */
  suffixIcon?: React.ReactNode;
  /** Apakah suffix bisa diklik (misal: toggle visibility password) */
  onSuffixClick?: () => void;
  /** Tampilkan spinner loading di kanan */
  loading?: boolean;
}

export function InputField({
  label,
  required,
  error,
  helperText,
  size = 'md',
  id: providedId,
  prefixIcon,
  suffixIcon,
  onSuffixClick,
  loading = false,
  className,
  disabled,
  ...inputProps
}: InputFieldProps) {
  const id = useFieldId(providedId);

  const inputClass = [
    styles.input,
    sizeClass(size, 'input'),
    error       ? styles.inputError      : '',
    prefixIcon  ? styles.inputWithPrefix : '',
    suffixIcon || loading ? styles.inputWithSuffix : '',
    className ?? '',
  ].filter(Boolean).join(' ');

  return (
    <FieldWrapper
      label={label}
      required={required}
      error={error}
      helperText={helperText}
      htmlFor={id}
    >
      <div className={styles.inputWrapper}>
        {prefixIcon && (
          <span className={styles.prefixIcon} aria-hidden="true">
            {prefixIcon}
          </span>
        )}

        <input
          id={id}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : helperText ? `${id}-helper` : undefined}
          className={inputClass}
          {...inputProps}
        />

        {loading && !suffixIcon && (
          <span className={styles.loadingIcon} aria-label="Memuat…" />
        )}

        {suffixIcon && !loading && (
          onSuffixClick ? (
            <button
              type="button"
              className={`${styles.suffixIcon} ${styles.suffixClickable}`}
              onClick={onSuffixClick}
              tabIndex={-1}
              aria-label="Aksi suffix"
            >
              {suffixIcon}
            </button>
          ) : (
            <span className={styles.suffixIcon} aria-hidden="true">
              {suffixIcon}
            </span>
          )
        )}
      </div>
    </FieldWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SelectField — dropdown pilihan
// ─────────────────────────────────────────────────────────────────────────────

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectFieldProps
  extends BaseFieldProps,
    Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'id'> {
  /** Daftar opsi dropdown */
  options: SelectOption[];
  /** Teks placeholder opsi pertama (value kosong) */
  placeholder?: string;
}

export function SelectField({
  label,
  required,
  error,
  helperText,
  size = 'md',
  id: providedId,
  options,
  placeholder,
  className,
  disabled,
  ...selectProps
}: SelectFieldProps) {
  const id = useFieldId(providedId);

  const selectClass = [
    styles.select,
    sizeClass(size, 'select'),
    error ? styles.inputError : '',
    className ?? '',
  ].filter(Boolean).join(' ');

  return (
    <FieldWrapper
      label={label}
      required={required}
      error={error}
      helperText={helperText}
      htmlFor={id}
    >
      <select
        id={id}
        disabled={disabled}
        aria-invalid={!!error}
        className={selectClass}
        {...selectProps}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
    </FieldWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TextareaField — textarea multi-baris
// ─────────────────────────────────────────────────────────────────────────────

export interface TextareaFieldProps
  extends BaseFieldProps,
    Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  /** Jumlah baris minimum tampilan */
  rows?: number;
}

export function TextareaField({
  label,
  required,
  error,
  helperText,
  size: _size = 'md',  // size tidak dipakai textarea, tapi diterima agar API konsisten
  id: providedId,
  className,
  disabled,
  rows = 4,
  ...textareaProps
}: TextareaFieldProps) {
  const id = useFieldId(providedId);

  const textareaClass = [
    styles.textarea,
    error ? styles.inputError : '',
    className ?? '',
  ].filter(Boolean).join(' ');

  return (
    <FieldWrapper
      label={label}
      required={required}
      error={error}
      helperText={helperText}
      htmlFor={id}
    >
      <textarea
        id={id}
        rows={rows}
        disabled={disabled}
        aria-invalid={!!error}
        className={textareaClass}
        {...textareaProps}
      />
    </FieldWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Export default — untuk kenyamanan import tunggal
// ─────────────────────────────────────────────────────────────────────────────

const FormField = {
  Input:    InputField,
  Select:   SelectField,
  Textarea: TextareaField,
};

export default FormField;
