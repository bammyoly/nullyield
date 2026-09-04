// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, euint64, ebool, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title NullYield
/// @notice Confidential no-loss prize pool powered by ERC-7984 and FHE draws.
/// @dev Draw steps are executed via onlyKeeperOrOwner. Individual balances and odds stay fully encrypted.
///      Aggregate total shares are publicly decrypted per draw to enable an unbiased FHE.rem-based draw.
contract NullYield is ZamaEthereumConfig, Ownable2Step, ReentrancyGuard {
    IERC7984 public immutable poolToken;

    mapping(address => euint64) private _shares;
    mapping(address => euint64) private _pendingPrize;
    euint64 private _totalShares;
    euint64 private _prizeReserve;

    address public prizeReserveContract;

    address[] public depositors;
    mapping(address => uint256) private _depositorIndex; // 1-based
    uint256 public constant MAX_DEPOSITORS = 50;
    uint64 public constant MAX_DEPOSIT = 1_000_000e6;

    enum DrawState {
        IDLE,
        AWAITING_TOTAL_DECRYPTION,
        AWAITING_WINNER_DECRYPTION
    }

    DrawState public drawState;
    address public keeper;
    uint256 public drawInterval = 2 hours; // production default; deploy script may set 300
    uint256 public nextDrawTime;
    uint256 public currentDrawId;
    uint64 public prizePerDraw;

    euint64 private _pendingTotalSharesCiphertext;
    euint64 private _pendingWinnerIndex;
    uint256 private _activeDrawId;

    event Deposited(address indexed user);
    event Withdrawn(address indexed user);
    event DrawTriggered(uint256 indexed drawId, uint256 depositorCount);
    event TotalSharesRevealed(uint256 indexed drawId, uint64 clearTotal);
    event DrawFinalized(uint256 indexed drawId, address indexed winner, uint64 prizeAwarded);
    event PrizeClaimed(address indexed user);
    event PrizeFunded(address indexed admin);
    event KeeperUpdated(address indexed keeper);
    event PrizePerDrawUpdated(uint64 newPrizePerDraw);
    event DrawIntervalUpdated(uint256 newInterval);
    event PrizeReserveContractUpdated(address indexed reserve);

    error PoolFull();
    error NotDepositor();
    error DrawNotDue();
    error DrawInProgress();
    error InvalidDrawState(DrawState current, DrawState expected);
    error NotAuthorizedKeeper();
    error InvalidDrawId();
    error EmptyPool();
    error IndexOutOfBounds();
    error ZeroAddress();

    modifier onlyKeeperOrOwner() {
        if (msg.sender != keeper && msg.sender != owner()) revert NotAuthorizedKeeper();
        _;
    }

    modifier whenIdle() {
        if (drawState != DrawState.IDLE) revert DrawInProgress();
        _;
    }

    constructor(IERC7984 _poolToken, address _keeper, uint64 _prizePerDraw) Ownable(msg.sender) {
        if (address(_poolToken) == address(0)) revert ZeroAddress();
        poolToken = _poolToken;
        keeper = _keeper;
        prizePerDraw = _prizePerDraw;
        nextDrawTime = block.timestamp + drawInterval;
        drawState = DrawState.IDLE;

        _totalShares = FHE.asEuint64(0);
        _prizeReserve = FHE.asEuint64(0);
        FHE.allowThis(_totalShares);
        _allowPrizeReserveAcl();
    }

    /// @dev Contract + current owner can use / user-decrypt the reserve ciphertext.
    function _allowPrizeReserveAcl() private {
        FHE.allowThis(_prizeReserve);
        FHE.allow(_prizeReserve, owner());
    }

    // ─── Deposit / Withdraw ───────────────────────────────────────────

    function deposit(externalEuint64 encryptedAmount, bytes calldata inputProof)
        external
        nonReentrant
        whenIdle
    {
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        amount = FHE.min(amount, FHE.asEuint64(MAX_DEPOSIT));

        if (_depositorIndex[msg.sender] == 0) {
            if (depositors.length >= MAX_DEPOSITORS) revert PoolFull();
            depositors.push(msg.sender);
            _depositorIndex[msg.sender] = depositors.length;
            _shares[msg.sender] = FHE.asEuint64(0);
        }

        FHE.allowTransient(amount, address(poolToken));
        euint64 transferred = poolToken.confidentialTransferFrom(msg.sender, address(this), amount);

        _shares[msg.sender] = FHE.add(_shares[msg.sender], transferred);
        _totalShares = FHE.add(_totalShares, transferred);

        FHE.allowThis(_shares[msg.sender]);
        FHE.allow(_shares[msg.sender], msg.sender);
        FHE.allowThis(_totalShares);

        emit Deposited(msg.sender);
    }

    function withdraw() external nonReentrant whenIdle {
        uint256 idx = _depositorIndex[msg.sender];
        if (idx == 0) revert NotDepositor();

        euint64 amount = _shares[msg.sender];
        _shares[msg.sender] = FHE.asEuint64(0);
        _totalShares = FHE.sub(_totalShares, amount);
        FHE.allowThis(_totalShares);

        FHE.allowTransient(amount, address(poolToken));
        poolToken.confidentialTransfer(msg.sender, amount);

        _removeDepositor(idx);
        emit Withdrawn(msg.sender);
    }

    function _removeDepositor(uint256 idx1Based) private {
        uint256 lastIdx = depositors.length;
        address lastAddr = depositors[lastIdx - 1];
        depositors[idx1Based - 1] = lastAddr;
        _depositorIndex[lastAddr] = idx1Based;
        depositors.pop();
        delete _depositorIndex[msg.sender];
    }

    // ─── Admin / Yield ────────────────────────────────────────────────

    function setPrizeReserve(address _prizeReserveContract) external onlyOwner {
        if (_prizeReserveContract == address(0)) revert ZeroAddress();
        prizeReserveContract = _prizeReserveContract;
        emit PrizeReserveContractUpdated(_prizeReserveContract);
    }

    function fundPrize(externalEuint64 encryptedAmount, bytes calldata inputProof)
        external
        onlyOwner
    {
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        FHE.allowTransient(amount, address(poolToken));
        euint64 transferred = poolToken.confidentialTransferFrom(msg.sender, address(this), amount);

        _prizeReserve = FHE.add(_prizeReserve, transferred);
        _allowPrizeReserveAcl();
        emit PrizeFunded(msg.sender);
    }

    function fundPrizeFromReserve(uint64 amount) external nonReentrant {
        require(msg.sender == prizeReserveContract, "NullYield: not reserve");
        require(amount > 0, "NullYield: zero amount");

        euint64 encAmount = FHE.asEuint64(amount);
        FHE.allowTransient(encAmount, address(poolToken));

        euint64 transferred =
            poolToken.confidentialTransferFrom(msg.sender, address(this), encAmount);

        _prizeReserve = FHE.add(_prizeReserve, transferred);
        _allowPrizeReserveAcl();
        emit PrizeFunded(msg.sender);
    }

    function setKeeper(address _keeper) external onlyOwner {
        keeper = _keeper;
        emit KeeperUpdated(_keeper);
    }

    function setDrawInterval(uint256 seconds_) external onlyOwner {
        require(seconds_ > 0, "NullYield: zero interval");
        drawInterval = seconds_;
        if (drawState == DrawState.IDLE) {
            nextDrawTime = block.timestamp + seconds_;
        }
        emit DrawIntervalUpdated(seconds_);
    }

    function setPrizePerDraw(uint64 _prizePerDraw) external onlyOwner {
        prizePerDraw = _prizePerDraw;
        emit PrizePerDrawUpdated(_prizePerDraw);
    }

    // ─── 3-Step Draw (Keeper or Owner) ────────────────────────────────

    function triggerDraw() external onlyKeeperOrOwner {
        if (block.timestamp < nextDrawTime) revert DrawNotDue();
        if (drawState != DrawState.IDLE) revert DrawInProgress();
        if (depositors.length == 0) revert EmptyPool();

        unchecked {
            currentDrawId += 1;
        }
        _activeDrawId = currentDrawId;

        _pendingTotalSharesCiphertext = _totalShares;
        FHE.allowThis(_pendingTotalSharesCiphertext);
        FHE.makePubliclyDecryptable(_pendingTotalSharesCiphertext);

        drawState = DrawState.AWAITING_TOTAL_DECRYPTION;
        emit DrawTriggered(currentDrawId, depositors.length);
    }

    function revealTotalAndSelectWinner(
        uint256 drawId,
        uint64 clearTotal,
        bytes calldata totalProof
    ) external nonReentrant onlyKeeperOrOwner {
        if (drawState != DrawState.AWAITING_TOTAL_DECRYPTION) {
            revert InvalidDrawState(drawState, DrawState.AWAITING_TOTAL_DECRYPTION);
        }
        if (drawId != _activeDrawId) revert InvalidDrawId();

        bytes32[] memory handles = new bytes32[](1);
        handles[0] = FHE.toBytes32(_pendingTotalSharesCiphertext);
        FHE.checkSignatures(handles, abi.encode(clearTotal), totalProof);

        if (clearTotal == 0) {
            drawState = DrawState.IDLE;
            nextDrawTime = block.timestamp + drawInterval;
            emit TotalSharesRevealed(drawId, 0);
            return;
        }

        euint64 rand = FHE.randEuint64();
        rand = FHE.rem(rand, clearTotal);

        euint64 winnerIndex = _selectWinner(rand);

        _pendingWinnerIndex = winnerIndex;
        FHE.allowThis(_pendingWinnerIndex);
        FHE.makePubliclyDecryptable(_pendingWinnerIndex);

        drawState = DrawState.AWAITING_WINNER_DECRYPTION;
        emit TotalSharesRevealed(drawId, clearTotal);
    }

    function _selectWinner(euint64 rand) private returns (euint64) {
        euint64 cumulative = FHE.asEuint64(0);
        euint64 winnerIndex = FHE.asEuint64(0);
        ebool found = FHE.asEbool(false);

        uint256 n = depositors.length;
        for (uint256 i = 0; i < n; ) {
            cumulative = FHE.add(cumulative, _shares[depositors[i]]);
            ebool matched = FHE.and(FHE.not(found), FHE.le(rand, cumulative));
            winnerIndex = FHE.select(matched, FHE.asEuint64(uint64(i)), winnerIndex);
            found = FHE.or(found, matched);
            unchecked {
                ++i;
            }
        }

        FHE.allowThis(winnerIndex);
        return winnerIndex;
    }

    function finalizeDraw(
        uint256 drawId,
        uint64 clearWinnerIndex,
        bytes calldata winnerProof
    ) external nonReentrant onlyKeeperOrOwner {
        if (drawState != DrawState.AWAITING_WINNER_DECRYPTION) {
            revert InvalidDrawState(drawState, DrawState.AWAITING_WINNER_DECRYPTION);
        }
        if (drawId != _activeDrawId) revert InvalidDrawId();
        if (clearWinnerIndex >= depositors.length) revert IndexOutOfBounds();

        bytes32[] memory handles = new bytes32[](1);
        handles[0] = FHE.toBytes32(_pendingWinnerIndex);
        FHE.checkSignatures(handles, abi.encode(clearWinnerIndex), winnerProof);

        address winner = depositors[clearWinnerIndex];

        // Cap prize by reserve (encrypted)
        euint64 prizeToAward = FHE.min(_prizeReserve, FHE.asEuint64(prizePerDraw));

        _pendingPrize[winner] = FHE.add(_pendingPrize[winner], prizeToAward);
        FHE.allowThis(_pendingPrize[winner]);
        FHE.allow(_pendingPrize[winner], winner);

        _prizeReserve = FHE.sub(_prizeReserve, prizeToAward);
        _allowPrizeReserveAcl();

        drawState = DrawState.IDLE;
        nextDrawTime = block.timestamp + drawInterval;

        // Event uses configured prizePerDraw (plaintext). Actual transfer is min(reserve, prizePerDraw).
        emit DrawFinalized(drawId, winner, prizePerDraw);
    }

    function claim() external nonReentrant {
        euint64 amount = _pendingPrize[msg.sender];
        _pendingPrize[msg.sender] = FHE.asEuint64(0);
        FHE.allowThis(_pendingPrize[msg.sender]);
        FHE.allow(_pendingPrize[msg.sender], msg.sender);

        FHE.allowTransient(amount, address(poolToken));
        poolToken.confidentialTransfer(msg.sender, amount);

        emit PrizeClaimed(msg.sender);
    }

    // ─── Views ────────────────────────────────────────────────────────

    function sharesOf(address user) external view returns (euint64) {
        return _shares[user];
    }

    function pendingPrizeOf(address user) external view returns (euint64) {
        return _pendingPrize[user];
    }

    function totalShares() external view returns (euint64) {
        return _totalShares;
    }

    function prizeReserve() external view returns (euint64) {
        return _prizeReserve;
    }

    function depositorCount() external view returns (uint256) {
        return depositors.length;
    }

    function getDepositors() external view returns (address[] memory) {
        return depositors;
    }

    function pendingTotalSharesHandle() external view returns (euint64) {
        return _pendingTotalSharesCiphertext;
    }

    function pendingWinnerIndexHandle() external view returns (euint64) {
        return _pendingWinnerIndex;
    }

    function activeDrawId() external view returns (uint256) {
        return _activeDrawId;
    }
}