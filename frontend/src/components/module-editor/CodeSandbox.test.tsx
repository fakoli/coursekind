import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { CodeSandbox } from './CodeSandbox';
vi.mock('../../services/codeExecution', () => ({ executeCode: async () => ({ success: true, output: '5', executionTime: 1 }) }));
it('keeps first-run output when saved practice code arrives from progress', async () => {
  const sandbox = { language: 'javascript' as const, starter_code: 'console.log(2+3)' };
  const { rerender } = render(<CodeSandbox sandbox={sandbox} />);
  fireEvent.click(screen.getByRole('button', { name: 'Run Code' }));
  await screen.findByText('5');
  rerender(<CodeSandbox sandbox={sandbox} savedCode={sandbox.starter_code} />);
  await waitFor(() => expect(screen.getByText('5')).toBeInTheDocument());
});
