// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ArcDEX
 * @notice Real AMM DEX for USDC (native, 18 dec) / EURC (ERC20, 6 dec) on Arc Testnet
 * Constant product formula x*y=k, 0.3% swap fee
 */
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract ArcDEX {
    IERC20 public immutable eurc;

    uint256 public reserveUSDC; // native USDC (18 decimals)
    uint256 public reserveEURC; // EURC ERC20 (6 decimals)
    uint256 public totalLP;

    mapping(address => uint256) public lpBalance;

    uint256 public constant FEE_BPS = 30; // 0.3%

    bool private locked;
    modifier noReentrant() {
        require(!locked, "Reentrant");
        locked = true;
        _;
        locked = false;
    }

    event Swap(address indexed user, bool usdcIn, uint256 amountIn, uint256 amountOut);
    event LiquidityAdded(address indexed provider, uint256 usdcAmount, uint256 eurcAmount, uint256 lpMinted);
    event LiquidityRemoved(address indexed provider, uint256 usdcAmount, uint256 eurcAmount, uint256 lpBurned);

    constructor(address _eurc) {
        eurc = IERC20(_eurc);
    }

    // Add liquidity: send USDC as msg.value + approve EURC first
    // For existing pool, eurcAmount should match ratio: eurcAmount = msg.value * reserveEURC / reserveUSDC
    function addLiquidity(uint256 eurcAmount) external payable noReentrant returns (uint256 lpMinted) {
        require(msg.value > 0 && eurcAmount > 0, "Zero amount");

        if (totalLP == 0) {
            lpMinted = _sqrt(msg.value * eurcAmount);
        } else {
            lpMinted = _min(
                (msg.value * totalLP) / reserveUSDC,
                (eurcAmount * totalLP) / reserveEURC
            );
        }
        require(lpMinted > 0, "Insufficient LP");

        eurc.transferFrom(msg.sender, address(this), eurcAmount);
        reserveUSDC += msg.value;
        reserveEURC += eurcAmount;
        lpBalance[msg.sender] += lpMinted;
        totalLP += lpMinted;

        emit LiquidityAdded(msg.sender, msg.value, eurcAmount, lpMinted);
    }

    function removeLiquidity(uint256 lpAmount) external noReentrant returns (uint256 usdcOut, uint256 eurcOut) {
        require(lpAmount > 0 && lpBalance[msg.sender] >= lpAmount, "Insufficient LP");

        usdcOut = (lpAmount * reserveUSDC) / totalLP;
        eurcOut = (lpAmount * reserveEURC) / totalLP;

        lpBalance[msg.sender] -= lpAmount;
        totalLP -= lpAmount;
        reserveUSDC -= usdcOut;
        reserveEURC -= eurcOut;

        (bool ok,) = payable(msg.sender).call{value: usdcOut}("");
        require(ok, "USDC transfer failed");
        require(eurc.transfer(msg.sender, eurcOut), "EURC transfer failed");

        emit LiquidityRemoved(msg.sender, usdcOut, eurcOut, lpAmount);
    }

    // Swap native USDC -> EURC (send USDC as msg.value)
    function swapUSDCforEURC(uint256 minEURC) external payable noReentrant returns (uint256 eurcOut) {
        require(msg.value > 0, "No USDC sent");
        require(reserveUSDC > 0 && reserveEURC > 0, "No liquidity in pool");

        eurcOut = getAmountOut(msg.value, reserveUSDC, reserveEURC);
        require(eurcOut >= minEURC, "Slippage exceeded");
        require(eurcOut < reserveEURC, "Insufficient EURC reserve");

        reserveUSDC += msg.value;
        reserveEURC -= eurcOut;
        require(eurc.transfer(msg.sender, eurcOut), "EURC transfer failed");

        emit Swap(msg.sender, true, msg.value, eurcOut);
    }

    // Swap EURC -> native USDC (approve EURC first)
    function swapEURCforUSDC(uint256 eurcIn, uint256 minUSDC) external noReentrant returns (uint256 usdcOut) {
        require(eurcIn > 0, "No EURC");
        require(reserveUSDC > 0 && reserveEURC > 0, "No liquidity in pool");

        usdcOut = getAmountOut(eurcIn, reserveEURC, reserveUSDC);
        require(usdcOut >= minUSDC, "Slippage exceeded");
        require(usdcOut < reserveUSDC, "Insufficient USDC reserve");

        eurc.transferFrom(msg.sender, address(this), eurcIn);
        reserveEURC += eurcIn;
        reserveUSDC -= usdcOut;

        (bool ok,) = payable(msg.sender).call{value: usdcOut}("");
        require(ok, "USDC transfer failed");

        emit Swap(msg.sender, false, eurcIn, usdcOut);
    }

    // Constant product AMM formula with 0.3% fee
    function getAmountOut(uint256 amountIn, uint256 rIn, uint256 rOut) public pure returns (uint256) {
        require(rIn > 0 && rOut > 0, "Empty reserve");
        uint256 amountInWithFee = amountIn * (10000 - FEE_BPS);
        return (amountInWithFee * rOut) / (rIn * 10000 + amountInWithFee);
    }

    // How much tokens user gets back for lpAmount LP tokens
    function getLPValue(uint256 lpAmount) external view returns (uint256 usdcAmount, uint256 eurcAmount) {
        if (totalLP == 0) return (0, 0);
        usdcAmount = (lpAmount * reserveUSDC) / totalLP;
        eurcAmount = (lpAmount * reserveEURC) / totalLP;
    }

    function _sqrt(uint256 x) internal pure returns (uint256 z) {
        if (x == 0) return 0;
        z = (x + 1) / 2;
        uint256 y = x;
        while (z < y) { y = z; z = (x / z + z) / 2; }
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    receive() external payable {}
}
