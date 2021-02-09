pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IERC20Agent.sol";


contract TestERC20Agent is IERC20Agent {
    function create(
        address,
        address,
        uint256,
        IERC20,
        uint256,
        bytes calldata _agentData
    ) external pure override returns (bool) {
        return _agentData.length > 0;
    }

    function cancel(
        bytes32,
        bytes calldata _agentData
    ) external pure override returns (bool) {
        return _agentData.length > 0;
    }

    function withdraw(
        bytes32,
        address,
        address,
        uint256,
        bytes calldata _agentData
    ) external pure override returns (bool) {
        return _agentData.length > 0;
    }
}