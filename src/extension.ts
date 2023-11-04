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

function AssuanResponse(socket: net.Socket) {
	return {
		ok(): void {
			socket.write("OK\n");
		},
		err(message?: string): void {
			socket.write(
				message === undefined
					? `Err\n`
					: `Err ${message}\n`);
		},
		d(data: string): void {
			socket.write(`D ${data}\n`);
		},
		end(): void {
			socket.write("END\n");
		},
		comment(message: string): void {
			socket.write(`# ${message}\n`);
		}
	};
}

export function activate(_context: vscode.ExtensionContext) {
	console.log("activate");
	if (fs.existsSync(sockFile)) {
		fs.unlinkSync(sockFile);
	}
	server = net.createServer((socket) => {
		console.log('connected');
		const res = AssuanResponse(socket);
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

