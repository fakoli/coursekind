import { createContext } from 'react';
export type Politeness = 'polite' | 'assertive';

export interface LiveRegionContextValue {
  announce: (message: string, politeness?: Politeness) => void;
}

export const LiveRegionContext = createContext<LiveRegionContextValue | null>(null);
