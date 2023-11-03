import * as vscode from 'vscode';
import net from 'net';
import fs from 'fs';

const sockFile = "/run/user/1000/pinentry-vscode.sock";

let server!: net.Server;

export function activate(context: vscode.ExtensionContext) {
	console.log("activate");
	if (fs.existsSync(sockFile)) {
		fs.unlinkSync(sockFile);
	}
	server = net.createServer((socket) => {
		console.log('connected');
		socket.on('data',
			async (data) => {
				// vscode.window.showInformationMessage("data:" + data);
				socket.write(data);
				socket.end();
				const result = await vscode.window.showInputBox({
					title: "Title",
					prompt: "Prompt",
					//password: true,
				});
				if (result !== undefined) {
					socket.write(result);
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

