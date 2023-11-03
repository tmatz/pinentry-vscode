import * as vscode from 'vscode';
import net from 'net';
import fs from 'fs';

const sockFile = "/run/user/1000/pinentry-vscode.sock";

let server!: net.Server;

/** `"\nFIRST\nSECOND\n"` => `["FIRST", "\n", "SECOND", "\n"]` */
function splitLine(input: string): string[] {
	return input.split(/([\r\n]+)/).filter(line => line !== '');
}

function pickFirstLine(lines: string[]): [first: string, lines: string[]] {
	const firstIndex = lines.findIndex(line => !/^[\r\n]/.test(line));
	if (firstIndex === -1) {
		return ["", []];
	}
	if (firstIndex + 1 === lines.length) {
		return ["", lines.slice(firstIndex)];
	}
	return [lines[firstIndex], lines.slice(firstIndex + 1)];
}

function parseCommand(line: string): [command: string, param: string] {
	const m = line.match(/^([^ ]+)( (.*))?$/);
	if (m === null) {
		return ['', ''];
	}
	return [m[1], m[3] ?? ''];
}

interface Assuan {
	ok(): void;
	err(message?: string): void;
	d(data: string): void;
	end(): void;
	comment(message: string): void;
}

class PinEntryServer {
	async getPin(res: Assuan): Promise<void> {
		const result = await vscode.window.showInputBox({
			title: "Title",
			prompt: "Prompt",
			password: true,
		});
		if (result !== undefined) {
			res.d(result);
		}
		res.end();
	}
	help(res: Assuan): void {
		res.comment("GETPIN");
		res.comment("HELP");
		res.comment("BYE");
		res.ok();
	}
}

class AssuanImpl implements Assuan {
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
				: `Err${message === undefined}`);
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
	console.log(`xxx ${process.cwd()}`);
	if (fs.existsSync(sockFile)) {
		fs.unlinkSync(sockFile);
	}
	const pinEntry = new PinEntryServer();
	server = net.createServer((socket) => {
		console.log('connected');
		const res = new AssuanImpl(socket);
		let lines: string[] = [];
		socket.on('data',
			async (data) => {
				if (data.length === 0) { return; }
				lines = [
					...lines,
					...splitLine(data.toString()),
				];
				while (true) {
					const [firstLine, nextLines] = pickFirstLine(lines);
					lines = nextLines;
					if (firstLine === '') {
						break;
					}
					const [command, _param] = parseCommand(firstLine);
					switch (command) {
						case 'GETPIN':
							pinEntry.getPin(res);
							break;
						case 'HELP':
							pinEntry.help(res);
							break;
						case "#":
							break;
						case "BYE":
							socket.end();
							break;
						default:
							res.err(`Unexpected ${command}`);
							break;
					}
				}
			});
		socket.on('close', () => {
			console.log('closed');
		});
	});
	server.listen(sockFile, () => {
		console.log("listening");
	});

	// context.subscriptions.push({ dispose() { server.close() } });
	console.log("finish activate");
}

export function deactivate() {
	console.log("start deactivate");
	server.close();
	console.log("finish deactivate");
}

