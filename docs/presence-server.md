# Subnet realtime radar presence

Subnet can use an optional, ephemeral WebSocket service to keep the radar
updated when Bonjour or UDP multicast is unavailable.

## Start a local presence service

From the project root:

```sh
npm run presence:start
```

The service listens on port `8787` by default and advertises itself over
Bonjour as `_subnet-presence._tcp`. Subnet clients with an empty presence URL
will find this local server automatically.

For a manually configured client, open Profile → Realtime radar and enter:

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

The radar is scoped to the local network: a client receives radar entries only
from peers with the same normalized subnet scope. Direct LAN endpoints are also
shared only within that scope. Users connected through different campus VLANs
or different locations are therefore not shown to one another by this service.

Chat messages, room data, attachments, and chat history do not go through this
service. When two users advertise the same local subnet scope, the service can
share their direct LAN endpoint so the existing WebSocket chat path is used.
Users on different scopes are not shown by this radar service and would require
a separate direct candidate/relay path for cross-network conversations.

## Deployment notes

For a campus-wide or internet-reachable service, deploy the script on a host
with a stable address and put it behind TLS, then configure a `wss://` URL.
This prototype has no account authentication, rate limiting, or persistent
storage, so it should not be exposed publicly without adding those controls.

Leaving the field empty enables automatic local presence-server discovery and
preserves the existing Bonjour/UDP peer discovery behavior when no presence
server is found. A manually entered URL takes precedence over automatic
discovery.
