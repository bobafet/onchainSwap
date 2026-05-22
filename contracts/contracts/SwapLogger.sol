// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SwapLogger
 * @notice Log swap intents on-chain. Records what users want to swap
 *         so the community can see Arc DeFi activity.
 */
contract SwapLogger {
    event SwapLogged(address indexed user, string fromToken, string toToken, uint256 amount, uint256 timestamp);

    struct SwapRecord {
        address user;
        string fromToken;
        string toToken;
        uint256 amount;      // in smallest unit
        uint256 timestamp;
        string note;
    }

    SwapRecord[] public swaps;
    mapping(address => uint256) public swapCount;
    uint256 public totalSwaps;

    // Supported tokens on Arc
    string[] public supportedTokens = ["USDC", "EURC", "USYC"];

    function logSwap(
        string calldata fromToken,
        string calldata toToken,
        uint256 amount,
        string calldata note
    ) external {
        require(bytes(fromToken).length > 0, "From token required");
        require(bytes(toToken).length > 0, "To token required");
        require(amount > 0, "Amount must be > 0");

        swaps.push(SwapRecord({
            user: msg.sender,
            fromToken: fromToken,
            toToken: toToken,
            amount: amount,
            timestamp: block.timestamp,
            note: note
        }));

        swapCount[msg.sender]++;
        totalSwaps++;
        emit SwapLogged(msg.sender, fromToken, toToken, amount, block.timestamp);
    }

    function getRecentSwaps(uint256 count) external view returns (SwapRecord[] memory) {
        uint256 len = swaps.length;
        uint256 start = len > count ? len - count : 0;
        SwapRecord[] memory result = new SwapRecord[](len - start);
        for (uint256 i = 0; i < result.length; i++) result[i] = swaps[start + i];
        return result;
    }
}
