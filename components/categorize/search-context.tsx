"use client";

import { createContext, useContext, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

type SearchCtx = { searchInput: string; setSearchInput: (v: string) => void };

const SearchContext = createContext<SearchCtx>({ searchInput: "", setSearchInput: () => {} });

export function CategorizeSearchProvider({ children }: { children: React.ReactNode }) {
  const [searchInput, setSearchInput] = useState("");
  return (
    <SearchContext.Provider value={{ searchInput, setSearchInput }}>
      {children}
    </SearchContext.Provider>
  );
}

export function useCategorizeSearch() {
  return useContext(SearchContext);
}

export function CategorizeSearchBar() {
  const { searchInput, setSearchInput } = useCategorizeSearch();
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        type="search"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        placeholder="Filter by description, merchant, reference…"
        className="h-9 w-full pl-9 pr-3 text-sm"
      />
    </div>
  );
}
