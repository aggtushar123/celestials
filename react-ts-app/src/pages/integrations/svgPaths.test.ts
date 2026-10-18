import { describe, expect, it } from 'vitest';
import source from '../../components/integrations/providerLogos.tsx?raw';

// UI broken-things fix 15: the Slack logo's path had "hv-2.522" (a command
// with no number), which the browser rejects with a console error and
// leaves a corner of the logo undrawn. Every command but Z takes numbers.
describe('Integrations logos', () => {
  const paths = [...source.matchAll(/\bd="([^"]+)"/g)].map((match) => match[1]);

  it('has logo paths to check', () => {
    expect(paths.length).toBeGreaterThan(3);
  });

  it('gives every path command but Z its numbers', () => {
    const broken = paths.filter((d) => /[MLHVCSQTA](?![\s,]*[-+.\d])/i.test(d));
    expect(broken).toEqual([]);
  });
});
