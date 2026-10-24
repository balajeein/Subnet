# macOS Local Network Permissions & Troubleshooting Guide

Subnet uses Bonjour (mDNS) and direct WebSockets over your local Wi-Fi or Ethernet network. It requires zero internet access and zero cloud servers.

Beginning with macOS 14 (Sonoma) and macOS 15 (Sequoia), Apple enforces strict **Local Network Privacy Controls** for desktop applications.

---

### 1. Declared Entitlements & Info.plist Keys

When Subnet is packaged as a macOS application (via `electron-builder.json`), the following entries are embedded in `Info.plist`:

```xml
<key>NSLocalNetworkUsageDescription</key>
<string>Subnet uses your local network to discover and connect with nearby devices without internet access.</string>

<key>NSBonjourServices</key>
<array>
  <string>_subnet._tcp</string>
</array>
```

* **`NSLocalNetworkUsageDescription`**: Displayed to the user in the macOS system prompt when the app attempts to listen or broadcast on the local subnet.
* **`NSBonjourServices`**: Explicitly registers the `_subnet._tcp` service type with macOS mDNS responder.

---

### 2. Development Mode vs. Packaged Mode

* **In Development (`npm run dev`)**:
  Electron runs as a child process of your terminal emulator (Terminal, iTerm2, Ghostty, VS Code). macOS associates the network operations with the **parent terminal**. If your terminal already has Local Network access granted, you may not see a prompt. If your terminal is blocked, Bonjour multicasting and WebSocket binding will fail silently or throw `EACCES` / `EPERM`.

* **In Packaged App (`.dmg` / `.app`)**:
  macOS will present a system authorization modal on first launch asking:
  > *"Subnet would like to find and connect to devices on your local network."*
  You must click **Allow** for peer discovery and messaging to work.

---

### 3. Troubleshooting Peer Discovery Issues

If two instances of Subnet running on the same network do not discover each other, check the following:

#### A. Check System Local Network Privacy
1. Open **System Settings** → **Privacy & Security** → **Local Network**.
2. Verify that **Subnet** (or your Terminal app if running `npm run dev`) is toggled **ON**.
3. If toggled off, enable it and restart Subnet.

#### B. Check macOS Application Firewall
1. Open **System Settings** → **Network** → **Firewall**.
2. If the Firewall is turned ON, click **Options...**.
3. Ensure **"Block all incoming connections"** is **UNCHECKED**.
4. If Subnet is listed, ensure it is set to **"Allow incoming connections"**.

#### C. Router "Client Isolation" / "AP Isolation"
* Many public or guest Wi-Fi networks (hotels, airports, coffee shops) and some home mesh routers enable **Client Isolation** (also called **AP Isolation** or **Guest Mode**).
* Client Isolation blocks all peer-to-peer traffic (both mDNS multicast on `224.0.0.251:5353` and direct TCP sockets) between devices on the same Wi-Fi network.
* **Solution**: Test on a private Wi-Fi network where Client Isolation is disabled, or use macOS Internet Sharing / Wi-Fi Hotspot between the two devices.

#### D. Resetting Local Network Permissions for Testing
If you denied permission previously or need to test the prompt again, run in your Terminal:
```bash
# Reset Local Network permissions for Terminal
tccutil reset LocalNetwork com.apple.Terminal
```
*(Replace `com.apple.Terminal` with your specific terminal bundle ID if using iTerm or Ghostty).*
