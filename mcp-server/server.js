// Lab 1: a minimal MCP server over stdio, no SDK.
// Reads one JSON-RPC message per line from stdin and writes one reply per line to stdout.
// Logs go to stderr only: stdout is the protocol, so one stray print there breaks the host.
//
// Exercise 3 on: the project tools below call the same service functions as the HTTP routes,
// and they act as the user whose session token is in MCP_TOKEN.
import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_SPECS, createTools, requireMcpUser } from '../src/mcp/tools.js';
import { createServices } from '../src/container.js';
import { AppError } from '../src/errors.js';

const PROTOCOL_VERSION = '2025-11-25';
const SERVER_INFO = { name: 'lectures', version: '0.1.0' };
const HERE = path.dirname(fileURLToPath(import.meta.url));

// A protocol error is a broken message (unknown tool, bad arguments, unknown method).
// It is answered with an error object, never with a result.
class ProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// Exercise 1 tools.
const LECTURE_TOOLS = [
  {
    name: 'find_lecture',
    description:
      'Return the title and topics of one course lecture by its number, 1 to 10. Use it when asked what a lecture covers. Returns one line of text.',
    inputSchema: {
      type: 'object',
      properties: { number: { type: 'integer', description: 'Lecture number, 1 to 10' } },
      required: ['number'],
    },
  },
  {
    name: 'list_files',
    description:
      'List the file names in the mcp-server folder of this lab, one per line. Use it when asked which files make up the MCP server. Returns one line per file.',
    inputSchema: { type: 'object', properties: {} },
  },
];

function findLecture(args) {
  if (!Number.isInteger(args.number)) {
    throw new ProtocolError(-32602, 'Invalid arguments: number must be an integer');
  }
  const lectures = JSON.parse(fs.readFileSync(path.join(HERE, 'lectures.json'), 'utf8'));
  const lecture = lectures.find((l) => l.number === args.number);
  if (!lecture) {
    // The tool ran and failed: a normal result the model can read and retry.
    return {
      content: [{ type: 'text', text: `There is no lecture ${args.number}. The course has lectures 1 to 10.` }],
      isError: true,
    };
  }
  return {
    content: [
      { type: 'text', text: `Lecture ${lecture.number}: ${lecture.title}. Topics: ${lecture.topics}` },
    ],
    isError: false,
  };
}

function listFiles() {
  const names = fs.readdirSync(HERE).filter((name) => !name.startsWith('.')).sort();
  return { content: [{ type: 'text', text: names.join('\n') }], isError: false };
}

const LECTURE_HANDLERS = { find_lecture: findLecture, list_files: listFiles };

// Exercise 3 tools. The services are built on first use, so the Exercise 1 check runs without a database.
let services = null;

const textResult = (text, isError = false) => ({ content: [{ type: 'text', text }], isError });

async function callProjectTool(name, args) {
  const spec = TOOL_SPECS.find((t) => t.name === name);
  const parsed = spec.schema.safeParse(args);
  if (!parsed.success) {
    throw new ProtocolError(-32602, `Invalid arguments for ${name}: ${parsed.error.issues[0].message}`);
  }
  try {
    services ??= createServices();
    const user = await requireMcpUser(services.auth, process.env.MCP_TOKEN);
    const tool = createTools(services).find((t) => t.name === name);
    return textResult(JSON.stringify(await tool.run(user, parsed.data), null, 2));
  } catch (err) {
    // A rule refused the action, or no valid token: a readable result the model can act on.
    if (err instanceof AppError) return textResult(err.message, true);
    throw err;
  }
}

// Only name, description and inputSchema go to the client; the run functions stay on the server.
const TOOLS = [
  ...LECTURE_TOOLS,
  ...TOOL_SPECS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
];

// Returns the value of the result field for a request. Throws ProtocolError for broken requests.
async function handle(method, params) {
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: params.protocolVersion ?? PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      };
    case 'tools/list':
      return { tools: TOOLS };
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === params.name);
      if (!tool) throw new ProtocolError(-32602, `Unknown tool: ${params.name}`);
      if (LECTURE_HANDLERS[tool.name]) return LECTURE_HANDLERS[tool.name](params.arguments ?? {});
      return callProjectTool(tool.name, params.arguments ?? {});
    }
    default:
      throw new ProtocolError(-32601, `Unknown method: ${method}`);
  }
}

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

async function onLine(line) {
  if (line.trim() === '') return;
  console.error('got: ' + line);

  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }

  // A notification has no id and gets no reply, whatever its method.
  if (msg.id === undefined) return;

  try {
    const result = await handle(msg.method, msg.params ?? {});
    send({ jsonrpc: '2.0', id: msg.id, result });
  } catch (err) {
    const code = err instanceof ProtocolError ? err.code : -32603;
    send({ jsonrpc: '2.0', id: msg.id, error: { code, message: err.message } });
  }
}

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  onLine(line);
});
