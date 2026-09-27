const { spawn } = require('child_process');
const readline = require('readline');

class PencilClient {
  constructor() {
    this.proc = spawn('C:\\Program Files\\Pen\\resources\\app.asar.unpacked\\out\\mcp-server-windows-x64.exe', ['--app', 'desktop']);
    this.rl = readline.createInterface({ input: this.proc.stdout });
    this.id = 1;
    this.pending = new Map();

    this.rl.on('line', (line) => {
      try {
        const msg = JSON.parse(line);
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        }
      } catch (err) {
        // ignore
      }
    });

    this.proc.stderr.on('data', (d) => {
      // debug
    });
  }

  async send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  async init() {
    await this.send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'antigravity-harness', version: '1.0' }
    });
    this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n');
  }

  async call(toolName, args = {}) {
    const res = await this.send('tools/call', { name: toolName, arguments: args });
    return res;
  }

  close() {
    this.proc.kill();
  }
}

module.exports = { PencilClient };

if (require.main === module) {
  (async () => {
    const client = new PencilClient();
    await client.init();
    const skill = await client.call('read_skill', {});
    console.log(skill.content[0].text);
    client.close();
  })();
}
