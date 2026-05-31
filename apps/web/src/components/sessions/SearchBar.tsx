import { useRef, useEffect } from "react";
import { useSessionsStore } from "../../store/sessions.ts";

export function SearchBar() {
  const { query, setQuery } = useSessionsStore();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  function handleChange(value: string) {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setQuery(value);
    }, 200);
  }

  useEffect(
    () => () => {
      clearTimeout(debounceRef.current);
    },
    [],
  );

  return (
    <div className="flex items-center gap-1.5 rounded border border-border bg-strip px-3 py-[5px]">
      <span className="text-[10px] text-muted">⌕</span>
      <input
        type="text"
        defaultValue={query}
        onChange={(e) => {
          handleChange(e.target.value);
        }}
        placeholder="search sessions..."
        className="w-full bg-transparent font-mono text-[10px] text-primary placeholder-muted outline-none"
      />
    </div>
  );
}
