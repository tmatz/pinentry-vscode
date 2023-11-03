import net from 'net';

const socketFile = '/run/user/1000/pinentry-vscode.sock';

const socket = net.createConnection(socketFile);
socket.on('data', (data) => {
    console.log('received:', data);
});
socket.write('test');
socket.end();