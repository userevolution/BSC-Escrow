pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "../interfaces/IERC721Agent.sol";


contract TestERC721Agent is IERC721Agent {
    function create(
        address,
        address,
        IERC721,
        uint256,
        IERC20,
        uint256,
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
        bytes calldata _agentData
    ) external pure override returns (bool) {
        return _agentData.length > 0;
    }
}