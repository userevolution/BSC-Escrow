pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./interfaces/IERC721Agent.sol";


/**
    @title ERC721 token escrow
    @author Victor Fage <victorfage@gmail.com>
*/
contract ERC721Escrow {
    using SafeERC20 for IERC20;
    using Address for address;

    // Events

    event CreateEscrow(
        bytes32 _escrowId,
        address _agent,
        address _depositant,
        address _beneficiary,
        IERC721 _token721,
        uint256 _tokenId,
        IERC20  _token20,
        uint256 _toAgent,
        uint256 _salt,
        bytes _agentData
    );

    event SignCreateEscrow(bytes32 _escrowId, bytes _agentSignature);

    event CancelSignature(bytes _agentSignature);

    event Deposit(bytes32 _escrowId);

    event Withdraw(
        bytes32 _escrowId,
        address _sender,
        address _to
    );

    event Cancel(bytes32 _escrowId);

    struct Escrow {
        address agent;
        address depositant;
        address beneficiary;
        IERC721 token721;
        uint256 tokenId;
        IERC20  token20;
        uint256 toAgent;
    }

    mapping (bytes32 => Escrow) public escrows;
    mapping (address => mapping (bytes => bool)) public canceledSignatures;

    // View functions

    /**
        @notice Calculate the escrow id

        @dev The id of the escrow is generated with keccak256 function using the parameters of the function

        @param _agent The agent address(Agent contract or wallet)
        @param _depositant The depositant address
        @param _beneficiary The beneficiary address
        @param _token721 The ERC721 token address
        @param _tokenId The ERC721 token id
        @param _token20 The ERC20 token address
        @param _toAgent The amount to pay the agent service
        @param _salt An entropy value, used to generate the id

        @return The id of the escrow
    */
    function calculateId(
        address _agent,
        address _depositant,
        address _beneficiary,
        IERC721 _token721,
        uint256 _tokenId,
        IERC20  _token20,
        uint256 _toAgent,
        uint256 _salt
    ) public view returns(bytes32) {
        return keccak256(
            abi.encodePacked(
                address(this),
                _agent,
                _depositant,
                _beneficiary,
                _token721,
                _tokenId,
                _token20,
                _toAgent,
                _salt
            )
        );
    }

    // External functions

    /**
        @notice Create an ERC721 escrow

        @dev The id of the escrow is generated with keccak256 function,
            using the address of this contract, the sender(agent), the _depositant,
            the _beneficiary, the _token721, the _tokenId, the _token20, the _toAgent and the salt number

            If the agent is a contact the escrow calls the create function of agent contract
            If the agent is a wallet it will be the sender of the transaction

        @param _agent The agent address(Agent contract or wallet)
        @param _depositant The depositant address
        @param _beneficiary The beneficiary address
        @param _token721 The ERC721 token address
        @param _tokenId The ERC721 token id
        @param _token20 The ERC20 token address
        @param _toAgent The amount to pay the agent service
        @param _salt An entropy value, used to generate the id
        @param _agentData Data uses by agent contract to execute the create function

        @return escrowId The id of the escrow
    */
    function createEscrow(
        address _agent,
        address _depositant,
        address _beneficiary,
        IERC721 _token721,
        uint256 _tokenId,
        IERC20  _token20,
        uint256 _toAgent,
        uint256 _salt,
        bytes calldata _agentData
    ) external returns(bytes32 escrowId) {
        if (_agent != msg.sender)
            require(IERC721Agent(_agent).create(
                _depositant,
                _beneficiary,
                _token721,
                _tokenId,
                _token20,
                _toAgent,
                _salt,
                _agentData
            ), "createEscrow: The agent rejects the create");

        escrowId = _createEscrow(
            _agent,
            _depositant,
            _beneficiary,
            _token721,
            _tokenId,
            _token20,
            _toAgent,
            _salt
        );

        emit CreateEscrow(escrowId, _agent, _depositant, _beneficiary, _token721, _tokenId, _token20, _toAgent, _salt, _agentData);
    }

    /**
        @notice Create an escrow, using the signature provided by the agent

        @dev The signature can be canceled with cancelSignature function

        @param _agent The agent address(Agent contract or wallet)
        @param _depositant The depositant address
        @param _beneficiary The beneficiary address
        @param _token721 The ERC721 token address
        @param _tokenId The ERC721 token id
        @param _token20 The ERC20 token address
        @param _toAgent The amount to pay the agent service
        @param _salt An entropy value, used to generate the id
        @param _agentSignature The signature provided by the agent

        @return escrowId The id of the escrow
    */
    function signCreateEscrow(
        address _agent,
        address _depositant,
        address _beneficiary,
        IERC721 _token721,
        uint256 _tokenId,
        IERC20  _token20,
        uint256 _toAgent,
        uint256 _salt,
        bytes calldata _agentSignature
    ) external returns(bytes32 escrowId) {
        escrowId = _createEscrow(
            _agent,
            _depositant,
            _beneficiary,
            _token721,
            _tokenId,
            _token20,
            _toAgent,
            _salt
        );

        require(!canceledSignatures[_agent][_agentSignature], "signCreateEscrow: The signature was canceled");

        require(
            _agent == _ecrecovery(keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", escrowId)), _agentSignature),
            "signCreateEscrow: Invalid agent signature"
        );

        emit CreateEscrow(escrowId, _agent, _depositant, _beneficiary, _token721, _tokenId, _token20, _toAgent, _salt, "");

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
        @notice Deposit an erc721 token in escrow and the agent service charge

        @dev The depositant of the escrow should be the sender
            Previous need the approval of the ERC721 token and the token amount of the agent service charge

        @param _escrowId The id of the escrow
    */
    function deposit(bytes32 _escrowId) external {
        Escrow storage escrow = escrows[_escrowId];

        // Transfer the tokens
        if (escrow.toAgent != 0)
            escrow.token20.safeTransferFrom(msg.sender, address(this), escrow.toAgent);

        // Transfer the erc721 token
        escrow.token721.transferFrom(msg.sender, address(this), escrow.tokenId);

        emit Deposit(_escrowId);
    }

    /**
        @notice Withdraw an erc721 token from an escrow, send it to the beneficiary address and pay the agent service charge

        @dev The sender should be the depositant or the agent of the escrow

        @param _escrowId The id of the escrow
        @param _agentData Data uses by agent contract to execute withdraw function
    */
    function withdrawToBeneficiary(bytes32 _escrowId, bytes calldata _agentData) external {
        Escrow storage escrow = escrows[_escrowId];
        _withdraw(_escrowId, escrow.depositant, escrow.beneficiary, _agentData);
    }

    /**
        @notice Withdraw an erc721 token from an escrow, send it to the depositant address and pay the agent service charge

        @dev The sender should be the beneficiary or the agent of the escrow

        @param _escrowId The id of the escrow
        @param _agentData Data uses by agent contract to execute withdraw function
    */
    function withdrawToDepositant(bytes32 _escrowId, bytes calldata _agentData) external {
        Escrow storage escrow = escrows[_escrowId];
        _withdraw(_escrowId, escrow.beneficiary, escrow.depositant, _agentData);
    }

    /**
        @notice Cancel an escrow and send the erc721 token and amount of the agent service charge to the depositant address

        @dev If the agent is a contract, the escrow contract call cancel function of the agent
            else the sender should be the agent of the escrow
            The escrow will delete

        @param _escrowId The id of the escrow
        @param _agentData Data uses by agent contract to execute cancel function
    */
    function cancel(bytes32 _escrowId, bytes calldata _agentData) external {
        Escrow storage escrow = escrows[_escrowId];

        if (escrow.agent.isContract()) {
            require(IERC721Agent(escrow.agent).cancel(
                _escrowId,
                _agentData
            ), "cancel: The agent rejects the cancel");
        } else {
            require(msg.sender == escrow.agent, "cancel: The sender should be the agent");
        }

        address depositant = escrow.depositant;
        IERC721 token721 = escrow.token721;
        uint256 tokenId = escrow.tokenId;
        IERC20 token20 = escrow.token20;
        uint256 toAgent = escrow.toAgent;

        // Delete escrow
        delete escrows[_escrowId];

        // Send the tokens to the depositant if the escrow have an agent service charge
        if (toAgent != 0)
            token20.safeTransfer(depositant, toAgent);

        // Send the ERC721 token to the depositant
        token721.safeTransferFrom(address(this), depositant, tokenId);

        emit Cancel(_escrowId);
    }

    // Internal functions

    function _createEscrow(
        address _agent,
        address _depositant,
        address _beneficiary,
        IERC721 _token721,
        uint256 _tokenId,
        IERC20  _token20,
        uint256 _toAgent,
        uint256 _salt
    ) internal returns(bytes32 escrowId) {
        // Calculate the escrow id
        escrowId = calculateId(
            _agent,
            _depositant,
            _beneficiary,
            _token721,
            _tokenId,
            _token20,
            _toAgent,
            _salt
        );

        // Check if the escrow was created
        require(escrows[escrowId].agent == address(0), "createEscrow: The escrow exists");

        // Add escrow to the escrows array
        escrows[escrowId] = Escrow({
            agent:       _agent,
            depositant:  _depositant,
            beneficiary: _beneficiary,
            token721:    _token721,
            tokenId:     _tokenId,
            token20:     _token20,
            toAgent:     _toAgent
        });
    }

    /**
        @notice Withdraw an erc721 token from an escrow and send it to _to address

        @dev The sender should be the _approved or the agent of the escrow

        @param _escrowId The id of the escrow
        @param _approved The address of approved
        @param _to The address of gone the tokens
        @param _agentData Data uses by agent contract to execute withdraw function
    */
    function _withdraw(
        bytes32 _escrowId,
        address _approved,
        address _to,
        bytes calldata _agentData
    ) internal {
        Escrow storage escrow = escrows[_escrowId];

        if (msg.sender != _approved) {
            if (escrow.agent.isContract()) {
                require(IERC721Agent(escrow.agent).withdraw(
                    _escrowId,
                    _approved,
                    _to,
                    _agentData
                ), "_withdraw: The agent rejects the withdraw");
            } else {
              require(msg.sender == escrow.agent, "_withdraw: The sender should be the _approved or the agent");
            }
        }

        if (escrow.toAgent != 0)
            escrow.token20.safeTransfer(escrow.agent, escrow.toAgent);

        escrow.token721.safeTransferFrom(address(this), _to, escrow.tokenId);

        emit Withdraw(_escrowId, msg.sender, _to);
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
