import { useState, useMemo } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useBalance } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { arcTestnet } from "./wagmi";
import { parseEther, parseUnits, formatEther, formatUnits, isAddress } from "viem";

const DEX_ADDR = (import.meta.env.VITE_CONTRACT_ADDRESS as `0x${string}`) || "0x0000000000000000000000000000000000000000";

const DEX_ABI = [
  { name: "swapUSDCforToken", type: "function", stateMutability: "payable", inputs: [{ name: "token", type: "address" }, { name: "minOut", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "swapTokenForUSDC", type: "function", stateMutability: "nonpayable", inputs: [{ name: "token", type: "address" }, { name: "tokenIn", type: "uint256" }, { name: "minUSDC", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "addLiquidity", type: "function", stateMutability: "payable", inputs: [{ name: "token", type: "address" }, { name: "tokenAmount", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "removeLiquidity", type: "function", stateMutability: "nonpayable", inputs: [{ name: "token", type: "address" }, { name: "lpAmount", type: "uint256" }], outputs: [{ name: "usdcOut", type: "uint256" }, { name: "tokenOut", type: "uint256" }] },
  { name: "getPool", type: "function", stateMutability: "view", inputs: [{ name: "token", type: "address" }], outputs: [{ name: "resUSDC", type: "uint256" }, { name: "resToken", type: "uint256" }, { name: "lp", type: "uint256" }] },
  { name: "getLPValue", type: "function", stateMutability: "view", inputs: [{ name: "token", type: "address" }, { name: "lpAmount", type: "uint256" }], outputs: [{ name: "usdcAmount", type: "uint256" }, { name: "tokenAmount", type: "uint256" }] },
  { name: "lpBalance", type: "function", stateMutability: "view", inputs: [{ name: "", type: "address" }, { name: "", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "getAmountOut", type: "function", stateMutability: "pure", inputs: [{ name: "amountIn", type: "uint256" }, { name: "rIn", type: "uint256" }, { name: "rOut", type: "uint256" }], outputs: [{ type: "uint256" }] },
] as const;

const ERC20_ABI = [
  { name: "approve", type: "function", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { name: "allowance", type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

// Known tokens
const KNOWN_TOKENS: { address: `0x${string}`; symbol: string; decimals: number; icon: string }[] = [
  { address: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a", symbol: "EURC", decimals: 6, icon: "💶" },
  { address: "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF", symbol: "cirBTC", decimals: 8, icon: "₿" },
];

function getAmountOutLocal(amountIn: bigint, rIn: bigint, rOut: bigint): bigint {
  if (rIn === 0n || rOut === 0n || amountIn === 0n) return 0n;
  const fee = amountIn * 9970n;
  return (fee * rOut) / (rIn * 10000n + fee);
}

function fmt(val: bigint, dec: number, digits = 4): string {
  if (val === 0n) return "0";
  const n = parseFloat(formatUnits(val, dec));
  if (n === 0) return "0";
  // Small numbers: use 4 significant figures to avoid rounding to "0"
  if (n < 0.001) return parseFloat(n.toPrecision(4)).toString();
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function fmtShare(lpUser: bigint, lpTotal: bigint): string {
  if (lpTotal === 0n) return "0%";
  const pct = Number(lpUser * 10000n / lpTotal) / 100;
  return pct < 0.01 ? "<0.01%" : `${pct.toFixed(2)}%`;
}

type Tab = "swap" | "liquidity";
type TxType = "" | "approve" | "swap" | "addLiquidity" | "removeLiquidity";

export default function App() {
  const { isConnected, address } = useAccount();
  const [tab, setTab] = useState<Tab>("swap");
  const [usdcToToken, setUsdcToToken] = useState(true);
  const [amountIn, setAmountIn] = useState("");
  const [addUSDC, setAddUSDC] = useState("");
  const [addTokenCustom, setAddTokenCustom] = useState("");
  const [removePct, setRemovePct] = useState(0); // 0-100%
  const [txDone, setTxDone] = useState<TxType>("");
  const [importAddr, setImportAddr] = useState("");
  const [showImport, setShowImport] = useState(false);

  // Token selection
  const [selectedToken, setSelectedToken] = useState(KNOWN_TOKENS[0]);
  const [customTokens, setCustomTokens] = useState<typeof KNOWN_TOKENS>([]);
  const allTokens = [...KNOWN_TOKENS, ...customTokens];

  // Import token reads
  const importAddrClean = (isAddress(importAddr) ? importAddr : "0x0000000000000000000000000000000000000000") as `0x${string}`;
  const { data: importSymbol } = useReadContract({ address: importAddrClean, abi: ERC20_ABI, functionName: "symbol", query: { enabled: isAddress(importAddr) } });
  const { data: importDecimals } = useReadContract({ address: importAddrClean, abi: ERC20_ABI, functionName: "decimals", query: { enabled: isAddress(importAddr) } });

  const tokenAddr = selectedToken.address;
  const tokenDec = selectedToken.decimals;
  const tokenIcon = selectedToken.icon;
  const tokenSymbol = selectedToken.symbol;

  const refOpts = { refetchInterval: 8000 };

  // Pool data
  const { data: poolData, refetch: refetchPool } = useReadContract({ address: DEX_ADDR, abi: DEX_ABI, functionName: "getPool", args: [tokenAddr], query: refOpts });
  const pool = poolData as [bigint, bigint, bigint] | undefined;
  const reserveUSDC = pool?.[0] ?? 0n;
  const reserveToken = pool?.[1] ?? 0n;
  const hasLiquidity = reserveUSDC > 0n && reserveToken > 0n;

  // Balances
  const { data: usdcBal } = useBalance({ address, query: { enabled: !!address, ...refOpts } });
  const { data: tokenBal } = useReadContract({ address: tokenAddr, abi: ERC20_ABI, functionName: "balanceOf", args: [address!], query: { enabled: !!address, ...refOpts } });
  const { data: allowance, refetch: refetchAllowance } = useReadContract({ address: tokenAddr, abi: ERC20_ABI, functionName: "allowance", args: [address!, DEX_ADDR], query: { enabled: !!address, ...refOpts } });
  const { data: myLP } = useReadContract({ address: DEX_ADDR, abi: DEX_ABI, functionName: "lpBalance", args: [tokenAddr, address!], query: { enabled: !!address, ...refOpts } });
  const { data: lpVal } = useReadContract({ address: DEX_ADDR, abi: DEX_ABI, functionName: "getLPValue", args: [tokenAddr, myLP ?? 0n], query: { enabled: !!myLP || myLP === 0n } });
  const myLPBigTemp = (myLP as bigint | undefined) ?? 0n;
  const removeLPBigTemp = myLPBigTemp > 0n && removePct > 0 ? myLPBigTemp * BigInt(removePct) / 100n : 0n;
  const { data: removePreview } = useReadContract({ address: DEX_ADDR, abi: DEX_ABI, functionName: "getLPValue", args: [tokenAddr, removeLPBigTemp], query: { enabled: removeLPBigTemp > 0n } });

  const allowanceBig = (allowance as bigint | undefined) ?? 0n;
  const myLPBig = (myLP as bigint | undefined) ?? 0n;
  const lpValData = lpVal as [bigint, bigint] | undefined;
  const totalLPBig = pool?.[2] ?? 0n;
  const removeLPBig = myLPBig > 0n ? myLPBig * BigInt(removePct) / 100n : 0n;

  // Price
  const price = useMemo(() => {
    if (!hasLiquidity) return null;
    const usdcF = parseFloat(formatEther(reserveUSDC));
    const tokF = parseFloat(formatUnits(reserveToken, tokenDec));
    return { tokPerUsdc: tokF / usdcF, usdcPerTok: usdcF / tokF };
  }, [reserveUSDC, reserveToken, hasLiquidity, tokenDec]);

  // Swap calc
  const amountInBig = useMemo(() => {
    if (!amountIn || isNaN(+amountIn) || +amountIn <= 0) return 0n;
    try { return usdcToToken ? parseEther(amountIn) : parseUnits(amountIn, tokenDec); } catch { return 0n; }
  }, [amountIn, usdcToToken, tokenDec]);

  const amountOutBig = useMemo(() => {
    if (!hasLiquidity || amountInBig === 0n) return 0n;
    return usdcToToken
      ? getAmountOutLocal(amountInBig, reserveUSDC, reserveToken)
      : getAmountOutLocal(amountInBig, reserveToken, reserveUSDC);
  }, [amountInBig, reserveUSDC, reserveToken, usdcToToken, hasLiquidity]);

  const minOut = amountOutBig > 0n ? amountOutBig * 9950n / 10000n : 0n; // 0.5% slippage

  // Add liquidity calc
  const addUSDCBig = useMemo(() => { try { return addUSDC ? parseEther(addUSDC) : 0n; } catch { return 0n; } }, [addUSDC]);
  const addTokenNeeded = useMemo(() => {
    if (!hasLiquidity || addUSDCBig === 0n) return 0n;
    return (addUSDCBig * reserveToken) / reserveUSDC;
  }, [addUSDC, addUSDCBig, reserveUSDC, reserveToken, hasLiquidity]);
  const addTokenBig = hasLiquidity
    ? addTokenNeeded
    : (() => { try { return addTokenCustom ? parseUnits(addTokenCustom, tokenDec) : 0n; } catch { return 0n; } })();

  // Approval checks
  const needsApproveSwap = !usdcToToken && allowance !== undefined && amountInBig > allowanceBig;
  const needsApproveLiq = allowance !== undefined && addTokenBig > allowanceBig;

  // Balance helpers & validation (must come AFTER amountInBig / addUSDCBig / addTokenBig are declared)
  const usdcBalBig = usdcBal?.value ?? 0n;
  const tokenBalBig = (tokenBal as bigint | undefined) ?? 0n;

  const addTokenTooSmall = hasLiquidity && addUSDCBig > 0n && addTokenNeeded === 0n;
  const addUSDCInsufficient = addUSDCBig > 0n && usdcBal !== undefined && addUSDCBig > usdcBalBig;
  const addTokenInsufficient = addTokenBig > 0n && tokenBal !== undefined && addTokenBig > tokenBalBig;
  const addLiqError = addUSDCInsufficient ? "Insufficient USDC balance"
    : addTokenTooSmall ? `Increase USDC amount — too small to require any ${tokenSymbol}`
    : addTokenInsufficient ? `Insufficient ${tokenSymbol} balance`
    : "";

  const swapInsufficientBal = amountInBig > 0n && (
    (usdcToToken && usdcBal !== undefined && amountInBig > usdcBalBig) ||
    (!usdcToToken && tokenBal !== undefined && amountInBig > tokenBalBig)
  );
  const swapBalError = swapInsufficientBal
    ? `Insufficient ${usdcToToken ? "USDC" : tokenSymbol} balance`
    : "";

  // Write
  const { data: hash, isPending, writeContract, error: writeError, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  if (isSuccess && txDone === "") {
    // keep txDone empty until we set it — this shouldn't fire
  }
  // Actually set done state after success
  const [pendingTxType, setPendingTxType] = useState<TxType>("");
  if (isSuccess && pendingTxType && !txDone) {
    setTxDone(pendingTxType);
    setPendingTxType("");
    refetchPool();
    refetchAllowance();
    setTimeout(() => { setTxDone(""); reset(); }, 3500);
  }

  const isLoading = isPending || isConfirming;

  const exec = (type: TxType, fn: () => void) => { setPendingTxType(type); fn(); };

  const doApprove = (_forWhat: "swap" | "liq") =>
    exec("approve", () => writeContract({ address: tokenAddr, abi: ERC20_ABI, functionName: "approve", args: [DEX_ADDR, parseUnits("999999999", tokenDec)] }));

  const doSwap = () => exec("swap", () => {
    if (usdcToToken) {
      writeContract({ address: DEX_ADDR, abi: DEX_ABI, functionName: "swapUSDCforToken", args: [tokenAddr, minOut], value: amountInBig });
    } else {
      writeContract({ address: DEX_ADDR, abi: DEX_ABI, functionName: "swapTokenForUSDC", args: [tokenAddr, amountInBig, minOut] });
    }
  });

  const doAddLiquidity = () => exec("addLiquidity", () =>
    writeContract({ address: DEX_ADDR, abi: DEX_ABI, functionName: "addLiquidity", args: [tokenAddr, addTokenBig], value: addUSDCBig })
  );

  const doRemoveLiquidity = () => {
    exec("removeLiquidity", () => writeContract({ address: DEX_ADDR, abi: DEX_ABI, functionName: "removeLiquidity", args: [tokenAddr, removeLPBig] }));
  };

  const doImportToken = () => {
    if (!isAddress(importAddr) || !importSymbol || importDecimals === undefined) return;
    const exists = allTokens.find(t => t.address.toLowerCase() === importAddr.toLowerCase());
    if (!exists) {
      const newToken = { address: importAddr as `0x${string}`, symbol: importSymbol as string, decimals: importDecimals as number, icon: "🪙" };
      setCustomTokens(prev => [...prev, newToken]);
      setSelectedToken(newToken);
    } else {
      setSelectedToken(exists);
    }
    setShowImport(false);
    setImportAddr("");
  };

  const successMsg: Record<TxType, string> = {
    "": "",
    approve: "✅ Approved!",
    swap: "✅ Swap successful!",
    addLiquidity: "✅ Liquidity added!",
    removeLiquidity: "✅ Liquidity removed!",
  };

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

        {/* Token selector */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-xs text-slate-500">Pool:</span>
          {allTokens.map(t => (
            <button key={t.address} onClick={() => { setSelectedToken(t); setAmountIn(""); setAddUSDC(""); setAddTokenCustom(""); setRemovePct(0); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all ${selectedToken.address === t.address ? "bg-[#6366f1] border-[#6366f1] text-white" : "bg-slate-800/60 border-slate-700 text-slate-300 hover:border-[#6366f1]/50"}`}>
              <span>{t.icon}</span> USDC/{t.symbol}
            </button>
          ))}
          <button onClick={() => setShowImport(v => !v)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm border border-dashed border-slate-600 text-slate-400 hover:border-[#6366f1]/50 hover:text-[#6366f1] transition-all">
            + Import
          </button>
        </div>

        {/* Import token modal */}
        {showImport && (
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-4 mb-4">
            <h3 className="text-sm font-bold text-white mb-3">Import Token</h3>
            <input value={importAddr} onChange={e => setImportAddr(e.target.value)} placeholder="Token contract address (0x...)"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-[#6366f1]/60 mb-2" />
            {isAddress(importAddr) && importSymbol && (
              <div className="flex items-center gap-2 mb-3 text-sm text-slate-300">
                <span className="text-green-400">✓</span>
                <span className="font-bold">{importSymbol as string}</span>
                <span className="text-slate-500">· {importDecimals as number} decimals</span>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={doImportToken} disabled={!isAddress(importAddr) || !importSymbol}
                className="flex-1 py-2 rounded-lg text-sm font-bold bg-[#6366f1] text-white disabled:opacity-40">Import</button>
              <button onClick={() => { setShowImport(false); setImportAddr(""); }}
                className="px-4 py-2 rounded-lg text-sm text-slate-400 bg-slate-800">Cancel</button>
            </div>
          </div>
        )}

        {/* Pool stats */}
        <div className="bg-slate-900/60 border border-white/8 rounded-2xl p-4 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="font-semibold text-sm text-slate-300">{tokenIcon} USDC / {tokenSymbol}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${hasLiquidity ? "bg-green-500/15 text-green-400 border-green-500/30" : "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"}`}>
              {hasLiquidity ? "Active" : "No liquidity"}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div><div className="text-white font-bold text-sm">{hasLiquidity ? fmt(reserveUSDC, 18, 2) : "—"}</div><div className="text-slate-500 text-xs mt-0.5">USDC</div></div>
            <div><div className="text-white font-bold text-sm">{hasLiquidity ? fmt(reserveToken, tokenDec, tokenDec > 6 ? 8 : 4) : "—"}</div><div className="text-slate-500 text-xs mt-0.5">{tokenSymbol}</div></div>
            <div><div className="text-[#6366f1] font-bold text-sm">{price ? `${price.tokPerUsdc.toFixed(tokenDec > 6 ? 8 : 4)} ${tokenSymbol}` : "—"}</div><div className="text-slate-500 text-xs mt-0.5">per USDC</div></div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-slate-900/60 rounded-xl p-1 mb-5 border border-white/8">
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
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-white">Swap</h2>
              <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded-lg">0.3% fee · 0.5% slippage</span>
            </div>

            {/* From */}
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 mb-2">
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>You pay</span>
                <span>Bal: {usdcToToken
                  ? (usdcBal !== undefined ? fmt(usdcBal.value, 18, 4) : "—")
                  : (tokenBal !== undefined ? fmt(tokenBal as bigint, tokenDec, 4) : "—")} {usdcToToken ? "USDC" : tokenSymbol}</span>
              </div>
              <div className="flex items-center gap-3">
                <input type="number" value={amountIn} onChange={e => setAmountIn(e.target.value)} placeholder="0.00"
                  className="flex-1 bg-transparent text-white text-xl font-bold outline-none placeholder-slate-600" />
                <div className="flex items-center gap-2 bg-slate-700 rounded-lg px-3 py-2 shrink-0">
                  <span>{usdcToToken ? "💵" : tokenIcon}</span>
                  <span className="text-white font-bold text-sm">{usdcToToken ? "USDC" : tokenSymbol}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-center my-1">
              <button onClick={() => { setUsdcToToken(v => !v); setAmountIn(""); }}
                className="p-2 rounded-xl bg-slate-800 hover:bg-[#6366f1]/20 border border-slate-700 hover:border-[#6366f1]/40 text-[#6366f1] transition-all text-lg">⇅</button>
            </div>

            {/* To */}
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 mb-4">
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>You receive</span>
                <span>Bal: {!usdcToToken
                  ? (usdcBal !== undefined ? fmt(usdcBal.value, 18, 4) : "—")
                  : (tokenBal !== undefined ? fmt(tokenBal as bigint, tokenDec, 4) : "—")} {!usdcToToken ? "USDC" : tokenSymbol}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 text-white text-xl font-bold text-slate-300">
                  {amountOutBig > 0n ? fmt(amountOutBig, usdcToToken ? tokenDec : 18) : "—"}
                </div>
                <div className="flex items-center gap-2 bg-slate-700 rounded-lg px-3 py-2 shrink-0">
                  <span>{!usdcToToken ? "💵" : tokenIcon}</span>
                  <span className="text-white font-bold text-sm">{!usdcToToken ? "USDC" : tokenSymbol}</span>
                </div>
              </div>
            </div>

            {amountOutBig > 0n && (
              <div className="text-xs text-slate-500 px-1 mb-4 space-y-1">
                <div className="flex justify-between">
                  <span>Min received</span>
                  <span className="text-slate-400">{fmt(minOut, usdcToToken ? tokenDec : 18)} {usdcToToken ? tokenSymbol : "USDC"}</span>
                </div>
              </div>
            )}

            {!isConnected ? (
              <p className="text-slate-500 text-sm text-center py-2">Connect wallet to swap</p>
            ) : txDone ? (
              <div className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[#6366f1]/15 border border-[#6366f1]/40 text-[#6366f1] font-semibold">
                {successMsg[txDone]}
              </div>
            ) : needsApproveSwap ? (
              <button onClick={() => doApprove("swap")} disabled={isLoading}
                className="w-full py-3 rounded-xl font-bold text-sm bg-yellow-500 text-black hover:bg-yellow-400 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                {isLoading ? "Approving..." : `Approve ${tokenSymbol} for swap`}
              </button>
            ) : (
              <>
                {swapBalError && <p className="mb-2 text-red-400 text-xs text-center">{swapBalError}</p>}
                <button onClick={doSwap} disabled={isLoading || amountInBig === 0n || !hasLiquidity || !!swapBalError}
                  className="w-full py-3 rounded-xl font-bold text-sm bg-[#6366f1] text-white hover:bg-[#818cf8] active:scale-[0.98] disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                  {isLoading
                    ? <><svg className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" viewBox="0 0 24 24" />{isPending ? "Confirm..." : "Swapping..."}</>
                    : !hasLiquidity ? `No liquidity for USDC/${tokenSymbol}`
                    : `Swap ${usdcToToken ? `USDC → ${tokenSymbol}` : `${tokenSymbol} → USDC`}`}
                </button>
              </>
            )}
            {writeError && <p className="mt-2 text-red-400 text-xs text-center">{writeError.message?.includes("User rejected") ? "Cancelled" : writeError.message?.slice(0, 100)}</p>}
          </div>
        )}

        {/* LIQUIDITY TAB */}
        {tab === "liquidity" && (
          <div className="space-y-4">
            {/* Your position */}
            {isConnected && myLPBig > 0n && (
              <div className="bg-[#6366f1]/10 border border-[#6366f1]/30 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-[#6366f1]">Your Position — USDC/{tokenSymbol}</h3>
                  <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded-lg">
                    Share: {fmtShare(myLPBig, totalLPBig)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="bg-slate-800/60 rounded-xl p-3">
                    <div className="text-white font-bold text-lg">{lpValData ? fmt(lpValData[0], 18, 4) : "—"}</div>
                    <div className="text-slate-500 text-xs mt-0.5">💵 USDC</div>
                  </div>
                  <div className="bg-slate-800/60 rounded-xl p-3">
                    <div className="text-white font-bold text-lg">{lpValData ? fmt(lpValData[1], tokenDec, 4) : "—"}</div>
                    <div className="text-slate-500 text-xs mt-0.5">{tokenIcon} {tokenSymbol}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Add */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800/50 border border-white/10 rounded-2xl p-5">
              <h3 className="text-base font-bold text-white mb-4">Add Liquidity</h3>
              {!hasLiquidity && (
                <div className="mb-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-yellow-400 text-xs">
                  Pool empty — you set the initial price! Enter both amounts.
                </div>
              )}
              <div className="space-y-3 mb-4">
                <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3">
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>USDC</span>
                    <span>Bal: {usdcBal !== undefined ? fmt(usdcBal.value, 18, 4) : "—"}</span>
                  </div>
                  <div className="flex gap-2 items-center">
                    <input type="number" value={addUSDC} onChange={e => setAddUSDC(e.target.value)} placeholder="0.00"
                      className="flex-1 bg-transparent text-white text-lg font-bold outline-none placeholder-slate-600" />
                    <span className="text-white font-bold text-sm bg-slate-700 px-3 py-2 rounded-lg">💵 USDC</span>
                  </div>
                </div>
                <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3">
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>{tokenSymbol} {hasLiquidity ? "(auto)" : "(set price)"}</span>
                    <span>Bal: {tokenBal !== undefined ? fmt(tokenBal as bigint, tokenDec, 4) : "—"}</span>
                  </div>
                  <div className="flex gap-2 items-center">
                    {hasLiquidity ? (
                      <div className="flex-1 text-lg font-bold text-slate-300">
                        {addTokenBig > 0n ? fmt(addTokenBig, tokenDec) : (addUSDCBig > 0n && addTokenTooSmall ? <span className="text-yellow-400 text-sm">too small</span> : "—")}
                      </div>
                    ) : (
                      <input type="number" value={addTokenCustom} onChange={e => setAddTokenCustom(e.target.value)} placeholder="0.00"
                        className="flex-1 bg-transparent text-white text-lg font-bold outline-none placeholder-slate-600" />
                    )}
                    <span className="text-white font-bold text-sm bg-slate-700 px-3 py-2 rounded-lg">{tokenIcon} {tokenSymbol}</span>
                  </div>
                </div>
              </div>

              {!isConnected ? <p className="text-slate-500 text-sm text-center py-2">Connect wallet</p>
              : txDone ? (
                <div className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[#6366f1]/15 border border-[#6366f1]/40 text-[#6366f1] font-semibold">
                  {successMsg[txDone]}
                </div>
              ) : needsApproveLiq ? (
                <button onClick={() => doApprove("liq")} disabled={isLoading}
                  className="w-full py-3 rounded-xl font-bold text-sm bg-yellow-500 text-black hover:bg-yellow-400 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                  {isLoading ? "Approving..." : `Approve ${tokenSymbol}`}
                </button>
              ) : (
                <>
                  {addLiqError && <p className="mb-2 text-red-400 text-xs text-center">{addLiqError}</p>}
                  <button onClick={doAddLiquidity} disabled={isLoading || addUSDCBig === 0n || addTokenBig === 0n || !!addLiqError}
                    className="w-full py-3 rounded-xl font-bold text-sm bg-[#6366f1] text-white hover:bg-[#818cf8] active:scale-[0.98] disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                    {isLoading
                      ? <><svg className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" viewBox="0 0 24 24" />{isPending ? "Confirm..." : "Adding..."}</>
                      : "💧 Add Liquidity"}
                  </button>
                </>
              )}
            </div>

            {/* Remove */}
            {isConnected && myLPBig > 0n && (
              <div className="bg-gradient-to-br from-slate-900 to-slate-800/50 border border-white/10 rounded-2xl p-5">
                <h3 className="text-base font-bold text-white mb-4">Remove Liquidity</h3>

                <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 mb-3">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-slate-400 text-sm">Amount to remove</span>
                    <span className="text-white font-bold text-xl">{removePct}%</span>
                  </div>
                  <input type="range" min={0} max={100} step={1} value={removePct}
                    onChange={e => setRemovePct(Number(e.target.value))}
                    className="w-full accent-[#6366f1] mb-3" />
                  <div className="flex gap-2">
                    {[25, 50, 75, 100].map(p => (
                      <button key={p} onClick={() => setRemovePct(p)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${removePct === p ? "bg-[#6366f1] border-[#6366f1] text-white" : "border-slate-600 text-slate-400 hover:border-[#6366f1]/50 hover:text-white"}`}>
                        {p === 100 ? "MAX" : `${p}%`}
                      </button>
                    ))}
                  </div>
                </div>

                {removePct > 0 && removePreview && (
                  <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-3 mb-4">
                    <p className="text-xs text-slate-400 mb-2">You will receive:</p>
                    <div className="flex justify-between">
                      <div className="flex items-center gap-2">
                        <span>💵</span>
                        <span className="text-white font-bold">{fmt((removePreview as [bigint,bigint])[0], 18, 4)}</span>
                        <span className="text-slate-400 text-sm">USDC</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span>{tokenIcon}</span>
                        <span className="text-white font-bold">{fmt((removePreview as [bigint,bigint])[1], tokenDec, 4)}</span>
                        <span className="text-slate-400 text-sm">{tokenSymbol}</span>
                      </div>
                    </div>
                  </div>
                )}

                {txDone ? (
                  <div className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[#6366f1]/15 border border-[#6366f1]/40 text-[#6366f1] font-semibold">
                    {successMsg[txDone]}
                  </div>
                ) : (
                  <button onClick={doRemoveLiquidity} disabled={isLoading || removePct === 0}
                    className="w-full py-3 rounded-xl font-bold text-sm bg-red-500/80 text-white hover:bg-red-500 active:scale-[0.98] disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                    {isLoading
                      ? <><svg className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" viewBox="0 0 24 24" />{isPending ? "Confirm..." : "Removing..."}</>
                      : `🔥 Remove ${removePct}% of Position`}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <footer className="mt-10 text-center text-xs text-slate-600">
          <p>ArcDEX · <a href={`https://testnet.arcscan.app/address/${DEX_ADDR}`} target="_blank" rel="noreferrer" className="hover:text-slate-400">{DEX_ADDR.slice(0, 6)}...{DEX_ADDR.slice(-4)}</a> · Chain {arcTestnet.id}</p>
        </footer>
      </main>
    </div>
  );
}
