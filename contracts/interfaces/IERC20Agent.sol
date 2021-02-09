pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";


interface IERC20Agent {
    function create(
        address _depositant,
        address _beneficiary,
        uint256 _agentFee,
        IERC20 _token,
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
        uint256 _amount,
        bytes calldata _agentData
    ) external returns (bool);
}