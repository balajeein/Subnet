import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

// Browser fallback when previewing in standard browser outside Electron
if (typeof window !== 'undefined' && !(window as any).subnet) {
  (window as any).subnet = {
    getProfile: () =>
      Promise.resolve({
        id: 'local-mac-001',
        name: "balajee's Mac Studio",
        host: '192.168.1.5',
        port: 51234,
      }),
    getNetworkStatus: () =>
      Promise.resolve({ isRunning: true, peerCount: 30, localIp: '192.168.1.5' }),
    getPeers: () => {
      const mockNames = [
        'Alice MacBook Pro',
        'Bob iPhone 16',
        'Charlie Studio',
        'Dana iPad',
        'Elena Mac Mini',
        'Frank Workstation',
        'Grace Air',
        'Henry Laptop',
        'Isla Mac Pro',
        'Jack Desktop',
      ];
      const presets = ['preset-fox', 'preset-cat', 'preset-panda', 'preset-owl', 'preset-wolf'];
      const peers = [];
      for (let i = 1; i <= 30; i++) {
        peers.push({
          id: `mock-peer-${String(i).padStart(2, '0')}`,
          name: `${mockNames[(i - 1) % mockNames.length]} #${i}`,
          host: `192.168.1.${100 + i}`,
          port: 51234 + i,
          lastSeen: Date.now(),
          avatar: {
            avatarType: 'preset' as const,
            avatarValue: presets[(i - 1) % presets.length],
          },
        });
      }
      return Promise.resolve(peers);
    },
    getConversations: () => Promise.resolve([]),
    getRooms: () => Promise.resolve([]),
    getDiscoveredAnonymousRooms: () => Promise.resolve([]),
    getSettings: () =>
      Promise.resolve({
        avatarType: 'preset',
        avatarValue: 'preset-wolf',
        defaultAnonymousNickname: 'Falcon',
      }),
  };
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
