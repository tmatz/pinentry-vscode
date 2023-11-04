import * as vscode from 'vscode';
import net from 'net';
import fs from 'fs';
import readline from 'node:readline';

const sockFile = "/run/user/1000/pinentry-vscode.sock";

let server!: net.Server;

/**
 * @example
 * ```
 * parseCommand("D foo bar")
 * => ["D", "foo bar"]
 * ```
 */
function parseCommand(line: string): [
	command: string,
	param: string
] {
	const m = line.match(/^([^ ]+)( (.*))?$/);
	if (m === null) {
		return ['', ''];
	}
	return [m[1], m[3] ?? ''];
}

interface AssuanResponse {
	ok(): void;
	err(message?: string): void;
	d(data: string): void;
	end(): void;
	comment(message: string): void;
}

class AssuanResponseImpl implements AssuanResponse {
	#socket: net.Socket;
	constructor(socket: net.Socket) {
		this.#socket = socket;
	}
	ok(): void {
		this.#socket.write("OK\n");
	}
	err(message?: string): void {
		this.#socket.write(
			message === undefined
				? `Err\n`
				: `Err ${message}\n`);
	}
	d(data: string): void {
		this.#socket.write(`D ${data}\n`);
	}
	end(): void {
		this.#socket.write("END\n");
	}
	comment(message: string): void {
		this.#socket.write(`# ${message}\n`);
	}
}

export function activate(_context: vscode.ExtensionContext) {
	console.log("activate");
	if (fs.existsSync(sockFile)) {
		fs.unlinkSync(sockFile);
	}
	server = net.createServer((socket) => {
		console.log('connected');
		const res = new AssuanResponseImpl(socket);
		readline.createInterface(socket)
			.on('line', async (input) => {
				const [command, param] = parseCommand(input.trimStart());
				switch (command) {
					case "":
					case "#":
						break;
					case 'GETPIN':
						const result = await vscode.window.showInputBox({
							title: "Title",
							prompt: "Prompt",
							password: true,
						});
						if (result !== undefined) {
							res.d(result);
						}
						res.end();
						break;
					case 'HELP':
						res.comment("GETPIN");
						res.comment("HELP");
						res.comment("BYE");
						res.ok();
						break;
					case "BYE":
						socket.end();
						break;
					default:
						res.err(`Unexpected ${command}`);
						break;
				}
			});
		socket.on('close', () => {
			console.log('closed');
		});
	});
	server.listen(sockFile, () => {
		console.log("listening");
	});

	console.log("finish activate");
}

export function deactivate() {
	console.log("start deactivate");
	server.close();
	console.log("finish deactivate");
}

