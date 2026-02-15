// ----------------------------------------------------------------
// Type augmentation for the Midnight DApp Connector API
// The Lace wallet injects `window.midnight.mnLace`
// Ref: https://docs.midnight.network/develop/reference/midnight-api/dapp-connector
// Uses: @midnight-ntwrk/dapp-connector-api v4.0.0
// ----------------------------------------------------------------

declare global {
  interface Window {
    midnight?: {
      mnLace: {
        rdns: string;
        name: string;
        icon: string;
        apiVersion: string;
        connect(networkId: string): Promise<any>;
      };
      [key: string]: any;
    };
  }
}

export {};
