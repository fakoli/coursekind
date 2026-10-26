import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import mermaid from 'mermaid';
import { MarkdownRenderer } from './MarkdownRenderer';

vi.mock('./AuthContext', () => ({ useAuthContext: () => ({ user: { id: 'reader' }, isLoading: false }) }));

afterEach(cleanup);

it('strips executable shared HTML, unsafe links and CSS while retaining benign Markdown', () => {
  const { container } = render(<MarkdownRenderer content={`# Safe heading

| Input | Output |
| --- | --- |
| 2 + 3 | 5 |

[Safe link](https://example.com)

<strong>Allowed emphasis</strong>
<a href="javascript:alert(document.cookie)" onclick="alert(1)">Unsafe link</a>
<img alt="Untrusted image" src="https://example.com/image.png" onerror="alert(1)" />
<iframe srcdoc="<script>alert(1)</script>"></iframe>
<script>alert(1)</script>
<style>body { display:none }</style>
<div style="position:fixed;inset:0" onmouseover="alert(1)">Untrusted style</div>

\`\`\`javascript
console.log(5);
\`\`\``} />);
  expect(screen.getByRole('heading', { name: 'Safe heading' })).toBeInTheDocument();
  expect(screen.getByRole('table')).toHaveTextContent('2 + 3');
  expect(screen.getByRole('link', { name: 'Safe link' })).toHaveAttribute('href', 'https://example.com');
  expect(screen.getByText('Allowed emphasis').tagName).toBe('STRONG');
  expect(screen.getByText('Unsafe link')).not.toHaveAttribute('href');
  expect(screen.getByAltText('Untrusted image')).not.toHaveAttribute('onerror');
  expect(screen.getByText('Untrusted style')).not.toHaveAttribute('style');
  expect(container.querySelector('script, iframe, style, [onclick], [onmouseover]')).toBeNull();
  expect(container.textContent).toContain('console.log(5);');
});

it('diagram directives cannot downgrade strict security or inject DOMPurify config', async () => {
  await mermaid.parse(`%%{init: {"securityLevel":"loose","secure":[],"htmlLabels":true,"dompurifyConfig":{"ADD_TAGS":["script"]}}}%%
flowchart LR
  A[Read] --> B[Practice]
  click A "javascript:alert(1)"`);
  const config = mermaid.mermaidAPI.getConfig();
  expect(config.securityLevel).toBe('strict');
  expect(config.htmlLabels).toBe(false);
  expect(config.secure).toContain('dompurifyConfig');
  expect(config.dompurifyConfig).toBeUndefined();
});
