import { Buffer } from "buffer";
window.Buffer = Buffer;
import React from "react";
import ReactDOM from "react-dom/client";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import App from "./App";
import { SOLANA_NETWORK, SOLANA_RPC_URL } from "./config";

import "./index.css";
import "@solana/wallet-adapter-react-ui/styles.css";

const wallets = [
  new SolflareWalletAdapter({ network: SOLANA_NETWORK }),
];

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ConnectionProvider endpoint={SOLANA_RPC_URL}>
      <WalletProvider wallets={wallets}>
        <WalletModalProvider>
          <App />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  </React.StrictMode>
);
