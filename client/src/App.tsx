import { AppLayout } from "@/pages/Layout";
// import DashboardOverview from "./pages/DashBoard";
import "./App.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, WagmiProvider, createConfig } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";
import { metaMask } from "wagmi/connectors";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Pool from "@/components/pool/Pool";
import CreatePool from "@/components/pool/CreatePool";
import CoWProtocol from "@/components/cow/CoWProtocol";
function App() {
  const client = new QueryClient();
  const config = createConfig({
    ssr: true, // Make sure to enable this for server-side rendering (SSR) applications.
    chains: [mainnet, sepolia],
    connectors: [
      metaMask({
        infuraAPIKey: import.meta.env.VITE_PUBLIC_INFURA_API_KEY,
      }),
    ],
    transports: {
      [mainnet.id]: http(),
      [sepolia.id]: http(),
    },
  });
  return (
    <>
      <WagmiProvider config={config}>
        <QueryClientProvider client={client}>
          <BrowserRouter>
            <AppLayout>
              <Routes>
                <Route path="/" element={<Pool />} />
                <Route path="/create-pool" element={<CreatePool />} />
                <Route path="/leverage" element={<Pool />} />
                <Route path="/cow" element={<CoWProtocol />} />
                <Route path="/cow-protocol" element={<CoWProtocol />} />
              </Routes>
            </AppLayout>
          </BrowserRouter>
        </QueryClientProvider>
      </WagmiProvider>
    </>
  );
}

export default App;
