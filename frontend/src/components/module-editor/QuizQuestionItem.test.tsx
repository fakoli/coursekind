import { expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuizQuestionItem } from './QuizQuestionItem';

it('offers a native radio control for each correct answer', () => {
  const update = vi.fn();
  render(<QuizQuestionItem index={0} question={{ question: 'Q', options: ['A', 'B'], correct_index: 0 }} onUpdateQuestion={update} onUpdateOption={() => {}} onRemove={() => {}} />);
  const answer = screen.getByRole('radio', { name: 'Correct answer B' });
  expect(answer.tagName).toBe('INPUT');
  fireEvent.click(answer);
  expect(update).toHaveBeenCalledWith('correct_index', 1);
});
