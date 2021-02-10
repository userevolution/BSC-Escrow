pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";


interface IERC721Agent {
    function create(
        address _depositant,
        address _beneficiary,
        IERC721 _token721,
        uint256 _tokenId,
        IERC20  _token20,
        uint256 _toAgent,
        uint256 _salt,
        bytes calldata _agentData
    ) external returns (bool);

    function cancel(
        bytes32 _escrowId,
        bytes calldata _agentData
    ) external returns (bool);

    function withdraw(
        bytes32 _escrowId,
        address _approved,
        address _to,
        bytes calldata _agentData
    ) external returns (bool);
}