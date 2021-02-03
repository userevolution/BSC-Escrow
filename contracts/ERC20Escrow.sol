pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";


/**
    @title ERC20 token escrow
    @author Victor Fage <victorfage@gmail.com>
*/
contract ERC20Escrow {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    // Events

    event CreateEscrow(
        bytes32 _escrowId,
        address _agent,
        address _depositant,
        address _beneficiary,
        uint256 _agentFee,
        IERC20 _token,
        uint256 _salt
    );

    event SignCreateEscrow(bytes32 _escrowId, bytes _agentSignature);

    event CancelSignature(bytes _agentSignature);

    event Deposit(bytes32 _escrowId, uint256 _amount);

    event Withdraw(
        bytes32 _escrowId,
        address _sender,
        address _to,
        uint256 _toAmount,
        uint256 _toAgent
    );

    event Cancel(bytes32 _escrowId, uint256 _amount);

    struct Escrow {
        address agent;
        address depositant;
        address beneficiary;
        uint256 agentFee;
        IERC20 token;
        uint256 balance;
    }

    // 10000 ==  100%
    //   505 ==    5.05%
    uint256 public BASE = 10000;
    uint256 private MAX_AGENT_FEE = 1000;

    mapping(bytes32 => Escrow) public escrows;

    mapping (address => mapping (bytes => bool)) public canceledSignatures;

    // View functions

    /**
        @notice Calculate the escrow id

        @dev The id of the escrow its generate with keccak256 function using the parameters of the function

        @param _agent The agent address
        @param _depositant The depositant address
        @param _beneficiary The beneficiary address
        @param _agentFee The fee percentage(calculate in BASE), this fee will sent to the agent when the escrow is withdrawn
        @param _token The token address
        @param _salt An entropy value, used to generate the id

        @return The id of the escrow
    */
    function calculateId(
        address _agent,
        address _depositant,
        address _beneficiary,
        uint256 _agentFee,
        IERC20 _token,
        uint256 _salt
    ) public view returns(bytes32) {
        return keccak256(
            abi.encodePacked(
                address(this),
                _agent,
                _depositant,
                _beneficiary,
                _agentFee,
                _token,
                _salt
            )
        );
    }

    // External functions

    /**
        @notice Create an ERC20 escrow
            Fee: The ratio is expressed in order of BASE, for example
                 1.00% is 100
                50.00% is 5000
                23.45% is 2345

        @dev The id of the escrow its generate with keccak256 function,
            using the address of this contract, the sender(agent), the _depositant,
            the _beneficiary, the _agentFee, the _token and the salt number

            The agent will be the sender of the transaction
            The _agentFee should be low or equal than 1000(10%)

        @param _depositant The depositant address
        @param _beneficiary The retrea    der address
        @param _agentFee The fee percentage(calculate in BASE), this fee will sent to the agent when the escrow is withdrawn
        @param _token The token address
        @param _salt An entropy value, used to generate the id

        @return escrowId The id of the escrow
    */
    function createEscrow(
        address _depositant,
        address _beneficiary,
        uint256 _agentFee,
        IERC20 _token,
        uint256 _salt
    ) external returns(bytes32 escrowId) {
        escrowId = _createEscrow(
            msg.sender,
            _depositant,
            _beneficiary,
            _agentFee,
            _token,
            _salt
        );
    }

    /**
        @notice Create an escrow, using the signature provided by the agent

        @dev The signature can will be cancel with cancelSignature function

        @param _agent The agent address
        @param _depositant The depositant address
        @param _beneficiary The beneficiary address
        @param _agentFee The fee percentage(calculate in BASE), this fee will sent to the agent when the escrow is withdrawn
        @param _token The token address
        @param _salt An entropy value, used to generate the id
        @param _agentSignature The signature provided by the agent

        @return escrowId The id of the escrow
    */
    function signCreateEscrow(
        address _agent,
        address _depositant,
        address _beneficiary,
        uint256 _agentFee,
        IERC20 _token,
        uint256 _salt,
        bytes calldata _agentSignature
    ) external returns(bytes32 escrowId) {
        escrowId = _createEscrow(
            _agent,
            _depositant,
            _beneficiary,
            _agentFee,
            _token,
            _salt
        );

        require(!canceledSignatures[_agent][_agentSignature], "signCreateEscrow: The signature was canceled");

        require(
            _agent == _ecrecovery(keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", escrowId)), _agentSignature),
            "signCreateEscrow: Invalid agent signature"
        );

        emit SignCreateEscrow(escrowId, _agentSignature);
    }

    /**
        @notice Cancel a create escrow signature

        @param _agentSignature The signature provided by the agent
    */
    function cancelSignature(bytes calldata _agentSignature) external {
        canceledSignatures[msg.sender][_agentSignature] = true;

        emit CancelSignature(_agentSignature);
    }

    /**
        @notice Deposit an amount valuate in escrow token to an escrow

        @dev The depositant of the escrow should be the sender, previous need the approve of the ERC20 tokens

        @param _escrowId The id of the escrow
        @param _amount The amount to deposit in an escrow
    */
    function deposit(bytes32 _escrowId, uint256 _amount) external {
        Escrow storage escrow = escrows[_escrowId];
        require(msg.sender == escrow.depositant, "deposit: The sender should be the depositant");

        // Transfer the tokens
        escrow.token.safeTransferFrom(msg.sender, address(this), _amount);

        escrow.balance += _amount;

        emit Deposit(_escrowId, _amount);
    }

    /**
        @notice Withdraw an amount from an escrow and send the tokens to the beneficiary address

        @dev The sender should be the depositant or the agent of the escrow

        @param _escrowId The id of the escrow
        @param _amount The base amount
    */
    function withdrawToBeneficiary(bytes32 _escrowId, uint256 _amount) external {
        Escrow storage escrow = escrows[_escrowId];
        _withdraw(_escrowId, escrow.depositant, escrow.beneficiary, _amount);
    }

    /**
        @notice Withdraw an amount from an escrow and the tokens  send to the depositant address

        @dev The sender should be the beneficiary or the agent of the escrow

        @param _escrowId The id of the escrow
        @param _amount The base amount
    */
    function withdrawToDepositant(bytes32 _escrowId, uint256 _amount) external {
        Escrow storage escrow = escrows[_escrowId];
        _withdraw(_escrowId, escrow.beneficiary, escrow.depositant, _amount);
    }

    /**
        @notice Cancel an escrow and send the balance of the escrow to the depositant address

        @dev The sender should be the agent of the escrow
            The escrow will deleted

        @param _escrowId The id of the escrow
    */
    function cancel(bytes32 _escrowId) external {
        Escrow storage escrow = escrows[_escrowId];
        require(msg.sender == escrow.agent, "cancel: The sender should be the agent");

        uint256 balance = escrow.balance;
        address depositant = escrow.depositant;
        IERC20 token = escrow.token;

        // Delete escrow
        delete escrows[_escrowId];

        // Send the tokens to the depositant if the escrow have balance
        if (balance != 0)
            token.safeTransfer(depositant, balance);

        emit Cancel(_escrowId, balance);
    }

    // Internal functions

    function _createEscrow(
        address _agent,
        address _depositant,
        address _beneficiary,
        uint256 _agentFee,
        IERC20 _token,
        uint256 _salt
    ) internal returns(bytes32 escrowId) {
        require(_agentFee <= MAX_AGENT_FEE, "createEscrow: The agent fee should be low or equal than 1000");

        // Calculate the escrow id
        escrowId = calculateId(
            _agent,
            _depositant,
            _beneficiary,
            _agentFee,
            _token,
            _salt
        );

        // Check if the escrow was created
        require(escrows[escrowId].agent == address(0), "createEscrow: The escrow exists");

        // Add escrow to the escrows array
        escrows[escrowId] = Escrow({
            agent: _agent,
            depositant: _depositant,
            beneficiary: _beneficiary,
            agentFee: _agentFee,
            token: _token,
            balance: 0
        });

        emit CreateEscrow(escrowId, _agent, _depositant, _beneficiary, _agentFee, _token, _salt);
    }

    /**
        @notice Withdraw an amount from an escrow and send to _to address

        @dev The sender should be the _approved or the agent of the escrow

        @param _escrowId The id of the escrow
        @param _approved The address of approved
        @param _to The address of gone the tokens
        @param _amount The base amount
    */
    function _withdraw(
        bytes32 _escrowId,
        address _approved,
        address _to,
        uint256 _amount
    ) internal {
        Escrow storage escrow = escrows[_escrowId];
        require(msg.sender == _approved || msg.sender == escrow.agent, "_withdraw: The sender should be the _approved or the agent");

        // Calculate the fee amount
        uint256 toAgent = _feeAmount(_amount, escrow.agentFee);
        // Actualize escrow balance in storage
        escrow.balance = escrow.balance.sub(_amount);
        // Send fee to the agent
        escrow.token.safeTransfer(escrow.agent, toAgent);
        // Substract the agent fee
        uint256 toAmount = _amount.sub(toAgent);
        // Send amount to the _to
        escrow.token.safeTransfer(_to, toAmount);

        emit Withdraw(_escrowId, msg.sender, _to, toAmount, toAgent);
    }

    /**
        @notice Calculate the fee amount

        @dev Formula: _amount * _fee / BASE

        @param _amount The base amount
        @param _fee The fee

        @return The calculate fee
    */
    function _feeAmount(
        uint256 _amount,
        uint256 _fee
    ) internal view returns(uint256) {
        return _amount.mul(_fee) / BASE;
    }

    function _ecrecovery(bytes32 _hash, bytes memory _sig) internal pure returns (address) {
        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := mload(add(_sig, 32))
            s := mload(add(_sig, 64))
            v := and(mload(add(_sig, 65)), 255)
        }

        if (v < 27) {
            v += 27;
        }

        return ecrecover(_hash, v, r, s);
    }
}
