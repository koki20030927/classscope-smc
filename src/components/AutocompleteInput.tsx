import { useState, useEffect, useRef } from 'react';

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
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
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
        className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          required && value && !selectedId && hasSearched && filteredOptions.length > 0
            ? 'border-red-300'
            : 'border-gray-300'
        }`}
      />
      {loading && (
        <p className="text-xs text-gray-500 mt-1">検索中...</p>
      )}
      {searchError && (
        <p className="text-xs text-red-600 mt-1 font-semibold">{searchError}</p>
      )}
      {required && value && !selectedId && hasSearched && filteredOptions.length > 0 && !loading && !searchError && (
        <p className="text-xs text-red-600 mt-1">候補から選択してください</p>
      )}
      {showSuggestions && filteredOptions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto"
        >
          {filteredOptions.map((option, index) => (
            <div
              key={option.id}
              onClick={() => handleSelectOption(option)}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={`px-3 py-2 cursor-pointer ${
                index === highlightedIndex ? 'bg-blue-100' : 'hover:bg-gray-100'
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
