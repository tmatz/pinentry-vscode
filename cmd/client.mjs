import net from "net";
const socketFile = "/run/user/1000/pinentry-vscode.sock";
const socket = net.createConnection(socketFile);
process.stdin.pipe(socket);
socket.pipe(process.stdout);
