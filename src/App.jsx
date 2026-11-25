import { Suspense, lazy } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { MotionConfig, motion } from "framer-motion";
import { VERIFIER_WALLET } from "./config";
import { useCommitments } from "./hooks/useCommitments";

import Header from "./components/Header";
import StatusToast from "./components/StatusToast";

const AnimatedBackground = lazy(() => import("./components/AnimatedBackground"));
const HeroSection = lazy(() => import("./components/HeroSection"));
const CommitmentForm = lazy(() => import("./components/CommitmentForm"));
const ReminderList = lazy(() => import("./components/ReminderList"));
const VerifierDashboard = lazy(() => import("./components/VerifierDashboard"));

function ViewFallback() {
  return (
    <div
      className="min-h-[45vh] flex items-center justify-center"
      role="status"
      aria-label="Loading view"
    >
      <div className="w-8 h-8 rounded-full border-2 border-indigo-400/30 border-t-indigo-400 animate-spin" />
    </div>
  );
}

function App() {
  const walletContext = useWallet();
  const { publicKey, connected } = walletContext;
  const {
    commitments,
    loadingData,
    submitting,
    formResetKey,
    toast,
    notify,
    loadMyCommitments,
    handleCommit,
    analyzeGoal,
  } = useCommitments(walletContext);

  const isVerifier = publicKey && publicKey.toBase58() === VERIFIER_WALLET;

  return (
    <MotionConfig reducedMotion="user">
      <a
        href="#app-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[200] focus:px-4 focus:py-2 focus:rounded-xl focus:bg-indigo-600 focus:text-white focus:font-semibold focus:text-sm"
      >
        Skip to main content
      </a>

      <Suspense
        fallback={
          <div className="fixed inset-0 z-0 pointer-events-none bg-[#080c16]" />
        }
      >
        <AnimatedBackground />
      </Suspense>

      <div className="relative z-10 min-h-screen text-slate-200">
        <Header />

        <main
          id="app-content"
          tabIndex={-1}
          className="max-w-7xl mx-auto px-6 pb-24 pt-2 outline-none"
        >
          <StatusToast toast={toast} />

          <Suspense fallback={<ViewFallback />}>
            {!connected ? (
              <HeroSection />
            ) : isVerifier ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                id="verify"
                className="max-w-5xl mx-auto"
              >
                <VerifierDashboard
                  walletAddress={publicKey.toBase58()}
                  onNotify={notify}
                />
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start"
              >
                <div
                  id="commitments"
                  className="lg:col-span-5 lg:sticky lg:top-32 max-h-[calc(100vh-120px)] overflow-y-auto pr-1 no-scrollbar"
                >
                  <CommitmentForm
                    key={formResetKey}
                    onCommit={handleCommit}
                    onAnalyzeGoal={analyzeGoal}
                    loading={submitting}
                  />
                </div>

                <div id="my-commitments" className="lg:col-span-7 w-full">
                  <ReminderList
                    reminders={commitments}
                    loading={loadingData}
                    onRefresh={loadMyCommitments}
                    onNotify={notify}
                  />
                </div>
              </motion.div>
            )}
          </Suspense>
        </main>
      </div>
    </MotionConfig>
  );
}

export default App;
