import { describe, expect, it } from 'vitest';
import mermaid from 'mermaid';

describe('installed Mermaid dependency compatibility', () => {
  it('parses the flowchart syntax used in authored lessons', async () => {
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
    const parsed = await mermaid.parse('flowchart LR\n  Lesson[Read lesson] --> Practice[Practice]\n  Practice --> Review[Review]');
    expect(parsed).toMatchObject({ diagramType: 'flowchart-v2' });
  });

  it('rejects malformed diagram syntax instead of treating it as usable content', async () => {
    await expect(mermaid.parse('flowchart LR\n  A --> [')).rejects.toThrow();
  });
});
