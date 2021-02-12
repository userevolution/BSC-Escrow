# ERC20Escrow

  ## Actors

  - The Depositant: it is in charge of deposit the amount of ERC20 token and can withdraw to the `Beneficiary`

  - The Beneficiary: it can return the tokens to the `Depositant`

  - The agent: Can be a wallet or a contract, and is in a charge of mediating between the `Depositant` and the `Beneficiary`. If the agent is a wallet it will be the sender of the create transaction and can cancel or withdraw to the `Depositant` or the `Beneficiary`. Also, the agent can provide their signature and someone will send the transaction to create an escrow. If the agent is a contract the contract agent should implement the IERC20Agent interface.

  ## Agent fee

  The agent service fee can be between 0% to 10%, in steps of 0.01%

  The ratio Fee is expressed in order of BASE, for example:

  - 10000 represent 100.00 %

  - 1 represent 0.01 %

  - 1000 represent 10.00 % (Maximum agent fee)

  The agent fee be charged on the withdrawal amount and transfer to the agent

  This fee its calculate on base of amount of the withdraw function and substract of amount:

  `toAgent = withdrawAmount * agentFee / BASE`

  `toDepositant/Beneficiary = withdrawAmount - toAgent`

  This `toAgent` amount will be transferred to the ERC20Escrow contract when anyone deposits an amount of ERC20 tokens and will be sent to the agent when the escrow is withdrawn

  In example:

  The escrow haves 1000 BNB, and the `Depositant` withdraw to `Beneficiary` 100 BNB:

  ```
  Escrow {
    agent:       A wallet address,
    depositant:  A wallet address,
    beneficiary: A wallet address,
    agentFee:    900(9 %),
    token:       BNB token,
    balance:     1000 BNB,
  }
  ```

  ```solidity
    withdrawToBeneficiary(escrowId, 100, []);
  ```

  The ERC20Escrow contract calculates:

  `toAgent = 100 BNB * 900 / 10000 = 9 BNB`

  `toDepositant/Beneficiary = 100 BNB - 9 BNB = 91 BNB`

  The escrow balance remains at 900 BNB, the agents haves 9 BNB and the `Depositant` or `Beneficiary` 91

  ## Escrow struct storage

  ```solidity
  struct Escrow {
      address agent;       // The agent address(Agent contract or wallet)
      address depositant;  // The depositant address
      address beneficiary; // The beneficiary address
      uint256 agentFee;    // The fee percentage
      IERC20 token;        // The ERC20 token address
      uint256 balance;     // The actual balance of the escrow
  }
  ```

  ## Functions

  To calculate an escrow id:

  ```solidity
  function calculateId(
      address _agent,           // The agent address(Agent contract or wallet)
      address _depositant,      // The depositant address
      address _beneficiary,     // The beneficiary address
      uint256 _agentFee,        // The fee percentage
      IERC20 _token,            // The ERC20 token address
      uint256 _salt,            // An entropy value, used to generate the id
  ) public view returns(bytes32)
  ```

  To create a new escrow we have 2 functions:

  ```solidity
  function createEscrow(
      address _agent,           // The agent address(Agent contract or wallet)
      address _depositant,      // The depositant address
      address _beneficiary,     // The beneficiary address
      uint256 _agentFee,        // The fee percentage
      IERC20 _token,            // The ERC20 token address
      uint256 _salt,            // An entropy value, used to generate the id
      bytes calldata _agentData // Data uses by agent contract to execute the create function
  ) external returns(bytes32 escrowId);
  ```

  And a create with agent signature:

  ```solidity
  function signCreateEscrow(
      address _agent,                // The agent address(Agent contract or wallet)
      address _depositant,           // The depositant address
      address _beneficiary,          // The beneficiary address
      uint256 _agentFee,             // The fee percentage
      IERC20 _token,                 // The ERC20 token address
      uint256 _salt,                 // An entropy value, used to generate the id
      bytes calldata _agentSignature // The signature provided by the agent
  ) external returns(bytes32 escrowId);
  ```

  To cancel an agent signature, this function should be send by the agent:

  ```solidity
    function cancelSignature(bytes calldata _agentSignature)
  ```

  To deposit an amount of ERC20, although it can be used by anyone, the `Depositor` must be the sender of this transaction:

  ```solidity
  function deposit(
      bytes32 _escrowId, // The escrow id
      uint256 _amount    // Amount of ERC20
  ) external
  ```

  Are two withdraw functions, it change de receiver, one to the `Beneficiary` and the other for `Depositant`

  The receiver of withdrawToBeneficiary function is the `Beneficiary` and can be sent by the `Depositant` or by the wallet agent:

  ```solidity
    function withdrawToBeneficiary(bytes32 _escrowId, uint256 _amount, bytes calldata _agentData) external
  ```

  The receiver of withdrawToDepositant function is the `Depositant` and can be sent by the `Beneficiary` or by the wallet agent:

  ```solidity
    function withdrawToDepositant(bytes32 _escrowId, uint256 _amount, bytes calldata _agentData) external
  ```

  This function is to cancel a wrong escrow, in emergency and only the agent can send this function, the amount of ERC20 transfers to the `Depositant`, if haves balance:

  ```solidity
    function cancel(bytes32 _escrowId, bytes calldata _agentData) external
  ```

  ## IERC20Agent

  But what happens if the agent is a contract...
  The contract agent should respect the IERC20Agent interface:

  ```solidity
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
  ```

  When createEscrow or signCreateEscrow executes, calls the create of contract agent
  When cancel executes, calls the cancel of contract agent
  When withdrawToBeneficiary or withdrawToDepositant executes, calls the withdraw of contract agent
