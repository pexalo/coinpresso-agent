"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Campaign } from "@/lib/clients";

interface CampaignState {
  campaigns: Campaign[];
  /** null means "all campaigns". */
  selected: Campaign | null;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}

const Ctx = createContext<CampaignState | null>(null);

/**
 * Which of the agency's end clients the operator is currently working on.
 *
 * Persisted per client-ref so switching between Pexalo clients does not carry a
 * campaign selection across. In HQ this belongs in the URL as well, so a link to
 * a filtered queue is shareable — noted in the handoff spec.
 */
export function CampaignProvider({
  clientRef,
  campaigns,
  children,
}: {
  clientRef: string;
  campaigns: Campaign[];
  children: React.ReactNode;
}) {
  const storageKey = `pexalo.campaign.${clientRef}`;
  const [selectedId, setSelectedIdState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let initial: string | null = null;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === "__all__") initial = null;
      else if (stored && campaigns.some((c) => c.id === stored)) initial = stored;
      else initial = campaigns.find((c) => c.status === "active")?.id ?? null;
    } catch {
      initial = campaigns.find((c) => c.status === "active")?.id ?? null;
    }
    setSelectedIdState(initial);
    setHydrated(true);
    // Campaign list is static per client; keyed by clientRef is enough.
  }, [storageKey, campaigns]);

  const setSelectedId = useCallback(
    (id: string | null) => {
      setSelectedIdState(id);
      try {
        window.localStorage.setItem(storageKey, id ?? "__all__");
      } catch {
        // Private browsing, blocked storage — selection just does not persist.
      }
    },
    [storageKey]
  );

  const value = useMemo<CampaignState>(
    () => ({
      campaigns,
      selectedId: hydrated ? selectedId : null,
      selected: campaigns.find((c) => c.id === selectedId) ?? null,
      setSelectedId,
    }),
    [campaigns, selectedId, hydrated, setSelectedId]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCampaign(): CampaignState {
  const v = useContext(Ctx);
  if (!v) {
    return {
      campaigns: [],
      selected: null,
      selectedId: null,
      setSelectedId: () => {},
    };
  }
  return v;
}
