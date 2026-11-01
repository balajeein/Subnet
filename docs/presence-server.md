# Subnet realtime radar presence

Subnet can use an optional, ephemeral WebSocket service to keep the radar
updated when Bonjour or UDP multicast is unavailable.

## Start a local presence service

From the project root:

```sh
npm run presence:start
```

The service listens on port `8787` by default. On each Mac, open Profile →
Realtime radar and enter:

```text
ws://<presence-server-ip>:8787
```

Use the server Mac's LAN address, not `127.0.0.1`, when another Mac connects.
For example, if the server Mac is `10.7.13.223`, enter
`ws://10.7.13.223:8787` on both clients. The server must be reachable by every
client and its port must be allowed by the host firewall.

## What goes through the service

The service keeps only short-lived presence records in memory: user ID, display
name, avatar metadata, current LAN endpoint, and a network-scope hint. Clients
send heartbeats every 15 seconds and records expire after 45 seconds without a
heartbeat. Restarting the service removes all online presence.

Chat messages, room data, attachments, and chat history do not go through this
service. When two users advertise the same local subnet scope, the service can
share their direct LAN endpoint so the existing WebSocket chat path is used.
Users on different scopes can still appear on the radar, but this version does
not relay their chat traffic; a direct candidate/relay path is required for
cross-network conversations.

## Deployment notes

For a campus-wide or internet-reachable service, deploy the script on a host
with a stable address and put it behind TLS, then configure a `wss://` URL.
This prototype has no account authentication, rate limiting, or persistent
storage, so it should not be exposed publicly without adding those controls.

Leaving the field empty disables server presence and preserves the existing
Bonjour/UDP discovery behavior.
