# pinentry-vscode

pinentry program for Visual Studio Code.

## Configuration

### VSCode Setting

Settings should be set for workspace.

- `pinentry-vscode.PINENTRY_VSCODE_SOCKET`: socket path that listens for password input requests.
  - for example, `/run/user/1000/pinentry-vscode.sock`

This value should also be set as environment variable `PINENTRY_VSCODE_SOCKET` for terminal.

```json
{
  "settings": {
    "terminal.integrated.env.linux": {
      "PINENTRY_VSCODE_SOCKET": "/run/user/1000/pinentry-vscode.sock",
```

### GPG Setting

Install `socat` program.

```bash
sudo apt update
sudo apt install socat
```

Create shell script.

`/path/to/pinentry-vscode`

```bash
#!/bin/sh
if [ x"$PINENTRY_VSCODE_SOCKET" = x ]; then
  echo "PINENTRY_VSCODE_SOCKET environment variable is not set" >&2
  exit 1
fi
exec socat stdio "$PINENTRY_VSCODE_SOCKET"
```

```bash
chmod +x /path/to/pinentry-vscode
```

Then, add following line to `~/.gnupg/gpg-agent.conf`

```
pinentry-program /path/to/pinentry-vscode
```
