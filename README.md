# Subnet

## What is Subnet?

Subnet is a desktop chat application for talking to nearby users on the same local network.

It uses a LAN connection. When two computers are connected to the same reachable Wi-Fi or Ethernet network, Subnet discovers them and creates a direct connection between them. Chat messages and files are sent directly between the computers.

The current project is an Electron desktop application for macOS. The browser page is currently a UI preview and does not discover or connect to real Subnet users.

## Requirements

- macOS
- Node.js and npm
- Two computers connected to the same reachable LAN for multi-device testing
- Local Network permission enabled for Subnet or the terminal used for development

Install dependencies from the project directory:

```bash
cd /Users/balajee/Documents/projects/Subnet
npm install
```

## Run Subnet locally

The current presence server is not deployed. For the current radar setup, run it locally.

### 1. Start the local presence server

Open the first terminal:

```bash
cd /Users/balajee/Documents/projects/Subnet
npm run presence:start
```

The server listens on port `8787`.

Keep this terminal running while testing. The server stores only temporary online presence information. It does not store chat messages, files, or chat history.

### 2. Start the Subnet desktop app

Open a second terminal:

```bash
cd /Users/balajee/Documents/projects/Subnet
npm run dev
```

The Electron desktop app opens automatically.

Use different terminal to open more subnet windows on the same computer.

The development renderer is also available at:

```text
http://localhost:5173
```

The browser page is not a working web client yet. Use the Electron window to test real discovery, chat, and file transfer.

### 3. Configure the presence server when needed

Subnet tries to discover a local presence server automatically. If it does not find the server, open the Profile page and enter the server address in the realtime radar settings:

```text
ws://SERVER_MAC_IP:8787
```

Example:

```text
ws://10.7.13.223:8787
```

Use the LAN IP address of the computer running the presence server. Do not use `127.0.0.1` on another computer.

### 4. Check that two computers can connect

Run Subnet on both computers. They must be connected to a LAN that allows devices to communicate with each other.

Check the local IP address on macOS:

```bash
networksetup -getinfo Wi-Fi
```

Check whether the other computer's Subnet port is reachable:

```bash
nc -vz OTHER_MAC_IP 50000
```

For example:

```bash
nc -vz 10.7.19.253 50000
```

If the connection succeeds but the users do not appear, check Local Network permission, the macOS firewall, and whether the Wi-Fi network blocks communication between clients.

In Subnet, Profile -> General shows the current local IP address, listening port, file transfer port, discovery status, and connection checks.

## macOS permissions

On the first launch, allow Subnet to find and connect to devices on the local network.

If the app is blocked from discovering users:

1. Open System Settings.
2. Open Privacy & Security.
3. Open Local Network.
4. Enable Subnet.
5. Restart Subnet.

Also check System Settings -> Network -> Firewall. Subnet must be allowed to accept incoming connections, and Block all incoming connections must be disabled for testing.

Camera and microphone permissions are required only for taking photos or recording videos.

## How the system works

Subnet has three main network paths:

1. Local discovery
   - Bonjour discovers Subnet users and rooms on the LAN.
   - UDP multicast and subnet broadcast provide a fallback discovery path.

2. Direct LAN connection
   - Each Electron instance runs a WebSocket control server.
   - The preferred control port is `50000`. If that port is busy, Subnet uses another available port.
   - The connection is made directly from one computer to the other.
   - Chat messages, invitations, room messages, acknowledgements, and conversation events use this connection.

3. File transfer
   - Subnet advertises a separate file transfer port when available.
   - Files are transferred directly over the LAN using binary WebSocket data.
   - Transfer progress, chunk validation, checksums, cancellation, and retry handling are included.
   - If a file transfer port is unavailable, Subnet can fall back to the control connection.

The optional presence server provides temporary radar visibility when Bonjour or UDP discovery is unavailable. It only exchanges discovery metadata and direct LAN connection details; chat messages and files are never relayed through the server.

The presence server filters users by network scope. Users on unrelated networks or different locations are not shown in the same radar scope.

## Features

- LAN user discovery
- Radar view for nearby active users
- Direct one-to-one chat
- Private rooms
- Anonymous rooms
- Room invitations and membership management
- Room closure and room deletion
- Local conversation history
- Message retry after a temporary disconnect
- Message acknowledgements and delivery state
- File and image attachments
- Video capture and video attachments
- Direct LAN file transfer
- File transfer progress and cancellation
- File checksum validation
- Save files and open files in Finder
- Profile name and profile picture
- Preset and custom avatars
- Device name detection
- Light, dark, and system theme options where enabled
- Local Network, camera, and microphone permission status
- Connection diagnostics in the Profile page
- Copyable local IP address, ports, and local user ID
- Optional ephemeral presence server

## Project structure

```text
Subnet/
├── electron/
│   ├── main.ts
│   ├── preload.ts
│   ├── network/
│   │   ├── connection-manager.ts
│   │   ├── peer-connection.ts
│   │   ├── transfer-manager.ts
│   │   ├── protocol.ts
│   │   ├── bonjour-discovery.ts
│   │   ├── udp-discovery.ts
│   │   ├── presence-client.ts
│   │   ├── presence-server-discovery.ts
│   │   └── radar-layout.ts
│   ├── store/
│   │   ├── chat-store.ts
│   │   └── local-identity.ts
│   └── utils/
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/
│   ├── styles/
│   ├── types/
│   └── utils/
├── scripts/
│   ├── dev.mjs
│   ├── presence-server.mjs
│   └── release-mac.sh
├── docs/
│   ├── MACOS_PERMISSIONS.md
│   └── presence-server.md
├── electron-builder.json
├── package.json
└── vite.config.ts
```

### Electron process

`electron/main.ts` starts the desktop application, creates the main window, registers IPC handlers, and connects the user interface to the network and local store.

`electron/preload.ts` exposes the safe `window.subnet` API to the React renderer.

### Network layer

`electron/network/connection-manager.ts` manages local servers, peer connections, discovery, messages, rooms, retries, presence, and file transfers.

`electron/network/bonjour-discovery.ts` implements Bonjour discovery.

`electron/network/udp-discovery.ts` implements multicast and broadcast discovery fallback.

`electron/network/peer-connection.ts` handles the WebSocket protocol for direct peer communication.

`electron/network/transfer-manager.ts` reads and writes files in bounded chunks and tracks transfer progress.

`electron/network/presence-client.ts` connects to the optional presence server.

`electron/network/presence-server-discovery.ts` finds a local presence server through Bonjour.

### User interface

The React interface is in `src/`. Important views include chat, rooms, radar, profile, settings, media capture, file preview, and media viewing.

### Local storage

`electron/store/chat-store.ts` stores local identity, settings, conversations, rooms, messages, avatars, and retryable outgoing messages.

## Useful commands

Start the Electron development app:

```bash
npm run dev
```

Start the local presence server:

```bash
npm run presence:start
```

Run type checks:

```bash
npm run typecheck
```

Run tests:

```bash
npm test
```

Build the application:

```bash
npm run build
```

Build an unsigned universal macOS DMG for testing:

```bash
npm run package:mac:test
```

The DMG is written to the `release/` directory.

## Current limitations

- The presence server is local and is not deployed.
- The current browser page is not a real synchronized web client.
- The Electron app is required for Bonjour, UDP discovery, direct LAN sockets, file access, and native media features.
- Client isolation, guest Wi-Fi rules, VLAN separation, firewalls, and blocked multicast can prevent discovery or direct connections.
- The current presence server is a prototype. It should not be exposed publicly without TLS, authentication, rate limiting, monitoring, and other production controls.

