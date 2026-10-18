import { describe, expect, it } from 'vitest';
import { mockReactFlow } from './reactFlow';

describe('mockReactFlow', () => {
  it('parses a transform scale below 1 (a leading zero) and above 1', () => {
    mockReactFlow();
    const DOMMatrixReadOnly = (globalThis as unknown as { DOMMatrixReadOnly: new (transform?: string) => { m22: number } }).DOMMatrixReadOnly;
    expect(new DOMMatrixReadOnly('matrix(0.75, 0, 0, 0.75, 0, 0) scale(0.75)').m22).toBe(0.75);
    expect(new DOMMatrixReadOnly('scale(1.5)').m22).toBe(1.5);
  });

  it('falls back to 1 when there is no scale', () => {
    mockReactFlow();
    const DOMMatrixReadOnly = (globalThis as unknown as { DOMMatrixReadOnly: new (transform?: string) => { m22: number } }).DOMMatrixReadOnly;
    expect(new DOMMatrixReadOnly().m22).toBe(1);
    expect(new DOMMatrixReadOnly('none').m22).toBe(1);
  });
});
