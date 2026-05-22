import { useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { arcTestnet } from "./wagmi";
import { parseUnits } from "viem";

const ADDR = (import.meta.env.VITE_CONTRACT_ADDRESS as `0x${string}`) || "0x0000000000000000000000000000000000000000";
const ABI = [
  { name: "logSwap", type: "function", stateMutability: "nonpayable", inputs: [{ name: "fromToken", type: "string" }, { name: "toToken", type: "string" }, { name: "amount", type: "uint256" }, { name: "note", type: "string" }], outputs: [] },
  { name: "getRecentSwaps", type: "function", stateMutability: "view", inputs: [{ name: "count", type: "uint256" }],
    outputs: [{ name: "", type: "tuple[]", components: [{ name: "user", type: "address" }, { name: "fromToken", type: "string" }, { name: "toToken", type: "string" }, { name: "amount", type: "uint256" }, { name: "timestamp", type: "uint256" }, { name: "note", type: "string" }] }] },
  { name: "totalSwaps", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "swapCount", type: "function", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
] as const;

const TOKENS = ["USDC", "EURC", "USYC"];
function timeAgo(ts: bigint) { const s=Math.floor(Date.now()/1000-Number(ts)); if(s<60)return"just now"; if(s<3600)return`${Math.floor(s/60)}m ago`; return`${Math.floor(s/3600)}h ago`; }

export default function App() {
  const { isConnected, address } = useAccount();
  const [from, setFrom] = useState("USDC"); const [to, setTo] = useState("EURC"); const [amount, setAmount] = useState(""); const [note, setNote] = useState(""); const [done, setDone] = useState(false);
  const { data: hash, isPending, writeContract, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const { data: swaps, refetch } = useReadContract({ address: ADDR, abi: ABI, functionName: "getRecentSwaps", args: [BigInt(20)], query: { refetchInterval: 15000 } });
  const { data: total } = useReadContract({ address: ADDR, abi: ABI, functionName: "totalSwaps" });
  const { data: mySwaps } = useReadContract({ address: ADDR, abi: ABI, functionName: "swapCount", args: [address!], query: { enabled: !!address } });
  if (isSuccess && !done) { setDone(true); refetch(); setTimeout(() => setDone(false), 3000); }
  const list = (swaps as any[] | undefined)?.slice().reverse() ?? [];
  const isLoading = isPending || isConfirming;
  const swap = () => { const t = from; setFrom(to); setTo(t); };

  return (
    <div className="min-h-screen bg-[#080b14]">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-150px] left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-[#6366f1]/6 blur-[120px]" />
      </div>
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 sticky top-0 z-50 bg-[#080b14]/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🔄</span>
          <span className="font-bold text-white text-lg">onchain<span className="text-[#6366f1]">Swap</span></span>
          <span className="hidden sm:block text-xs text-slate-500 bg-slate-800/60 px-2 py-0.5 rounded-full border border-slate-700">Arc Testnet</span>
        </div>
        <ConnectButton showBalance={false} chainStatus="icon" accountStatus="avatar" />
      </header>
      <main className="relative z-10 max-w-xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🔄</div>
          <h1 className="text-4xl font-black text-white mb-3">Arc <span className="text-[#6366f1]">Swap</span></h1>
          <p className="text-slate-400 text-sm">Log your token swap intents on-chain. Track Arc DeFi activity.</p>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[{label:"Total Swaps",value:total?.toString()??"—",icon:"🔄"},{label:"Your Swaps",value:mySwaps?.toString()??"—",icon:"✨"},{label:"Tokens",value:"3",icon:"🪙"}].map(s=>(
            <div key={s.label} className="bg-slate-900/60 border border-white/8 rounded-xl px-3 py-3 text-center">
              <div className="text-lg mb-0.5">{s.icon}</div><div className="text-white font-bold text-lg">{s.value}</div><div className="text-slate-500 text-xs mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="bg-gradient-to-br from-slate-900 to-slate-800/50 border border-white/10 rounded-2xl p-6 mb-6 shadow-2xl">
          <h2 className="text-xl font-bold text-white mb-4">Log a Swap 🔄</h2>
          <div className="space-y-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-slate-400 text-xs mb-1 block">From</label>
                <select value={from} onChange={e=>setFrom(e.target.value)} className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#6366f1]/60 transition-all">
                  {TOKENS.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <button onClick={swap} className="mt-4 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-[#6366f1] transition-all">⇄</button>
              <div className="flex-1">
                <label className="text-slate-400 text-xs mb-1 block">To</label>
                <select value={to} onChange={e=>setTo(e.target.value)} className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#6366f1]/60 transition-all">
                  {TOKENS.filter(t=>t!==from).map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Amount</label>
              <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm outline-none focus:border-[#6366f1]/60 transition-all" />
            </div>
            <input value={note} onChange={e=>setNote(e.target.value)} placeholder="Note (optional)" className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm outline-none focus:border-[#6366f1]/60 transition-all" />
          </div>
          {!isConnected?<p className="text-slate-500 text-sm text-center py-2">Connect wallet to log swap</p>
          :done?<div className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[#6366f1]/15 border border-[#6366f1]/40 text-[#6366f1] font-semibold">Swap logged on-chain!</div>
          :<button onClick={()=>writeContract({address:ADDR,abi:ABI,functionName:"logSwap",args:[from,to,parseUnits(amount||"0",6),note]})} disabled={isLoading||!amount||Number(amount)<=0}
              className="w-full py-3 rounded-xl font-bold text-sm bg-[#6366f1] text-white hover:bg-[#818cf8] active:scale-[0.98] disabled:opacity-50 transition-all flex items-center justify-center gap-2">
              {isLoading?<><svg className="spinner w-4 h-4 border-2 border-current border-t-transparent rounded-full" viewBox="0 0 24 24" />{isPending?"Confirm...":"Logging..."}</>:`Log ${from} to ${to}`}
            </button>}
          {error&&<p className="mt-2 text-red-400 text-xs text-center">{error.message?.includes("User rejected")?"Cancelled":error.message?.slice(0,80)}</p>}
        </div>
        <h2 className="text-lg font-bold text-white mb-4">Recent Swaps</h2>
        <div className="space-y-2">
          {list.length===0&&<div className="text-center py-8 text-slate-500"><p className="text-4xl mb-2">🔄</p><p>No swaps logged yet</p></div>}
          {list.map((s:any,i:number)=>(<div key={i} className="bg-slate-900/70 border border-white/8 rounded-xl px-4 py-3 flex items-center gap-3"><span className="text-xl">🔄</span><div className="flex-1"><div className="flex items-center gap-2"><span className="text-[#6366f1] font-bold text-sm">{s.fromToken}</span><span className="text-slate-500">→</span><span className="text-white font-bold text-sm">{s.toToken}</span><span className="text-slate-500 text-xs ml-auto">{timeAgo(s.timestamp)}</span></div><p className="text-slate-600 text-xs font-mono">{s.user.slice(0,6)}...{s.user.slice(-4)}{s.note?` · ${s.note}`:""}</p></div></div>))}
        </div>
        <footer className="mt-12 text-center text-xs text-slate-600">
          <p>Built on <a href="https://arc.network" className="hover:text-slate-400">Arc Network</a> · Chain ID {arcTestnet.id}</p>
        </footer>
      </main>
    </div>
  );
}
