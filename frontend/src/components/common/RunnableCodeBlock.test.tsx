import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RunnableCodeBlock } from './RunnableCodeBlock';
import { executeCode } from '../../services/codeExecution';
vi.mock('../../services/codeExecution', () => ({ executeCode: vi.fn(async () => ({ success: true, output: '7', executionTime: 1 })) }));
afterEach(cleanup);
it('edits an embedded snippet locally, runs current text and resets it', async () => {
  render(<RunnableCodeBlock code="console.log(5)" language="javascript" />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit code' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Example code' }), { target: { value: 'console.log(7)' } });
  fireEvent.click(screen.getByRole('button', { name: 'Run code' }));
  await waitFor(() => expect(executeCode).toHaveBeenCalledWith('console.log(7)', 'javascript', expect.any(AbortSignal)));
  await screen.findByText('7');
  fireEvent.click(screen.getByRole('button', { name: 'Reset code' }));
  expect(screen.getByRole('textbox', { name: 'Example code' })).toHaveValue('console.log(5)');
});

it('keeps local edits and output when its markdown parent rerenders', async () => {
  const { MarkdownRenderer } = await import('./MarkdownRenderer');
  const { rerender } = render(<MarkdownRenderer content={'```javascript\nconsole.log(5)\n```'} enableRunnable />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit code' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Example code' }), { target: { value: 'console.log(7)' } });
  rerender(<MarkdownRenderer content={'```javascript\nconsole.log(5)\n```'} enableRunnable />);
  expect(screen.getByRole('textbox', { name: 'Example code' })).toHaveValue('console.log(7)');
});
