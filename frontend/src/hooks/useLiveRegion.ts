import { useContext } from 'react';
import { LiveRegionContext } from '../components/common/LiveRegionContext';

export function useLiveRegion() {
  const context = useContext(LiveRegionContext);
  if (!context) {
    throw new Error('useLiveRegion must be used within a LiveRegionProvider');
  }
  return context;
}
