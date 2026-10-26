import { useState } from 'react';
import { expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ModuleEditorTabs } from './ModuleEditorTabs';
import type { EditorTab } from '../../hooks/useModuleEditorForm';

it('keeps every editor activity a native button with announced selection when changing activities', () => {
  function Editor() {
    const [active, setActive] = useState<EditorTab>('content');
    return <ModuleEditorTabs activeTab={active} onTabChange={setActive}
      flashcardCount={12} quizQuestionCount={6} />;
  }
  render(<Editor />);
  for (const name of ['Content', 'Flashcards (12)', 'Quiz (6)', 'Sandbox+']) {
    const tab = screen.getByRole('button', { name });
    expect(tab.tagName).toBe('BUTTON');
    tab.focus();
    expect(tab).toHaveFocus();
    fireEvent.click(tab);
    expect(screen.getByRole('button', { pressed: true })).toBe(tab);
  }
});
