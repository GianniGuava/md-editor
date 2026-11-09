import { describe, expect, it } from 'vitest';
import { claimInstance, type OwnerRecord } from './instance';

/** The owner check that stops a copy iOS froze in the background (D-35, scan A-F2). */

const memoryOwner = (): OwnerRecord & { value?: string } => {
  const rec: OwnerRecord & { value?: string } = {
    get: async () => rec.value,
    set: async (id) => void (rec.value = id),
  };
  return rec;
};

describe('claimInstance', () => {
  it('owns the record once claimed and may write', async () => {
    const owner = memoryOwner();
    const a = await claimInstance(owner);
    expect(owner.value).toBe(a.id);
    expect(await a.mayWrite()).toBe(true);
    expect(a.isActive()).toBe(true);
  });

  it('stops writing for good once a newer copy has claimed the record', async () => {
    const owner = memoryOwner();
    const a = await claimInstance(owner);
    let lost = 0;
    a.onLost(() => lost++);
    const b = await claimInstance(owner);
    expect(await a.mayWrite()).toBe(false);
    expect(a.isActive()).toBe(false);
    expect(lost).toBe(1);
    expect(await b.mayWrite()).toBe(true);
    // Even if the record were to point back at it, a stopped copy stays stopped.
    owner.value = a.id;
    expect(await a.mayWrite()).toBe(false);
  });
});
