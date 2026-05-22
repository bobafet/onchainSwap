import { useReadContract } from "wagmi";
import { GM_ABI, GM_CONTRACT_ADDRESS } from "../constants";

interface GmEntry {
  sender: `0x${string}`;
  timestamp: bigint;
  message: string;
}

function timeAgo(timestamp: bigint): string {
  const seconds = Math.floor(Date.now() / 1000 - Number(timestamp));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// Assign a consistent color to each address
const COLORS = ["#00d4aa", "#818cf8", "#f472b6", "#fb923c", "#a3e635", "#38bdf8"];
function addressColor(addr: string): string {
  const n = parseInt(addr.slice(2, 8), 16);
  return COLORS[n % COLORS.length];
}

interface GmFeedProps {
  refreshKey: number; // bump this to trigger a refetch
}

export function GmFeed({ refreshKey }: GmFeedProps) {
  // useReadContract: reads data from the blockchain (no gas, no wallet needed)
  const { data, isLoading, error, refetch } = useReadContract({
    address: GM_CONTRACT_ADDRESS,
    abi: GM_ABI,
    functionName: "getRecentGms",
    args: [BigInt(50)], // fetch last 50 GMs
    query: { refetchInterval: 15_000 }, // auto-refresh every 15s
  });

  // Also read total GM count
  const { data: total } = useReadContract({
    address: GM_CONTRACT_ADDRESS,
    abi: GM_ABI,
    functionName: "totalGms",
  });

  // Trigger refetch when parent bumps refreshKey
  if (refreshKey > 0) {
    refetch();
  }

  const gms = (data as GmEntry[] | undefined)?.slice().reverse() ?? [];

  return (
    <div>
      {/* Feed header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white">GM Feed</h2>
        {total !== undefined && (
          <span className="text-xs text-slate-500 bg-slate-800/60 px-3 py-1 rounded-full border border-slate-700">
            {total.toString()} total GMs
          </span>
        )}
      </div>

      {/* States */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <svg className="spinner w-8 h-8 border-2 border-[#00d4aa] border-t-transparent rounded-full" viewBox="0 0 24 24" />
        </div>
      )}

      {error && (
        <div className="text-center py-8 text-slate-500">
          <p className="text-2xl mb-2">⚠️</p>
          <p className="text-sm">Could not load GMs — is the contract deployed?</p>
          <p className="text-xs mt-1 font-mono text-slate-600">{GM_CONTRACT_ADDRESS}</p>
        </div>
      )}

      {!isLoading && !error && gms.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <p className="text-4xl mb-3">🌄</p>
          <p className="font-semibold text-slate-400">No GMs yet</p>
          <p className="text-sm mt-1">Be the first to say GM on Arc!</p>
        </div>
      )}

      {/* GM Cards */}
      <div className="space-y-3">
        {gms.map((gm, i) => (
          <div
            key={`${gm.sender}-${gm.timestamp.toString()}-${i}`}
            className="gm-card-enter bg-slate-900/70 border border-white/8 rounded-xl px-5 py-4 flex items-start gap-4 hover:border-white/20 transition-colors"
          >
            {/* Avatar circle */}
            <div
              className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold"
              style={{
                background: `${addressColor(gm.sender)}22`,
                border: `1.5px solid ${addressColor(gm.sender)}55`,
                color: addressColor(gm.sender),
              }}
            >
              {gm.sender.slice(2, 4).toUpperCase()}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <a
                  href={`https://testnet.arcscan.app/address/${gm.sender}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs font-semibold hover:underline"
                  style={{ color: addressColor(gm.sender) }}
                >
                  {shortAddress(gm.sender)}
                </a>
                <span className="text-slate-600 text-xs">·</span>
                <span className="text-slate-500 text-xs">{timeAgo(gm.timestamp)}</span>
              </div>
              <p className="text-slate-200 text-sm leading-relaxed">{gm.message}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
