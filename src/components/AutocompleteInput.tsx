import { useState, useEffect, useId, useRef } from 'react';

interface AutocompleteOption {
  id: string;
  label: string;
}

interface AutocompleteInputProps {
  label: string;
  value: string;
  selectedId: string | null;
  onChange: (value: string, selectedId: string | null) => void;
  onSearch?: (query: string) => Promise<AutocompleteOption[]>;
  placeholder?: string;
  required?: boolean;
}

export function AutocompleteInput({
  label,
  value,
  selectedId,
  onChange,
  onSearch,
  placeholder,
  required = false,
}: AutocompleteInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredOptions, setFilteredOptions] = useState<AutocompleteOption[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const listboxId = `${inputId}-suggestions`;

  useEffect(() => {
    const searchOptions = async () => {
      if (selectedId) {
        setFilteredOptions([]);
        setShowSuggestions(false);
        setLoading(false);
        setSearchError(null);
        return;
      }

      if (value.length >= 2 && onSearch) {
        setLoading(true);
        setHasSearched(true);
        setSearchError(null);
        try {
          const results = await onSearch(value);
          setFilteredOptions(results);
          setShowSuggestions(isFocused && results.length > 0);
          setHighlightedIndex(0);
          setSearchError(null);
        } catch (error) {
          console.error('Search error:', error);
          setFilteredOptions([]);
          setShowSuggestions(false);
          setSearchError('候補を読み込めませんでした。少し時間をおいて再度お試しください。');
        } finally {
          setLoading(false);
        }
      } else {
        setFilteredOptions([]);
        setShowSuggestions(false);
        setSearchError(null);
        if (value.length < 2) {
          setHasSearched(false);
        }
      }
    };

    const debounceTimer = setTimeout(searchOptions, 300);
    return () => clearTimeout(debounceTimer);
  }, [value, onSearch, isFocused, selectedId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue, null);
  };


  const handleSelectOption = (option: AutocompleteOption) => {
    onChange(option.label, option.id);
    setShowSuggestions(false);
  };

  const handleClearSelection = () => {
    onChange('', null);
    setFilteredOptions([]);
    setHasSearched(false);
    setSearchError(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || filteredOptions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % filteredOptions.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev - 1 + filteredOptions.length) % filteredOptions.length);
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredOptions[highlightedIndex]) {
          handleSelectOption(filteredOptions[highlightedIndex]);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        break;
    }
  };

  return (
    <div className="relative">
      {selectedId ? (
        <span className="app-field-label mb-2.5 block text-[var(--text)]">{label}</span>
      ) : (
        <label htmlFor={inputId} className="app-field-label mb-2.5 block text-[var(--text)]">{label}</label>
      )}
      {selectedId ? (
        <div className="flex min-h-[50px] items-center justify-between gap-4 rounded-lg border border-[var(--accent)]/45 bg-[var(--accent-soft)] px-4">
          <div className="min-w-0">
            <span className="block text-[11px] leading-4 text-[var(--secondary)]">選択済み</span>
            <span className="block truncate text-[15px] font-medium leading-6 text-[var(--text)]">{value}</span>
          </div>
          <button type="button" onClick={handleClearSelection} className="min-h-11 shrink-0 px-1 text-[13px] font-medium text-[var(--accent)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
            変更
          </button>
        </div>
      ) : (
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showSuggestions}
          aria-controls={listboxId}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setIsFocused(true);
            if (value.length >= 2 && filteredOptions.length > 0) {
              setShowSuggestions(true);
            }
          }}
          onBlur={() => {
            setIsFocused(false);
            setTimeout(() => setShowSuggestions(false), 150);
          }}
          placeholder={placeholder}
          required={required}
          className={`h-[50px] w-full rounded-lg border bg-[var(--elevated)] px-4 text-[15px] leading-6 text-[var(--text)] outline-none transition-colors duration-150 placeholder:text-[14px] placeholder:text-[var(--muted)] hover:border-slate-500 focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--focus)] motion-reduce:transition-none ${
            required && value && !selectedId && hasSearched && filteredOptions.length > 0
              ? 'border-[var(--danger)]'
              : 'border-[var(--border)]'
          }`}
        />
      )}
      {loading && (
        <p className="app-metadata mt-2 text-[var(--secondary)]" aria-live="polite">候補を検索しています...</p>
      )}
      {searchError && (
        <p role="alert" className="app-metadata mt-2 font-medium text-[var(--danger)]">{searchError}</p>
      )}
      {isFocused && value.length > 0 && value.length < 2 && !selectedId && (
        <p className="app-metadata mt-2 text-[var(--secondary)]">2文字以上入力すると候補を検索します。</p>
      )}
      {isFocused && hasSearched && !loading && !searchError && filteredOptions.length === 0 && !selectedId && (
        <p className="app-metadata mt-2 text-[var(--secondary)]">該当する候補が見つかりません。</p>
      )}
      {required && value && !selectedId && hasSearched && filteredOptions.length > 0 && !loading && !searchError && (
        <p className="app-metadata mt-2 text-[var(--danger)]">候補から選択してください</p>
      )}
      {showSuggestions && filteredOptions.length > 0 && (
        <div
          id={listboxId}
          role="listbox"
          ref={suggestionsRef}
          className="absolute z-50 mt-2 max-h-64 w-full overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--elevated)] shadow-[0_12px_32px_rgba(0,0,0,0.28)]"
        >
          {filteredOptions.map((option, index) => (
            <div
              key={option.id}
              role="option"
              aria-selected={index === highlightedIndex}
              onClick={() => handleSelectOption(option)}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={`cursor-pointer border-b border-[var(--divider)] px-4 py-3 text-[14px] leading-5 text-[var(--secondary)] transition-colors duration-150 last:border-b-0 motion-reduce:transition-none ${
                index === highlightedIndex ? 'bg-white/[0.055] font-medium text-[var(--text)]' : 'hover:bg-white/[0.035] hover:text-[var(--text)]'
              }`}
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
