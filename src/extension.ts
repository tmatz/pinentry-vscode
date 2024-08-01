import * as vscode from "vscode";
import net from "net";
import fs from "fs";
import readline from "node:readline";

const channel = vscode.window.createOutputChannel("pinentry-vscode");

let server: net.Server | null = null;
let lastSocketPath: string | null = null;

function log(message: string): void {
  channel.appendLine(`${new Date().toLocaleString()}: ${message}`);
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

export function activate(_context: vscode.ExtensionContext) {
  log("start activate");
  vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration("pinentry-vscode.enabled")) {
      startStopServer();
    }
  });
  startStopServer();
  log("finish activate");
}

export function deactivate() {
  log("start deactivate");
  stopServer();
  log("finish deactivate");
}

async function startServer(socketPath: string) {
  log(`pinentry-vscode starting server...`);
  try {
    lastSocketPath = socketPath;
    if (fs.existsSync(socketPath)) {
      log(`remove socket.`);
      await fs.promises.unlink(socketPath);
    }
    let intervalId: ReturnType<typeof setInterval>| null = null;
    server = net.createServer((socket) => {
      log("connected");
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      const res = AssuanResponse(socket);
      let description: string | undefined;
      let prompt: string | undefined;
      res.ok("Pleased to meet you");
      const rl = readline.createInterface(socket);
      rl.on("line", async (input) => {
        const [command, param] = parseCommand(input.trimStart());
        log(`pinentry-vscode command: ${command}`);
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
        intervalId = setInterval(async () => {
          if (!fs.existsSync(socketPath)) {
            log("socket file lost. server restarting...");
            if (intervalId !== null) {
              clearInterval(intervalId);
              intervalId = null;
            }
            await stopServer();
            await startServer(socketPath);
          }
        }, 1000);
      });
    });
    server.on("close", () => {
      log("server closed");
      server = null;
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      if (fs.existsSync(socketPath)) {
        log(`remove socket.`);
        fs.unlinkSync(socketPath);
      }
      setTimeout(startStopServer, 1000);
    });
    server.on("error", (err) => {
      log(`error ${err}`);
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    });
    server.maxConnections = 1;
    server.listen({ path: socketPath, exclusive: true }, () => {
      log("listening");
      intervalId = setInterval(async () => {
        if (!fs.existsSync(socketPath)) {
          log("socket file lost. server restarting...");
          if (intervalId !== null) {
            clearInterval(intervalId);
            intervalId = null;
          }
          await stopServer();
          await startServer(socketPath);
        }
      }, 1000);
    });
  } catch (error) {
    log(`pinentry-vscode error: ${error}`);
    await stopServer();
  }
}

async function stopServer() {
  const lastServer = server;
  server = null;
  lastSocketPath = null;
  if (lastServer !== null) {
    log(`pinentry-vscode stopping server.`);
    await new Promise(resolve => lastServer.close(resolve));
  }
}

async function startStopServer() {
  const config = vscode.workspace.getConfiguration("pinentry-vscode");
  const isEnabled = config.get<boolean>("enabled");
  if (isEnabled) {
    log(`pinentry-vscode is enabled.`);
    const socketPath = config.get<string>("PINENTRY_VSCODE_SOCKET");
    if (server !== null && socketPath === lastSocketPath) {
      // already started
    } else if (!socketPath) {
      await stopServer();
      log(`pinentry-vscode.PINENTRY_VSCODE_SOCKET is not set. inactive.`);
    } else {
      await startServer(socketPath);
    }
  } else {
    log(`pinentry-vscode is disabled.`);
    if (server !== null) {
      await stopServer();
    }
  }
}
