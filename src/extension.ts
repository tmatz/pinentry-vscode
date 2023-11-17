import * as vscode from "vscode";
import net from "net";
import fs from "fs";
import readline from "node:readline";

let server: net.Server | undefined;

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
  console.log("activate");

  const config = vscode.workspace.getConfiguration("pinentry-vscode");
  const socketPath = config.get<string>("PINENTRY_VSCODE_SOCKET");
  if (socketPath === undefined) {
    console.log(`pinentry-vscode.PINENTRY_VSCODE_SOCKET is not set. inactive.`);
    return;
  }
  if (fs.existsSync(socketPath)) {
    fs.unlinkSync(socketPath);
  }
  server = net.createServer((socket) => {
    console.log("connected");
    const res = AssuanResponse(socket);
    let description: string | undefined;
    let prompt: string | undefined;
    res.ok("Pleased to meet you");
    readline.createInterface(socket).on("line", async (input) => {
      const [command, param] = parseCommand(input.trimStart());
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
    socket.on("close", () => {
      console.log("closed");
    });
  });
  server.maxConnections = 1;
  server.listen({ path: socketPath, exclusive: true }, () => {
    console.log("listening");
  });

  console.log("finish activate");
}

export function deactivate() {
  console.log("start deactivate");
  server?.close();
  server = undefined;
  console.log("finish deactivate");
}
