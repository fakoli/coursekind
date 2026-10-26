import { useState, useCallback } from 'react';
import { moveItem, updateItem, removeItem, appendItem } from '../utils/listHelpers';
import type { ModuleSummary } from '../types';

export interface ModuleOutline {
  id: string;
  title: string;
  description: string;
}

export function useModuleOutlines() {
  const [outlines, setOutlines] = useState<ModuleOutline[]>([]);

  const addOutline = useCallback(() => {
    const newOutline: ModuleOutline = {
      id: `new-${crypto.randomUUID()}`,
      title: `Module ${outlines.length + 1}`,
      description: '',
    };
    setOutlines((prev) => appendItem(prev, newOutline));
  }, [outlines.length]);

  const updateOutline = useCallback((index: number, field: keyof ModuleOutline, value: string) => {
    setOutlines((prev) => updateItem(prev, index, { [field]: value }));
  }, []);

  const removeOutline = useCallback((index: number) => {
    setOutlines((prev) => removeItem(prev, index));
  }, []);

  const moveOutline = useCallback((index: number, direction: 'up' | 'down') => {
    setOutlines((prev) => moveItem(prev, index, direction));
  }, []);

  const populateFromModules = useCallback((modules: ModuleSummary[]) => {
    setOutlines(
      modules.map((m) => ({
        id: m.id,
        title: m.title,
        description: m.description || '',
      }))
    );
  }, []);

  const replaceOutlines = useCallback((newOutlines: ModuleOutline[]) => {
    setOutlines(newOutlines);
  }, []);

  const appendOutlines = useCallback((newOutlines: ModuleOutline[]) => {
    setOutlines((prev) => [...prev, ...newOutlines]);
  }, []);

  const clearOutlines = useCallback(() => {
    setOutlines([]);
  }, []);

  return {
    outlines,
    addOutline,
    updateOutline,
    removeOutline,
    moveOutline,
    populateFromModules,
    replaceOutlines,
    appendOutlines,
    clearOutlines,
  };
}
