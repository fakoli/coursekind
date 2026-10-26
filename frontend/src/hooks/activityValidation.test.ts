import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useModuleEditorForm } from './useModuleEditorForm';
import { useQuizEditor } from './useQuizEditor';
it('refuses incomplete cards instead of silently deleting a draft', () => {
  const { result } = renderHook(useModuleEditorForm);
  expect(() => result.current.getUpdateData([{ front: 'Draft', back: '' }], [])).toThrow(/Flashcard 1/);
});
it('refuses blank or out-of-range quiz answers', () => {
  const { result } = renderHook(useModuleEditorForm);
  expect(() => result.current.getUpdateData([], [{ question: 'Q', options: ['A',''], correct_index: 0 }])).toThrow(/Question 1/);
  expect(() => result.current.getUpdateData([], [{ question: 'Q', options: ['A','B'], correct_index: 2 }])).toThrow(/Question 1/);
});
it('remaps the correct answer when removing an earlier option and requires reselection when removing the answer', () => {
  const { result } = renderHook(() => useQuizEditor([{ question: 'Q', options: ['A','B','C','D'], correct_index: 2 }]));
  act(() => result.current.removeOption(0, 0));
  expect(result.current.questions[0]).toMatchObject({ options: ['B','C','D'], correct_index: 1 });
  act(() => result.current.removeOption(0, 1));
  expect(result.current.questions[0]).toMatchObject({ options: ['B','D'], correct_index: -1 });
  act(() => result.current.addOption(0));
  expect(result.current.questions[0].options).toEqual(['B','D','']);
});
