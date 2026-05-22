// GM contract address — set in .env as VITE_GM_CONTRACT_ADDRESS after deploying
export const GM_CONTRACT_ADDRESS =
  (import.meta.env.VITE_GM_CONTRACT_ADDRESS as `0x${string}`) ||
  "0x0000000000000000000000000000000000000000";

// ABI = the "menu" of functions our contract exposes to the frontend
export const GM_ABI = [
  {
    name: "sendGm",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "message", type: "string" }],
    outputs: [],
  },
  {
    name: "getRecentGms",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "count", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "sender", type: "address" },
          { name: "timestamp", type: "uint256" },
          { name: "message", type: "string" },
        ],
      },
    ],
  },
  {
    name: "totalGms",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "gmCount",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "GmSent",
    type: "event",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "timestamp", type: "uint256", indexed: false },
      { name: "message", type: "string", indexed: false },
    ],
  },
] as const;
