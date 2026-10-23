/// <reference types="bun" />
import { expect, spyOn, test } from 'bun:test';

function cursorResponse(entries: unknown[]) {
  return new Response([
    { baton: null },
    ...entries,
    { type: 'step_begin', step: 1, cols: [] },
    { type: 'step_end', step: 1, affected_row_count: 0 },
  ].map(entry => JSON.stringify(entry)).join('\n') + '\n');
}

test('serverless SDK preserves the shared client execution contract', async () => {
  const fetchMock = spyOn(globalThis, 'fetch');
  const previousUrl = process.env.TURSO_DATABASE_URL;
  const previousToken = process.env.TURSO_AUTH_TOKEN;
  process.env.TURSO_DATABASE_URL = 'libsql://sdk-test.example.invalid';
  process.env.TURSO_AUTH_TOKEN = 'sdk-test-token';

  try {
    // No SQL or network activity is allowed during module initialization.
    fetchMock.mockRejectedValue(new Error('Unexpected network request'));
    const { turso } = await import('../src/lib/db/client');
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(cursorResponse([
      { type: 'step_begin', step: 0, cols: [{ name: 'id', decltype: 'TEXT' }, { name: 'count', decltype: 'INTEGER' }] },
      { type: 'row', row: [{ type: 'text', value: 'user-1' }, { type: 'integer', value: '3' }] },
      { type: 'step_end', step: 0, affected_row_count: 0 },
    ]));
    const result = await turso.execute({ sql: 'SELECT id, count FROM users WHERE id = ?', args: ['user-1'] });
    expect(result.columns).toEqual(['id', 'count']);
    expect(result.rows[0].id).toBe('user-1');
    expect(result.rows[0][0]).toBe('user-1');
    expect(result.rows[0].count).toBe(3);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://sdk-test.example.invalid/v3/cursor');
    expect(new Headers(options?.headers).get('authorization')).toBe('Bearer sdk-test-token');
    expect(JSON.parse(String(options?.body)).batch.steps[0].stmt.args).toEqual([{ type: 'text', value: 'user-1' }]);

    fetchMock.mockResolvedValueOnce(cursorResponse([
      { type: 'step_begin', step: 0, cols: [] },
      { type: 'step_end', step: 0, affected_row_count: 1, last_insert_rowid: '42' },
    ]));
    const write = await turso.execute('INSERT INTO users (id) VALUES (?)', ['user-2']);
    expect(write.rowsAffected).toBe(1);
    expect(write.lastInsertRowid).toBe(BigInt(42));
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).batch.steps[0].stmt.args).toEqual([{ type: 'text', value: 'user-2' }]);

    fetchMock.mockResolvedValueOnce(cursorResponse([
      { type: 'step_error', step: 0, error: { code: 'SQLITE_CONSTRAINT_UNIQUE', message: 'Duplicate user' } },
    ]));
    await expect(turso.execute('INSERT INTO users (id) VALUES (?)', ['user-2'])).rejects.toMatchObject({
      code: 'SQLITE_CONSTRAINT', extendedCode: 'SQLITE_CONSTRAINT_UNIQUE',
    });

    // A slow request must not block another request on an SDK-global lock.
    let releaseFirst!: (response: Response) => void;
    const pending = new Promise<Response>(resolve => { releaseFirst = resolve; });
    const emptyResult = () => cursorResponse([
      { type: 'step_begin', step: 0, cols: [] },
      { type: 'step_end', step: 0, affected_row_count: 0 },
    ]);
    const callsBeforeConcurrent = fetchMock.mock.calls.length;
    fetchMock.mockReturnValueOnce(pending);
    fetchMock.mockResolvedValueOnce(emptyResult());
    const first = turso.execute('SELECT 1');
    const second = turso.execute('SELECT 2');
    try {
      await Promise.resolve();
      await Promise.resolve();
      expect(fetchMock).toHaveBeenCalledTimes(callsBeforeConcurrent + 2);
      await second;
    } finally {
      releaseFirst(emptyResult());
      await Promise.all([first, second]);
    }
  } finally {
    fetchMock.mockRestore();
    if (previousUrl === undefined) delete process.env.TURSO_DATABASE_URL;
    else process.env.TURSO_DATABASE_URL = previousUrl;
    if (previousToken === undefined) delete process.env.TURSO_AUTH_TOKEN;
    else process.env.TURSO_AUTH_TOKEN = previousToken;
  }
});
