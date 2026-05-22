import { ConnectButton } from "@rainbow-me/rainbowkit";

export function Header() {
  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 backdrop-blur-sm sticky top-0 z-50 bg-[#080b14]/80">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <span className="text-2xl">🌅</span>
        <span className="font-bold text-white text-lg tracking-tight">
          onchain<span className="text-[#00d4aa]">GM</span>
        </span>
        <span className="hidden sm:inline-block text-xs text-slate-500 bg-slate-800/60 px-2 py-0.5 rounded-full border border-slate-700">
          Arc Testnet
        </span>
      </div>

      {/* RainbowKit connect button */}
      <ConnectButton
        showBalance={false}
        chainStatus="icon"
        accountStatus="avatar"
      />
    </header>
  );
}
