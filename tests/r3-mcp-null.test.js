import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

describe('review finding R3: the MCP server survives a line that is not a request', () => {
  it('AC-24 R3: a line containing null gets an Invalid Request error, and the next request is still answered', async () => {
    const server = spawn(process.execPath, [fileURLToPath(new URL('../mcp-server/server.js', import.meta.url))], {
      env: { ...process.env, MCP_TOKEN: '', DATABASE_URL: 'postgres://u:p@127.0.0.1:1/none', SESSION_SECRET: 'test-secret' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    server.stdout.on('data', (chunk) => {
      out += chunk;
    });
    server.stdin.write('null\n');
    server.stdin.write('{"jsonrpc":"2.0","id":7,"method":"initialize","params":{}}\n');
    server.stdin.end();

    const code = await new Promise((resolve) => server.on('close', resolve));
    const replies = out.trim().split('\n').map((line) => JSON.parse(line));

    expect(code).toBe(0);
    expect(replies.find((r) => r.id === 7)?.result).toBeDefined();
    expect(replies.find((r) => r.id === null)?.error.code).toBe(-32600);
  });
});
