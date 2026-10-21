import { describe, it, expect, vi } from 'vitest';
import { createPool } from '../src/db/pg-repo.js';

describe('database pool', () => {
  it('AC-32: a dropped database connection is logged and does not stop the process', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const pool = createPool('postgres://user:pass@127.0.0.1:1/none');
    expect(() => pool.emit('error', new Error('terminating connection due to administrator command'))).not.toThrow();
    expect(log).toHaveBeenCalledWith('Database connection lost:', 'terminating connection due to administrator command');
    log.mockRestore();
    await pool.end();
  });
});
