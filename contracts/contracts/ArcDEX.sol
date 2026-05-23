// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ArcDEX
 * @notice Multi-pair AMM: USDC (native, 18 dec) paired with any ERC20
 * x*y=k, 0.3% fee. Each ERC20 token gets its own USDC pool.
 */
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
    function symbol() external view returns (string memory);
}

contract ArcDEX {
    struct Pool {
        uint256 reserveUSDC;  // native USDC (18 decimals)
        uint256 reserveToken; // ERC20 token
        uint256 totalLP;
        bool exists;
    }

    mapping(address => Pool) public pools;
    mapping(address => mapping(address => uint256)) public lpBalance; // token => user => lp
    address[] public tokenList;

    uint256 public constant FEE_BPS = 30; // 0.3%

    bool private locked;
    modifier noReentrant() { require(!locked, "Reentrant"); locked = true; _; locked = false; }

    event PoolCreated(address indexed token);
    event Swap(address indexed user, address indexed token, bool usdcIn, uint256 amountIn, uint256 amountOut);
    event LiquidityAdded(address indexed provider, address indexed token, uint256 usdcAmount, uint256 tokenAmount, uint256 lpMinted);
    event LiquidityRemoved(address indexed provider, address indexed token, uint256 usdcAmount, uint256 tokenAmount, uint256 lpBurned);

    // Create pool for a new token (called automatically on first addLiquidity)
    function _ensurePool(address token) internal {
        if (!pools[token].exists) {
            pools[token].exists = true;
            tokenList.push(token);
            emit PoolCreated(token);
        }
    }

    function addLiquidity(address token, uint256 tokenAmount) external payable noReentrant returns (uint256 lpMinted) {
        require(msg.value > 0 && tokenAmount > 0, "Zero amount");
        _ensurePool(token);
        Pool storage pool = pools[token];

        if (pool.totalLP == 0) {
            lpMinted = _sqrt(msg.value * tokenAmount);
        } else {
            lpMinted = _min(
                (msg.value * pool.totalLP) / pool.reserveUSDC,
                (tokenAmount * pool.totalLP) / pool.reserveToken
            );
        }
        require(lpMinted > 0, "Insufficient LP");

        IERC20(token).transferFrom(msg.sender, address(this), tokenAmount);
        pool.reserveUSDC += msg.value;
        pool.reserveToken += tokenAmount;
        lpBalance[token][msg.sender] += lpMinted;
        pool.totalLP += lpMinted;

        emit LiquidityAdded(msg.sender, token, msg.value, tokenAmount, lpMinted);
    }

    function removeLiquidity(address token, uint256 lpAmount) external noReentrant returns (uint256 usdcOut, uint256 tokenOut) {
        Pool storage pool = pools[token];
        require(pool.exists && lpAmount > 0 && lpBalance[token][msg.sender] >= lpAmount, "Invalid");

        usdcOut = (lpAmount * pool.reserveUSDC) / pool.totalLP;
        tokenOut = (lpAmount * pool.reserveToken) / pool.totalLP;

        lpBalance[token][msg.sender] -= lpAmount;
        pool.totalLP -= lpAmount;
        pool.reserveUSDC -= usdcOut;
        pool.reserveToken -= tokenOut;

        (bool ok,) = payable(msg.sender).call{value: usdcOut}("");
        require(ok, "USDC failed");
        require(IERC20(token).transfer(msg.sender, tokenOut), "Token failed");

        emit LiquidityRemoved(msg.sender, token, usdcOut, tokenOut, lpAmount);
    }

    // Swap native USDC -> ERC20 token
    function swapUSDCforToken(address token, uint256 minOut) external payable noReentrant returns (uint256 tokenOut) {
        require(msg.value > 0, "No USDC");
        Pool storage pool = pools[token];
        require(pool.exists && pool.reserveUSDC > 0 && pool.reserveToken > 0, "No liquidity");

        tokenOut = getAmountOut(msg.value, pool.reserveUSDC, pool.reserveToken);
        require(tokenOut >= minOut, "Slippage");
        require(tokenOut < pool.reserveToken, "Insufficient reserve");

        pool.reserveUSDC += msg.value;
        pool.reserveToken -= tokenOut;
        require(IERC20(token).transfer(msg.sender, tokenOut), "Token failed");

        emit Swap(msg.sender, token, true, msg.value, tokenOut);
    }

    // Swap ERC20 token -> native USDC
    function swapTokenForUSDC(address token, uint256 tokenIn, uint256 minUSDC) external noReentrant returns (uint256 usdcOut) {
        require(tokenIn > 0, "No token");
        Pool storage pool = pools[token];
        require(pool.exists && pool.reserveUSDC > 0 && pool.reserveToken > 0, "No liquidity");

        usdcOut = getAmountOut(tokenIn, pool.reserveToken, pool.reserveUSDC);
        require(usdcOut >= minUSDC, "Slippage");
        require(usdcOut < pool.reserveUSDC, "Insufficient reserve");

        IERC20(token).transferFrom(msg.sender, address(this), tokenIn);
        pool.reserveToken += tokenIn;
        pool.reserveUSDC -= usdcOut;

        (bool ok,) = payable(msg.sender).call{value: usdcOut}("");
        require(ok, "USDC failed");

        emit Swap(msg.sender, token, false, tokenIn, usdcOut);
    }

    function getAmountOut(uint256 amountIn, uint256 rIn, uint256 rOut) public pure returns (uint256) {
        require(rIn > 0 && rOut > 0, "Empty reserve");
        uint256 amountInWithFee = amountIn * (10000 - FEE_BPS);
        return (amountInWithFee * rOut) / (rIn * 10000 + amountInWithFee);
    }

    function getPool(address token) external view returns (uint256 resUSDC, uint256 resToken, uint256 lp) {
        Pool storage pool = pools[token];
        return (pool.reserveUSDC, pool.reserveToken, pool.totalLP);
    }

    function getLPValue(address token, uint256 lpAmount) external view returns (uint256 usdcAmount, uint256 tokenAmount) {
        Pool storage pool = pools[token];
        if (pool.totalLP == 0) return (0, 0);
        usdcAmount = (lpAmount * pool.reserveUSDC) / pool.totalLP;
        tokenAmount = (lpAmount * pool.reserveToken) / pool.totalLP;
    }

    function getTokenList() external view returns (address[] memory) { return tokenList; }

    function _sqrt(uint256 x) internal pure returns (uint256 z) {
        if (x == 0) return 0;
        z = (x + 1) / 2;
        uint256 y = x;
        while (z < y) { y = z; z = (x / z + z) / 2; }
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) { return a < b ? a : b; }

    receive() external payable {}
}
