# pinentry-vscode

pinentry program for Visual Studio Code.

## Configuration

### VSCode Setting

Settings should be set for workspace.

- `pinentry-vscode.PINENTRY_VSCODE_SOCKET`: socket path that listens for password input requests.
  - for example, `/run/user/1000/pinentry-vscode.sock`

### GPG Agent Setting

Install `socat` program.

```bash
sudo apt update
sudo apt install socat
```

Create shell script.

```bash
echo exec /user/bin/socat stdio unix-connect:/run/user/1000/pinentry-vscode.sock > /path/to/pinentry-vscode
chmod +x /path/to/pinentry-vscode
```

Then, add following line to `~/.gnupg/gpg-agent.conf`

```
pinentry-program /path/to/pinentry-vscode
```
