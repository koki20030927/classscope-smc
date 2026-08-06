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

  useEffect(() => {
    const searchOptions = async () => {
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
          setSearchError(error instanceof Error ? error.message : '検索エラーが発生しました');
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
  }, [value, onSearch, isFocused]);

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
      <label htmlFor={inputId} className="mb-2 block text-sm font-medium text-[var(--text)]">
        {label} {required && <span className="text-[var(--muted)]">必須</span>}
      </label>
      <input
        id={inputId}
        ref={inputRef}
        type="text"
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
        className={`h-[50px] w-full rounded-lg border bg-[var(--elevated)] px-4 text-base text-[var(--text)] outline-none transition-colors duration-150 placeholder:text-[var(--muted)] hover:border-slate-500 focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--focus)] motion-reduce:transition-none ${
          required && value && !selectedId && hasSearched && filteredOptions.length > 0
            ? 'border-[var(--danger)]'
            : 'border-[var(--border)]'
        }`}
      />
      {loading && (
        <p className="mt-2 text-xs text-[var(--secondary)]">検索中...</p>
      )}
      {searchError && (
        <p className="mt-2 text-xs font-medium text-[var(--danger)]">{searchError}</p>
      )}
      {required && value && !selectedId && hasSearched && filteredOptions.length > 0 && !loading && !searchError && (
        <p className="mt-2 text-xs text-[var(--danger)]">候補から選択してください</p>
      )}
      {showSuggestions && filteredOptions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 mt-2 max-h-64 w-full overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--elevated)] shadow-[0_12px_32px_rgba(0,0,0,0.28)]"
        >
          {filteredOptions.map((option, index) => (
            <div
              key={option.id}
              onClick={() => handleSelectOption(option)}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={`cursor-pointer border-b border-[var(--divider)] px-4 py-3 text-sm text-[var(--secondary)] transition-colors duration-150 last:border-b-0 motion-reduce:transition-none ${
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
