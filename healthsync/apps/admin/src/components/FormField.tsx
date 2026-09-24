import React from 'react';
import styles from './FormField.module.css';

type FieldSize = 'sm' | 'md' | 'lg';
interface BaseFieldProps {
  label?: string; required?: boolean; error?: string; helperText?: string; size?: FieldSize; disabled?: boolean; id?: string;
}
let counter = 0;
function useFieldId(providedId?: string): string { const id = React.useRef(providedId ?? `field-${++counter}`); return id.current; }
function sizeClass(size: FieldSize, type: 'input' | 'select'): string {
  if (type === 'input' && size === 'sm') return styles.inputSm;
  if (type === 'input' && size === 'lg') return styles.inputLg;
  if (type === 'select' && size === 'sm') return styles.selectSm;
  return '';
}
function FieldWrapper({ label, required, error, helperText, htmlFor, children }: BaseFieldProps & { htmlFor: string; children: React.ReactNode }) {
  const descriptionId = error ? `${htmlFor}-error` : helperText ? `${htmlFor}-helper` : undefined;
  return <div className={styles.fieldGroup}>
    {label && <label htmlFor={htmlFor} className={`${styles.label} ${required ? styles.labelRequired : ''}`}>{label}</label>}
    {children}
    {error && <span id={descriptionId} className={styles.errorMessage} role="alert">⚠ {error}</span>}
    {!error && helperText && <span id={descriptionId} className={styles.helperText}>{helperText}</span>}
  </div>;
}
export interface InputFieldProps extends BaseFieldProps, Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'id'> {
  type?: 'text' | 'email' | 'password' | 'search' | 'number' | 'tel' | 'url' | 'date' | 'datetime-local' | 'time';
  prefixIcon?: React.ReactNode; suffixIcon?: React.ReactNode; onSuffixClick?: () => void; loading?: boolean;
}
export function InputField({ label, required, error, helperText, size = 'md', id: providedId, prefixIcon, suffixIcon, onSuffixClick, loading = false, className, disabled, ...inputProps }: InputFieldProps) {
  const id = useFieldId(providedId);
  const inputClass = [styles.input, sizeClass(size, 'input'), error ? styles.inputError : '', prefixIcon ? styles.inputWithPrefix : '', suffixIcon || loading ? styles.inputWithSuffix : '', className ?? ''].filter(Boolean).join(' ');
  return <FieldWrapper label={label} required={required} error={error} helperText={helperText} htmlFor={id}>
    <div className={styles.inputWrapper}>
      {prefixIcon && <span className={styles.prefixIcon} aria-hidden="true">{prefixIcon}</span>}
      <input id={id} disabled={disabled} required={required} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : helperText ? `${id}-helper` : undefined} className={inputClass} {...inputProps} />
      {loading && !suffixIcon && <span className={styles.loadingIcon} aria-label="Memuat…" />}
      {suffixIcon && !loading && (onSuffixClick
        ? <button type="button" className={`${styles.suffixIcon} ${styles.suffixClickable}`} onClick={onSuffixClick} tabIndex={-1} aria-label="Aksi suffix">{suffixIcon}</button>
        : <span className={styles.suffixIcon} aria-hidden="true">{suffixIcon}</span>)}
    </div>
  </FieldWrapper>;
}
export interface SelectOption { value: string; label: string; disabled?: boolean }
export interface SelectFieldProps extends BaseFieldProps, Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'id'> { options: SelectOption[]; placeholder?: string }
export function SelectField({ label, required, error, helperText, size = 'md', id: providedId, options, placeholder, className, disabled, ...selectProps }: SelectFieldProps) {
  const id = useFieldId(providedId); const selectClass = [styles.select, sizeClass(size, 'select'), error ? styles.inputError : '', className ?? ''].filter(Boolean).join(' ');
  return <FieldWrapper label={label} required={required} error={error} helperText={helperText} htmlFor={id}>
    <select id={id} disabled={disabled} required={required} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : helperText ? `${id}-helper` : undefined} className={selectClass} {...selectProps}>
      {placeholder && <option value="" disabled>{placeholder}</option>}{options.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
    </select>
  </FieldWrapper>;
}
export interface TextareaFieldProps extends BaseFieldProps, Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> { rows?: number }
export function TextareaField({ label, required, error, helperText, size: _size = 'md', id: providedId, className, disabled, rows = 4, ...textareaProps }: TextareaFieldProps) {
  const id = useFieldId(providedId); const textareaClass = [styles.textarea, error ? styles.inputError : '', className ?? ''].filter(Boolean).join(' ');
  return <FieldWrapper label={label} required={required} error={error} helperText={helperText} htmlFor={id}>
    <textarea id={id} rows={rows} disabled={disabled} required={required} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : helperText ? `${id}-helper` : undefined} className={textareaClass} {...textareaProps} />
  </FieldWrapper>;
}
const FormField = { Input: InputField, Select: SelectField, Textarea: TextareaField };
export default FormField;
