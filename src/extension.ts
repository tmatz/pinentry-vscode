import * as vscode from "vscode";
import net from "net";
import fs from "fs";
import readline from "node:readline";

const channel = vscode.window.createOutputChannel("pinentry-vscode");
const stopCommand = "__stop_server__";

let server: net.Server | null = null;

// const sessionId = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
function log(message: string): void {
  channel.appendLine(`${new Date().toLocaleString()}: ${message}`);
  // fs.appendFileSync("/tmp/pinentry-vscode.txt", `${sessionId}:${new Date().toLocaleString()}: ${message}\n`);
}

/**
 * @example
 * ```
 * parseCommand("D foo bar")
 * => ["D", "foo bar"]
 * ```
 */
function parseCommand(line: string): [command: string, param: string] {
  const m = line.match(/^([^ ]+)( (.*))?$/);
  if (m === null) {
    return ["", ""];
  }
  const command = m[1];
  const param = m[3] ?? "";
  return [command, decodeAssuanString(param)];
}

function encodeAssuanString(str: string): string {
  return str.replaceAll(
    /\r\n%/g,
    (str) => `%${str.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`
  );
}

function decodeAssuanString(str: string): string {
  return str.replaceAll(/%([0-9A-F]{2})/g, (_, code) =>
    String.fromCharCode(Number.parseInt(code, 16))
  );
}

function AssuanResponse(socket: net.Socket) {
  return {
    ok(message?: string): void {
      socket.write(
        message === undefined ? "OK\n" : `OK ${encodeAssuanString(message)}\n`
      );
    },
    err(message?: string): void {
      socket.write(
        message === undefined ? `Err\n` : `Err ${encodeAssuanString(message)}\n`
      );
    },
    d(data: string): void {
      socket.write(`D ${encodeAssuanString(data)}\n`);
    },
    end(): void {
      socket.write("END\n");
    },
    comment(message: string): void {
      socket.write(`# ${encodeAssuanString(message)}\n`);
    },
  };
}

export async function activate(_context: vscode.ExtensionContext) {
  log("start activate");
  vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration("pinentry-vscode.enabled")) {
      startStopServer();
    }
  });
  await startStopServer();
  log("finish activate");
}

export async function deactivate() {
  log("start deactivate");
  await stopServer();
  log("finish deactivate");
}

async function startServer(socketPath: string) {
  log(`starting server...`);
  try {
    if (fs.existsSync(socketPath)) {
      log(`stop old server`);
      try {
        const client = net.createConnection(socketPath);
        client.write(stopCommand);
        client.end();
        await delay(1000);
        if (fs.existsSync(socketPath)) {
          log(`failed stop old server`);
          return;
        }
      } catch {
        log(`unlink socket file forcefully`);
        fs.unlinkSync(socketPath);
      }
    }
    server = net.createServer((socket) => {
      log("connected");
      const res = AssuanResponse(socket);
      let description: string | undefined;
      let prompt: string | undefined;
      res.ok("Pleased to meet you");
      const rl = readline.createInterface(socket);
      rl.on("line", async (input) => {
        if (input === stopCommand) {
          log(`stop_server command received`);
          server?.close();
          return;
        }
        const [command, param] = parseCommand(input.trimStart());
        log(`assuan command: ${command}`);
        switch (command) {
          case "":
          case "#":
            break;
          case "OPTION":
            res.comment("ignored");
            res.ok();
            break;
          case "SETKEYINFO":
            res.comment("ignored");
            res.ok();
            break;
          case "SETDESC":
            description = param;
            res.ok();
            break;
          case "SETPROMPT":
            prompt = param;
            res.ok();
            break;
          case "GETPIN":
            const result = await vscode.window.showInputBox({
              title: description,
              prompt,
              password: true,
            });
            if (result !== undefined) {
              res.d(result);
            }
            res.ok();
            break;
          case "HELP":
            res.comment("GETPIN");
            res.comment("HELP");
            res.comment("BYE");
            res.ok();
            break;
          case "BYE":
            res.ok("closing connection");
            socket.end();
            break;
          default:
            res.err(`Unexpected ${command}`);
            break;
        }
      });
      socket.on('end', () => {
        log("socket ended");
        rl.close();
      });
      socket.on("close", () => {
        log("socket closed");
      });
    });
    server.on("close", () => {
      log("server closed");
      fs.unlinkSync(socketPath);
      server = null;
    });
    server.on("error", (err) => {
      log(`error ${err}`);
    });
    server.maxConnections = 1;
    server.listen({ path: socketPath, exclusive: true }, () => {
      log("listening");
    });
  } catch (error) {
    log(`error: ${error}`);
    server = null;
  }
}

async function stopServer() {
  const _server = server;
  if (_server !== null) {
    log(`stopping server.`);
    await new Promise(resolve => _server.close(resolve));
  }
}

async function startStopServer() {
  await stopServer();
  const config = vscode.workspace.getConfiguration("pinentry-vscode");
  const isEnabled = config.get<boolean>("enabled");
  if (!isEnabled) {
    log(`pinentry-vscode is disabled.`);
    return;
  }
  log(`pinentry-vscode is enabled.`);
  const socketPath = config.get<string>("PINENTRY_VSCODE_SOCKET");
  if (!socketPath) {
    log(`pinentry-vscode.PINENTRY_VSCODE_SOCKET is not set. inactive.`);
    return;
  }
  await startServer(socketPath);
}

function delay(msec: number): Promise<void> {
  return new Promise<void>(resolve => setTimeout(() => resolve(), msec));
}