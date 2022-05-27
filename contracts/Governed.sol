// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.12;

/**
 * @title Governed
 * @notice Provides the basics for governance access and emergency pause functionality.
 * @dev This contract is abstract. Extend the contract to implement governance access control and emergency pause functionality.
 */
abstract contract Governed {
    
    /// Protocol governance
    address public governance;

    /// Max pause duration, after witch pause will lose effect.
    uint256 public constant PAUSE_TIMEOUT = 72 hours;

    /// Max pause cooldown after resume, during which pause cannot be repeated. Actual cooldown will be proportionally reduced if resumed before timeout.
    uint256 public constant PAUSE_MAX_COOLDOWN = 24 hours;

    /// Epoch second timestamp of the last pause, default value is 1 seconds after epoch 0.
    uint256 public lastPausedTime = 1;

    /// Epoch second timestamp when the pausing will come out of a cooldown.
    uint256 public pauseCooldownTime = 1;

    /// Event emitted when a new governance is set
    event GovernanceTransferred(address from, address to);

    /// Event emitted on pause
    event Paused();

    /// Event emitted on manual resume.
    event Resumed();

    /// Limit access to the governance
    modifier onlyGovernance {
        require(msg.sender == governance, "Managed: caller is not the governance");
        _;
    }

    /// Allow execution only when not paused
    modifier notPaused {
        require(!isPaused(), "Governed: Paused.");
        _;
    }

    /// Allow execution only when paused
    modifier paused() {
        require(isPaused(), "Governed: Not paused.");
        _;
    }

    /// Allow execution only when the pause cooldown is not in effect
    modifier notInPauseCooldown {
        require(block.timestamp > pauseCooldownTime, "Governed: Pause cooldown is in effect.");
        _;
    }

    /**
     * @notice Create new Governed instance.
     * @dev _governance must not be 0
     * @param _governance Address of the protocol governance.
     */
    constructor(address _governance) {
        require(_governance != address(0));
        governance = _governance;
    }

    /**
     * @notice Transfer the governance.
     * @dev Caller must be governance. 
     *      _governance must not be 0.
     * @param _governance Address of the new governance.
     */
    function transferGovernance(address _governance) external onlyGovernance {
        require(_governance != address(0) && _governance != governance, "Governed: New governance address is invalid.");
        emit GovernanceTransferred(governance, _governance);
        governance = _governance;
    }

    /**
     * @notice Pause. 
     * @dev Caller must be the governance.
     *      Pause or cooldown must not be in effect.
     *      Emits 'Paused' event.
     *      Pause will time out in PAUSE_TIMEOUT seconds after the current block timestamp.
     */
    function pause() external onlyGovernance notPaused notInPauseCooldown {
        lastPausedTime = block.timestamp;
        pauseCooldownTime = lastPausedTime + PAUSE_TIMEOUT + PAUSE_MAX_COOLDOWN;
        emit Paused();
    }

    /**
     * @notice Resume. 
     * @dev Caller must be the governance.
     *      Pause must be in effect.
     *      Emits 'Resumed' event.
     *      Resuming will update 'pauseCooldownTime'.
     */
    function resume() external onlyGovernance paused {
        pauseCooldownTime = PAUSE_MAX_COOLDOWN;

        // calculate a reduced cooldown if not pausing and resuming on the same block
        if (block.timestamp > lastPausedTime) {
            pauseCooldownTime = block.timestamp + PAUSE_MAX_COOLDOWN * 1000 / (PAUSE_TIMEOUT * 1000 / (block.timestamp - lastPausedTime));
        }
        
        lastPausedTime = 1;
        emit Resumed();
    }

    /**
     * @notice Flag indicating whether or not the emergency pause is in effect
     * @return True if the pause in effect, false otherwise
     */
    function isPaused() public view returns (bool) {
        return lastPausedTime > 1 && block.timestamp - lastPausedTime < PAUSE_TIMEOUT;
    }
}