# ERC721Escrow

  ## Actors

  - The Depositant: it is in charge of deposit the ERC721 token and can withdraw to the `Beneficiary`

  - The Beneficiary: it can return the token to the `Depositant`

  - The agent: Can be a wallet or a contract, and is in a charge of mediating between the `Depositant` and the `Beneficiary`. If the agent is a wallet it will be the sender of the create transaction and can cancel or withdraw to the `Depositant` or the `Beneficiary`. Also, the agent can provide their signature and someone will send the transaction to create an escrow. If the agent is a contract the contract agent should implement the IERC721Agent interface.

  ## Agent fee

  The agent fee is store in the Escrow struct, it haves a `token20`, the address of the ERC20, and `toAgent`, the amount of this ERC20 token

  This `toAgent` amount will be transferred to the ERC721Escrow contract when anyone deposits the ERC721 and will be sent to the agent when the escrow is withdrawn

  ## Escrow struct storage

  ```solidity
  struct Escrow {
      address agent;       // The agent address(Agent contract or wallet)
      address depositant;  // The depositant address
      address beneficiary; // The beneficiary address
      IERC721 token721;    // The ERC721 token address
      uint256 tokenId;     // The id of the ERC721 token
      IERC20  token20;     // The ERC20 token address
      uint256 toAgent;     // The amount of the agent fee
  }
  ```

  ## Functions

  To calculate an escrow id:

  ```solidity
  function calculateId(
      address _agent,       // The agent address(Agent contract or wallet)
      address _depositant,  // The depositant address
      address _beneficiary, // The beneficiary address
      IERC721 _token721;    // The ERC721 token address
      uint256 _tokenId;     // The id of the ERC721 token
      IERC20  _token20;     // The ERC20 token address
      uint256 _toAgent;     // The amount of the agent fee
      uint256 _salt,        // An entropy value, used to generate the id
  ) public view returns(bytes32)
  ```

  To create a new escrow we have 2 functions:

  ```solidity
  function createEscrow(
      address _agent,           // The agent address(Agent contract or wallet)
      address _depositant,      // The depositant address
      address _beneficiary,     // The beneficiary address
      IERC721 _token721;        // The ERC721 token address
      uint256 _tokenId;         // The id of the ERC721 token
      IERC20  _token20;         // The ERC20 token address
      uint256 _toAgent;         // The amount of the agent fee
      uint256 _salt,            // An entropy value, used to generate the id
      bytes calldata _agentData // Data uses by agent contract to execute the create function
  ) external returns(bytes32 escrowId)
  ```

  And a create with agent signature:

  ```solidity
  function signCreateEscrow(
      address _agent,                // The agent address(Agent contract or wallet)
      address _depositant,           // The depositant address
      address _beneficiary,          // The beneficiary address
      IERC721 _token721;             // The ERC721 token address
      uint256 _tokenId;              // The id of the ERC721 token
      IERC20  _token20;              // The ERC20 token address
      uint256 _toAgent;              // The amount of the agent fee
      uint256 _salt,                 // An entropy value, used to generate the id
      bytes calldata _agentSignature // The signature provided by the agent
  ) external returns(bytes32 escrowId);
  ```

  To cancel an agent signature, this function should be send by the agent:

  ```solidity
    function cancelSignature(bytes calldata _agentSignature)
  ```

  To deposit the ERC721 token, although it can be used by anyone, the `Depositor` must be the sender of this transaction:

  ```solidity
    deposit(bytes32 _escrowId) external
  ```

  Are two withdraw functions, it change de receiver, one to the `Beneficiary` and the other for `Depositant`

  The receiver of withdrawToBeneficiary function is the `Beneficiary` and can be sent by the `Depositant` or by the wallet agent:

  ```solidity
    function withdrawToBeneficiary(bytes32 _escrowId, bytes calldata _agentData) external
  ```

  The receiver of withdrawToDepositant function is the `Depositant` and can be sent by the `Beneficiary` or by the wallet agent:

  ```solidity
    function withdrawToDepositant(bytes32 _escrowId, bytes calldata _agentData) external
  ```

  This function is to cancel a wrong escrow, in emergency and only the agent can send this function, the ERC721 token and the amount fee of ERC20 transfers to the `Depositant`, if haves agent fee:

  ```solidity
    function cancel(bytes32 _escrowId, bytes calldata _agentData) external
  ```

  ## IERC721Agent

  But what happens if the agent is a contract...
  The contract agent should respect the IERC721Agent interface:

  ```solidity
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
  ```

  When createEscrow or signCreateEscrow executes, calls the create of contract agent
  When cancel executes, calls the cancel of contract agent
  When withdrawToBeneficiary or withdrawToDepositant executes, calls the withdraw of contract agent
