import { useState, useMemo } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useBalance } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { arcTestnet } from "./wagmi";
import { parseEther, parseUnits, formatEther, formatUnits } from "viem";

const DEX_ADDR = (import.meta.env.VITE_CONTRACT_ADDRESS as `0x${string}`) || "0x0000000000000000000000000000000000000000";
const EURC_ADDR = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as `0x${string}`;

const DEX_ABI = [
  { name: "swapUSDCforEURC", type: "function", stateMutability: "payable", inputs: [{ name: "minEURC", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "swapEURCforUSDC", type: "function", stateMutability: "nonpayable", inputs: [{ name: "eurcIn", type: "uint256" }, { name: "minUSDC", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "addLiquidity", type: "function", stateMutability: "payable", inputs: [{ name: "eurcAmount", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "removeLiquidity", type: "function", stateMutability: "nonpayable", inputs: [{ name: "lpAmount", type: "uint256" }], outputs: [{ name: "usdcOut", type: "uint256" }, { name: "eurcOut", type: "uint256" }] },
  { name: "reserveUSDC", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "reserveEURC", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "totalLP", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "lpBalance", type: "function", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "getLPValue", type: "function", stateMutability: "view", inputs: [{ name: "lpAmount", type: "uint256" }], outputs: [{ name: "usdcAmount", type: "uint256" }, { name: "eurcAmount", type: "uint256" }] },
] as const;

const EURC_ABI = [
  { name: "approve", type: "function", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { name: "allowance", type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

// AMM formula (mirrors contract): 0.3% fee
function getAmountOut(amountIn: bigint, rIn: bigint, rOut: bigint): bigint {
  if (rIn === 0n || rOut === 0n || amountIn === 0n) return 0n;
  const amountInWithFee = amountIn * 9970n;
  return (amountInWithFee * rOut) / (rIn * 10000n + amountInWithFee);
}

function fmt(val: bigint, dec: number, digits = 4): string {
  const s = formatUnits(val, dec);
  const n = parseFloat(s);
  if (n === 0) return "0";
  if (n < 0.0001) return "<0.0001";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

type Tab = "swap" | "liquidity";

export default function App() {
  const { isConnected, address } = useAccount();
  const [tab, setTab] = useState<Tab>("swap");
  const [usdcToEurc, setUsdcToEurc] = useState(true);
  const [amountIn, setAmountIn] = useState("");
  const [slippage] = useState(0.5); // 0.5%
  const [addUSDC, setAddUSDC] = useState("");
  const [removeLP, setRemoveLP] = useState("");
  const [txDone, setTxDone] = useState("");

  // Reads
  const refetchOpts = { refetchInterval: 10000 };
  const { data: rUSDC, refetch: refetchPool } = useReadContract({ address: DEX_ADDR, abi: DEX_ABI, functionName: "reserveUSDC", query: refetchOpts });
  const { data: rEURC } = useReadContract({ address: DEX_ADDR, abi: DEX_ABI, functionName: "reserveEURC", query: refetchOpts });
  useReadContract({ address: DEX_ADDR, abi: DEX_ABI, functionName: "totalLP", query: refetchOpts });
  const { data: myLP } = useReadContract({ address: DEX_ADDR, abi: DEX_ABI, functionName: "lpBalance", args: [address!], query: { enabled: !!address, ...refetchOpts } });
  const { data: lpVal } = useReadContract({ address: DEX_ADDR, abi: DEX_ABI, functionName: "getLPValue", args: [myLP ?? 0n], query: { enabled: !!myLP && myLP > 0n } });
  const { data: eurcBalance } = useReadContract({ address: EURC_ADDR, abi: EURC_ABI, functionName: "balanceOf", args: [address!], query: { enabled: !!address, ...refetchOpts } });
  const { data: eurcAllowance, refetch: refetchAllowance } = useReadContract({ address: EURC_ADDR, abi: EURC_ABI, functionName: "allowance", args: [address!, DEX_ADDR], query: { enabled: !!address, ...refetchOpts } });
  const { data: usdcBalance } = useBalance({ address, query: { enabled: !!address, ...refetchOpts } });

  // Derived pool values
  const reserveUSDC = (rUSDC as bigint | undefined) ?? 0n;
  const reserveEURC = (rEURC as bigint | undefined) ?? 0n;
  const hasLiquidity = reserveUSDC > 0n && reserveEURC > 0n;

  const price = useMemo(() => {
    if (!hasLiquidity) return null;
    // USDC/EURC price: how many EURC per 1 USDC
    // reserveUSDC (18 dec), reserveEURC (6 dec)
    // price = (reserveEURC/1e6) / (reserveUSDC/1e18)
    const usdcFloat = Number(formatEther(reserveUSDC));
    const eurcFloat = Number(formatUnits(reserveEURC, 6));
    return { eurcPerUsdc: eurcFloat / usdcFloat, usdcPerEurc: usdcFloat / eurcFloat };
  }, [reserveUSDC, reserveEURC, hasLiquidity]);

  // Swap calculation
  const amountInBig = useMemo(() => {
    if (!amountIn || isNaN(+amountIn) || +amountIn <= 0) return 0n;
    try { return usdcToEurc ? parseEther(amountIn) : parseUnits(amountIn, 6); } catch { return 0n; }
  }, [amountIn, usdcToEurc]);

  const amountOutBig = useMemo(() => {
    if (!hasLiquidity || amountInBig === 0n) return 0n;
    return usdcToEurc
      ? getAmountOut(amountInBig, reserveUSDC, reserveEURC)
      : getAmountOut(amountInBig, reserveEURC, reserveUSDC);
  }, [amountInBig, reserveUSDC, reserveEURC, usdcToEurc, hasLiquidity]);

  const amountOutFormatted = amountOutBig > 0n ? fmt(amountOutBig, usdcToEurc ? 6 : 18) : "—";
  const minOut = amountOutBig > 0n ? amountOutBig * BigInt(Math.floor((100 - slippage) * 10)) / 1000n : 0n;

  // EURC needed for addLiquidity (based on pool ratio)
  const addEURCNeeded = useMemo(() => {
    if (!addUSDC || isNaN(+addUSDC) || +addUSDC <= 0) return 0n;
    try {
      const usdcBig = parseEther(addUSDC);
      if (!hasLiquidity) return 0n; // user sets initial ratio
      return (usdcBig * reserveEURC) / reserveUSDC;
    } catch { return 0n; }
  }, [addUSDC, reserveUSDC, reserveEURC, hasLiquidity]);

  const [addEURCCustom, setAddEURCCustom] = useState("");
  const addEURCBig = hasLiquidity
    ? addEURCNeeded
    : (() => { try { return addEURCCustom ? parseUnits(addEURCCustom, 6) : 0n; } catch { return 0n; } })();

  // Approvals needed — note: !!0n === false so must check !== undefined
  const allowanceBig = (eurcAllowance as bigint | undefined) ?? 0n;
  const needsApproveSwap = !usdcToEurc && eurcAllowance !== undefined && amountInBig > allowanceBig;
  const needsApproveLiq = eurcAllowance !== undefined && addEURCBig > allowanceBig;

  // Write
  const { data: hash, isPending, writeContract, error: writeError, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  if (isSuccess && !txDone) {
    setTxDone(hash ?? "done");
    refetchPool();
    refetchAllowance();
    setTimeout(() => { setTxDone(""); reset(); }, 4000);
  }

  const isLoading = isPending || isConfirming;
  const doSwap = () => {
    if (usdcToEurc) {
      writeContract({ address: DEX_ADDR, abi: DEX_ABI, functionName: "swapUSDCforEURC", args: [minOut], value: amountInBig });
    } else {
      writeContract({ address: DEX_ADDR, abi: DEX_ABI, functionName: "swapEURCforUSDC", args: [amountInBig, minOut] });
    }
  };
  const doApproveSwap = () => writeContract({ address: EURC_ADDR, abi: EURC_ABI, functionName: "approve", args: [DEX_ADDR, parseUnits("1000000", 6)] });
  const doApproveLiq = () => writeContract({ address: EURC_ADDR, abi: EURC_ABI, functionName: "approve", args: [DEX_ADDR, parseUnits("1000000", 6)] });
  const doAddLiquidity = () => {
    const usdcBig = (() => { try { return parseEther(addUSDC); } catch { return 0n; } })();
    writeContract({ address: DEX_ADDR, abi: DEX_ABI, functionName: "addLiquidity", args: [addEURCBig], value: usdcBig });
  };
  const doRemoveLiquidity = () => {
    const lpBig = (() => { try { return parseUnits(removeLP, 0); } catch { return 0n; } })();
    writeContract({ address: DEX_ADDR, abi: DEX_ABI, functionName: "removeLiquidity", args: [lpBig] });
  };

  const lpValueDisplay = lpVal as [bigint, bigint] | undefined;

  return (
    <div className="min-h-screen bg-[#080b14]">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-150px] left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-[#6366f1]/5 blur-[130px]" />
      </div>

      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 sticky top-0 z-50 bg-[#080b14]/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🔄</span>
          <span className="font-bold text-white text-lg">onchain<span className="text-[#6366f1]">Swap</span></span>
          <span className="hidden sm:block text-xs text-slate-500 bg-slate-800/60 px-2 py-0.5 rounded-full border border-slate-700">Arc Testnet</span>
        </div>
        <ConnectButton showBalance={false} chainStatus="icon" accountStatus="avatar" />
      </header>

      <main className="relative z-10 max-w-lg mx-auto px-4 py-8">
        {/* Pool Stats */}
        <div className="bg-slate-900/60 border border-white/8 rounded-2xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-slate-300">USDC / EURC Pool</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${hasLiquidity ? "bg-green-500/15 text-green-400 border border-green-500/30" : "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30"}`}>
              {hasLiquidity ? "Active" : "Empty"}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-white font-bold text-sm">{hasLiquidity ? fmt(reserveUSDC, 18, 2) : "—"}</div>
              <div className="text-slate-500 text-xs mt-0.5">USDC Reserve</div>
            </div>
            <div>
              <div className="text-white font-bold text-sm">{hasLiquidity ? fmt(reserveEURC, 6, 2) : "—"}</div>
              <div className="text-slate-500 text-xs mt-0.5">EURC Reserve</div>
            </div>
            <div>
              <div className="text-[#6366f1] font-bold text-sm">
                {price ? `1 USDC = ${price.eurcPerUsdc.toFixed(4)} EURC` : "—"}
              </div>
              <div className="text-slate-500 text-xs mt-0.5">Price</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-slate-900/60 rounded-xl p-1 mb-6 border border-white/8">
          {(["swap", "liquidity"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t ? "bg-[#6366f1] text-white" : "text-slate-400 hover:text-white"}`}>
              {t === "swap" ? "🔄 Swap" : "💧 Liquidity"}
            </button>
          ))}
        </div>

        {/* SWAP TAB */}
        {tab === "swap" && (
          <div className="bg-gradient-to-br from-slate-900 to-slate-800/50 border border-white/10 rounded-2xl p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Swap</h2>
              <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded-lg">Fee: 0.3%</span>
            </div>

            {/* From */}
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 mb-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-400">You pay</span>
                <span className="text-xs text-slate-500">
                  Bal: {usdcToEurc
                    ? (usdcBalance !== undefined ? fmt(usdcBalance.value, 18, 2) : "—")
                    : (eurcBalance !== undefined ? fmt(eurcBalance as bigint, 6, 2) : "—")}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input type="number" value={amountIn} onChange={e => setAmountIn(e.target.value)} placeholder="0.00"
                  className="flex-1 bg-transparent text-white text-xl font-bold outline-none placeholder-slate-600" />
                <div className="flex items-center gap-2 bg-slate-700 rounded-lg px-3 py-2">
                  <span className="text-lg">{usdcToEurc ? "💵" : "💶"}</span>
                  <span className="text-white font-bold text-sm">{usdcToEurc ? "USDC" : "EURC"}</span>
                </div>
              </div>
            </div>

            {/* Flip */}
            <div className="flex justify-center my-1">
              <button onClick={() => { setUsdcToEurc(v => !v); setAmountIn(""); }}
                className="p-2 rounded-xl bg-slate-800 hover:bg-[#6366f1]/20 border border-slate-700 hover:border-[#6366f1]/40 text-[#6366f1] transition-all text-lg">
                ⇅
              </button>
            </div>

            {/* To */}
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 mb-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-400">You receive</span>
                <span className="text-xs text-slate-500">
                  Bal: {!usdcToEurc
                    ? (usdcBalance !== undefined ? fmt(usdcBalance.value, 18, 2) : "—")
                    : (eurcBalance !== undefined ? fmt(eurcBalance as bigint, 6, 2) : "—")}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 text-white text-xl font-bold text-slate-300">{amountOutFormatted}</div>
                <div className="flex items-center gap-2 bg-slate-700 rounded-lg px-3 py-2">
                  <span className="text-lg">{!usdcToEurc ? "💵" : "💶"}</span>
                  <span className="text-white font-bold text-sm">{!usdcToEurc ? "USDC" : "EURC"}</span>
                </div>
              </div>
            </div>

            {/* Price info */}
            {amountOutBig > 0n && price && (
              <div className="text-xs text-slate-500 mb-4 space-y-1 px-1">
                <div className="flex justify-between">
                  <span>Rate</span>
                  <span className="text-slate-400">
                    {usdcToEurc
                      ? `1 USDC = ${(Number(formatUnits(amountOutBig, 6)) / +amountIn).toFixed(4)} EURC`
                      : `1 EURC = ${(Number(formatEther(amountOutBig)) / +amountIn).toFixed(4)} USDC`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Min received ({slippage}% slippage)</span>
                  <span className="text-slate-400">{fmt(minOut, usdcToEurc ? 6 : 18)} {usdcToEurc ? "EURC" : "USDC"}</span>
                </div>
              </div>
            )}

            {/* Buttons */}
            {!isConnected ? (
              <p className="text-slate-500 text-sm text-center py-2">Connect wallet to swap</p>
            ) : txDone ? (
              <div className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[#6366f1]/15 border border-[#6366f1]/40 text-[#6366f1] font-semibold">
                ✅ Swap successful!
              </div>
            ) : needsApproveSwap ? (
              <button onClick={doApproveSwap} disabled={isLoading}
                className="w-full py-3 rounded-xl font-bold text-sm bg-yellow-500 text-black hover:bg-yellow-400 disabled:opacity-50 transition-all">
                {isLoading ? "Approving..." : "Approve EURC"}
              </button>
            ) : (
              <button onClick={doSwap}
                disabled={isLoading || amountInBig === 0n || !hasLiquidity}
                className="w-full py-3 rounded-xl font-bold text-sm bg-[#6366f1] text-white hover:bg-[#818cf8] active:scale-[0.98] disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                {isLoading
                  ? <><svg className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" viewBox="0 0 24 24" />{isPending ? "Confirm..." : "Swapping..."}</>
                  : !hasLiquidity ? "No liquidity — add some first"
                  : `Swap ${usdcToEurc ? "USDC → EURC" : "EURC → USDC"}`}
              </button>
            )}
            {writeError && (
              <p className="mt-2 text-red-400 text-xs text-center">
                {writeError.message?.includes("User rejected") ? "Cancelled" : writeError.message?.slice(0, 100)}
              </p>
            )}
          </div>
        )}

        {/* LIQUIDITY TAB */}
        {tab === "liquidity" && (
          <div className="space-y-4">
            {/* Your position */}
            {isConnected && myLP !== undefined && myLP > 0n && (
              <div className="bg-gradient-to-br from-[#6366f1]/10 to-slate-900 border border-[#6366f1]/30 rounded-2xl p-4">
                <h3 className="text-sm font-bold text-[#6366f1] mb-3">Your Position</h3>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-white font-bold text-sm">{fmt(myLP as bigint, 0, 0)}</div>
                    <div className="text-slate-500 text-xs">LP Tokens</div>
                  </div>
                  <div>
                    <div className="text-white font-bold text-sm">{lpValueDisplay ? fmt(lpValueDisplay[0], 18, 4) : "—"}</div>
                    <div className="text-slate-500 text-xs">USDC Value</div>
                  </div>
                  <div>
                    <div className="text-white font-bold text-sm">{lpValueDisplay ? fmt(lpValueDisplay[1], 6, 4) : "—"}</div>
                    <div className="text-slate-500 text-xs">EURC Value</div>
                  </div>
                </div>
              </div>
            )}

            {/* Add Liquidity */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800/50 border border-white/10 rounded-2xl p-5">
              <h3 className="text-base font-bold text-white mb-4">Add Liquidity</h3>
              {!hasLiquidity && (
                <div className="mb-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-yellow-400 text-xs">
                  Pool is empty — you're setting the initial price! Enter both amounts to define the USDC/EURC ratio.
                </div>
              )}
              <div className="space-y-3 mb-4">
                <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3">
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>USDC amount</span>
                    <span>Bal: {usdcBalance ? fmt(usdcBalance.value, 18, 2) : "—"}</span>
                  </div>
                  <div className="flex gap-2 items-center">
                    <input type="number" value={addUSDC} onChange={e => setAddUSDC(e.target.value)} placeholder="0.00"
                      className="flex-1 bg-transparent text-white text-lg font-bold outline-none placeholder-slate-600" />
                    <span className="text-white font-bold text-sm bg-slate-700 px-3 py-2 rounded-lg">💵 USDC</span>
                  </div>
                </div>
                <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3">
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>EURC amount {hasLiquidity ? "(auto-calculated)" : "(you set)"}</span>
                    <span>Bal: {eurcBalance !== undefined ? fmt(eurcBalance as bigint, 6, 2) : "—"}</span>
                  </div>
                  <div className="flex gap-2 items-center">
                    {hasLiquidity ? (
                      <div className="flex-1 text-white text-lg font-bold text-slate-300">
                        {addEURCBig > 0n ? fmt(addEURCBig, 6) : "—"}
                      </div>
                    ) : (
                      <input type="number" value={addEURCCustom} onChange={e => setAddEURCCustom(e.target.value)} placeholder="0.00"
                        className="flex-1 bg-transparent text-white text-lg font-bold outline-none placeholder-slate-600" />
                    )}
                    <span className="text-white font-bold text-sm bg-slate-700 px-3 py-2 rounded-lg">💶 EURC</span>
                  </div>
                </div>
              </div>

              {!isConnected ? (
                <p className="text-slate-500 text-sm text-center py-2">Connect wallet</p>
              ) : txDone ? (
                <div className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[#6366f1]/15 border border-[#6366f1]/40 text-[#6366f1] font-semibold">
                  ✅ Liquidity added!
                </div>
              ) : needsApproveLiq ? (
                <button onClick={doApproveLiq} disabled={isLoading}
                  className="w-full py-3 rounded-xl font-bold text-sm bg-yellow-500 text-black hover:bg-yellow-400 disabled:opacity-50 transition-all">
                  {isLoading ? "Approving..." : "Approve EURC"}
                </button>
              ) : (
                <button onClick={doAddLiquidity}
                  disabled={isLoading || !addUSDC || addEURCBig === 0n}
                  className="w-full py-3 rounded-xl font-bold text-sm bg-[#6366f1] text-white hover:bg-[#818cf8] active:scale-[0.98] disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                  {isLoading
                    ? <><svg className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" viewBox="0 0 24 24" />{isPending ? "Confirm..." : "Adding..."}</>
                    : "💧 Add Liquidity"}
                </button>
              )}
            </div>

            {/* Remove Liquidity */}
            {isConnected && myLP !== undefined && myLP > 0n && (
              <div className="bg-gradient-to-br from-slate-900 to-slate-800/50 border border-white/10 rounded-2xl p-5">
                <h3 className="text-base font-bold text-white mb-4">Remove Liquidity</h3>
                <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 mb-4">
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>LP Tokens to remove</span>
                    <span>Max: {fmt(myLP as bigint, 0, 0)}</span>
                  </div>
                  <input type="number" value={removeLP} onChange={e => setRemoveLP(e.target.value)} placeholder="0"
                    className="w-full bg-transparent text-white text-lg font-bold outline-none placeholder-slate-600" />
                </div>
                <button onClick={doRemoveLiquidity}
                  disabled={isLoading || !removeLP || BigInt(removeLP || "0") === 0n}
                  className="w-full py-3 rounded-xl font-bold text-sm bg-red-500/80 text-white hover:bg-red-500 active:scale-[0.98] disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                  {isLoading
                    ? <><svg className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" viewBox="0 0 24 24" />{isPending ? "Confirm..." : "Removing..."}</>
                    : "🔥 Remove Liquidity"}
                </button>
              </div>
            )}
          </div>
        )}

        <footer className="mt-10 text-center text-xs text-slate-600">
          <p>ArcDEX · USDC/EURC AMM · <a href={`https://testnet.arcscan.app/address/${DEX_ADDR}`} target="_blank" rel="noreferrer" className="hover:text-slate-400">{DEX_ADDR.slice(0, 6)}...{DEX_ADDR.slice(-4)}</a> · Chain ID {arcTestnet.id}</p>
        </footer>
      </main>
    </div>
  );
}
