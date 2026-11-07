(function () {
  'use strict';
  // Core edition does not ship simulated user accounts or SMB shares.
  // The Windows desktop host provides the authoritative snapshot.
  window.SL_DATA = {
    initial: {
      mode: 'offline', page: 'shares', theme: 'light', sidebarOpen: false,
      knowledgeSearch: '', peerMode: 'allowlist', managedEnabled: false,
      firewallEnabled: false, otherRules: false, icmpEnabled: false,
      interface: {}, users: [], shares: [], peers: [], sessions: [], logs: [],
      snapshot: null
    }
  };
})();
