import { useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { GM_ABI, GM_CONTRACT_ADDRESS } from "../constants";

interface SendGmProps {
  onSuccess: () => void; // called after a GM lands on chain so feed refreshes
}

export function SendGm({ onSuccess }: SendGmProps) {
  const { isConnected } = useAccount();
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  // writeContract: sends a transaction to our GM contract
  const { data: txHash, isPending, writeContract, error } = useWriteContract();

  // waitForTransactionReceipt: waits for the tx to be confirmed on chain
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // When the tx is confirmed, notify parent and show success state
  if (isSuccess && !sent) {
    setSent(true);
    onSuccess();
    setTimeout(() => setSent(false), 3000);
  }

  function handleSendGm() {
    writeContract({
      address: GM_CONTRACT_ADDRESS,
      abi: GM_ABI,
      functionName: "sendGm",
      args: [message.trim()],
    });
    setMessage("");
  }

  const isLoading = isPending || isConfirming;

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800/50 border border-white/10 rounded-2xl p-6 shadow-2xl">
      <h2 className="text-xl font-bold text-white mb-1">Say GM ☀️</h2>
      <p className="text-slate-400 text-sm mb-5">
        Your message is stored on the Arc blockchain — forever.
      </p>

      {/* Custom message input */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && isConnected && !isLoading && handleSendGm()}
          placeholder="Add a custom GM message... (optional)"
          maxLength={120}
          className="flex-1 bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm outline-none focus:border-[#00d4aa]/60 focus:ring-1 focus:ring-[#00d4aa]/30 transition-all"
        />
      </div>

      {/* Send button */}
      {!isConnected ? (
        <p className="text-slate-500 text-sm text-center py-2">
          Connect your wallet above to say GM
        </p>
      ) : sent ? (
        <div className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[#00d4aa]/15 border border-[#00d4aa]/40 text-[#00d4aa] font-semibold">
          <span>✅</span>
          <span>GM sent on-chain!</span>
        </div>
      ) : (
        <button
          onClick={handleSendGm}
          disabled={isLoading}
          className="w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2
            bg-[#00d4aa] text-[#080b14] hover:bg-[#00f0c0] active:scale-[0.98]
            disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#00d4aa]"
        >
          {isLoading ? (
            <>
              <svg className="spinner w-4 h-4 border-2 border-current border-t-transparent rounded-full" viewBox="0 0 24 24" />
              {isPending ? "Confirm in wallet…" : "Confirming on chain…"}
            </>
          ) : (
            <>
              <span>🌅</span>
              Say GM on Arc
            </>
          )}
        </button>
      )}

      {/* Error message */}
      {error && (
        <p className="mt-3 text-red-400 text-xs text-center">
          {error.message?.includes("User rejected")
            ? "Transaction cancelled"
            : "Error: " + (error.message?.slice(0, 80) || "unknown error")}
        </p>
      )}

      {/* Explorer link */}
      {txHash && (
        <p className="mt-3 text-center text-xs text-slate-500">
          Tx:{" "}
          <a
            href={`https://testnet.arcscan.app/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#00d4aa] hover:underline font-mono"
          >
            {txHash.slice(0, 10)}…{txHash.slice(-8)}
          </a>
        </p>
      )}
    </div>
  );
}
