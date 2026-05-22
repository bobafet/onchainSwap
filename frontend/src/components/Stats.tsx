import { useAccount, useReadContract } from "wagmi";
import { GM_ABI, GM_CONTRACT_ADDRESS } from "../constants";

export function Stats() {
  const { address, isConnected } = useAccount();

  const { data: total } = useReadContract({
    address: GM_CONTRACT_ADDRESS,
    abi: GM_ABI,
    functionName: "totalGms",
    query: { refetchInterval: 15_000 },
  });

  const { data: myCount } = useReadContract({
    address: GM_CONTRACT_ADDRESS,
    abi: GM_ABI,
    functionName: "gmCount",
    args: [address!],
    query: { enabled: isConnected && !!address, refetchInterval: 15_000 },
  });

  const stats = [
    {
      label: "Total GMs",
      value: total !== undefined ? total.toString() : "—",
      icon: "🌅",
    },
    {
      label: "Your GMs",
      value: isConnected && myCount !== undefined ? myCount.toString() : "—",
      icon: "✨",
    },
    {
      label: "Network",
      value: "Arc Testnet",
      icon: "⛓️",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-3 mb-6">
      {stats.map((s) => (
        <div
          key={s.label}
          className="bg-slate-900/60 border border-white/8 rounded-xl px-4 py-3 text-center"
        >
          <div className="text-lg mb-0.5">{s.icon}</div>
          <div className="text-white font-bold text-lg leading-tight">{s.value}</div>
          <div className="text-slate-500 text-xs mt-0.5">{s.label}</div>
        </div>
      ))}
    </div>
  );
}
