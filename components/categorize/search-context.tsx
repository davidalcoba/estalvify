"use client";

import { createContext, useContext, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useT } from "@/components/i18n/i18n-provider";

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
  const t = useT();
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        type="search"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        placeholder={t("categorize.searchPlaceholder")}
        className="h-9 w-full pl-9 pr-3 text-sm"
      />
    </div>
  );
}
