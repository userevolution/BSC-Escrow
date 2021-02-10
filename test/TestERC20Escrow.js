const TestToken = artifacts.require('TestToken');
const TestERC20Agent = artifacts.require('TestERC20Agent');

const ERC20Escrow = artifacts.require('ERC20Escrow');

const {
  bn,
  expect,
  toEvents,
  tryCatchRevert,
  address0x,
  maxUint,
  random32,
  random32bn,
} = require('./Helper.js');

contract('ERC20Escrow', (accounts) => {
  const WEI = bn(web3.utils.toWei('1'));
  let BASE;

  const owner = accounts[1];
  const creator = accounts[2];
  const agent = accounts[5];
  const depositant = accounts[3];
  const beneficiary = accounts[4];

  let prevBalOwner = 0;
  let prevBalCreator = 0;
  let prevBalDepositant = 0;
  let prevBalBeneficiary = 0;
  let prevBalAgent = 0;
  let prevBalContractAgent = 0;
  let prevBalEscrow = 0;
  let prevBalERC20Escrow = 0;

  let erc20Escrow;
  let erc20;
  let erc20Agent;

  let salt = 0;
  let basicEscrow;

  async function setApproveBalance (beneficiary, amount) {
    await erc20.setBalance(beneficiary, amount, { from: owner });
    await erc20.approve(erc20Escrow.address, amount, { from: beneficiary });
  }

  async function saveBalances (escrowId) {
    prevBalOwner = await erc20.balanceOf(owner);
    prevBalCreator = await erc20.balanceOf(creator);
    prevBalAgent = await erc20.balanceOf(agent);
    prevBalContractAgent = await erc20.balanceOf(erc20Agent.address);
    prevBalDepositant = await erc20.balanceOf(depositant);
    prevBalBeneficiary = await erc20.balanceOf(beneficiary);

    const escrow = await erc20Escrow.escrows(escrowId);
    prevBalEscrow = escrow.balance;
    prevBalERC20Escrow = await erc20.balanceOf(erc20Escrow.address);
  }

  async function calcId (agent, depositant, beneficiary, fee, token, salt) {
    const id = await erc20Escrow.calculateId(
      agent,
      depositant,
      beneficiary,
      fee,
      token,
      salt,
    );

    const localId = web3.utils.soliditySha3(
      { t: 'address', v: erc20Escrow.address },
      { t: 'address', v: agent },
      { t: 'address', v: depositant },
      { t: 'address', v: beneficiary },
      { t: 'uint256', v: fee },
      { t: 'address', v: token },
      { t: 'uint256', v: salt },
    );

    assert.equal(id, localId);

    return id;
  }

  async function createBasicEscrow (agent = basicEscrow.agent) {
    basicEscrow.salt = ++salt;

    await erc20Escrow.createEscrow(
      agent,
      basicEscrow.depositant,
      basicEscrow.beneficiary,
      basicEscrow.agentFee,
      basicEscrow.token,
      basicEscrow.salt,
      basicEscrow.agentData,
      { from: basicEscrow.agent },
    );

    return calcId(agent, basicEscrow.depositant, basicEscrow.beneficiary, basicEscrow.agentFee, basicEscrow.token, basicEscrow.salt);
  }

  async function deposit (escrowId, amount = WEI) {
    const escrow = await erc20Escrow.escrows(escrowId);
    await setApproveBalance(escrow.depositant, amount);

    await erc20Escrow.deposit(escrowId, amount, { from: escrow.depositant });
  }

  before('Deploy contracts', async () => {
    erc20Escrow = await ERC20Escrow.new({ from: owner });

    erc20 = await TestToken.new({ from: owner });

    erc20Agent = await TestERC20Agent.new({ from: owner });

    BASE = await erc20Escrow.BASE();

    basicEscrow = {
      agent: agent,
      depositant: depositant,
      beneficiary: beneficiary,
      agentFee: 500,
      token: erc20.address,
      salt: salt,
      agentData: '0x01',
    };
  });

  describe('Try execute functions with non-exists escrow', function () {
    it('Try deposit in non-exists escrow', async () => {
      await tryCatchRevert(
        () => erc20Escrow.deposit(
          random32(),
          0,
          { from: agent },
        ),
        'Address: call to non-contract.',
      );
    });
    it('Try withdraw to beneficiary of non-exists escrow', async () => {
      await tryCatchRevert(
        () => erc20Escrow.withdrawToBeneficiary(
          random32(),
          0,
          [],
          { from: agent },
        ),
        '_withdraw: The sender should be the _approved or the agent',
      );
    });
    it('Try withdraw to depositant of non-exists escrow', async () => {
      await tryCatchRevert(
        () => erc20Escrow.withdrawToDepositant(
          random32(),
          0,
          [],
          { from: agent },
        ),
        '_withdraw: The sender should be the _approved or the agent',
      );
    });
    it('Try cancel an non-exists escrow', async () => {
      await tryCatchRevert(
        () => erc20Escrow.cancel(
          random32(),
          [],
          { from: agent },
        ),
        'cancel: The sender should be the agent',
      );
    });
  });
  describe('Function createEscrow', function () {
    it('Create basic escrow', async () => {
      const salt = random32bn();
      const id = await calcId(agent, depositant, beneficiary, 0, erc20.address, salt);

      const CreateEscrow = await toEvents(
        erc20Escrow.createEscrow(
          agent,
          depositant,
          beneficiary,
          0,
          erc20.address,
          salt,
          [],
          { from: agent },
        ),
        'CreateEscrow',
      );

      assert.equal(CreateEscrow._escrowId, id);
      assert.equal(CreateEscrow._agent, agent);
      assert.equal(CreateEscrow._depositant, depositant);
      assert.equal(CreateEscrow._beneficiary, beneficiary);
      expect(CreateEscrow._agentFee).to.eq.BN(0);
      assert.equal(CreateEscrow._token, erc20.address);
      expect(CreateEscrow._salt).to.eq.BN(salt);
      assert.equal(CreateEscrow._agentData, null);

      const escrow = await erc20Escrow.escrows(id);
      assert.equal(escrow.agent, agent);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.beneficiary, beneficiary);
      expect(escrow.agentFee).to.eq.BN(0);
      assert.equal(escrow.token, erc20.address);
      expect(escrow.balance).to.eq.BN(0);
    });
    it('Create a basic escrow with a contract agent as agent', async () => {
      const salt = random32bn();
      const id = await calcId(erc20Agent.address, depositant, beneficiary, 0, erc20.address, salt);

      const CreateEscrow = await toEvents(
        erc20Escrow.createEscrow(
          erc20Agent.address,
          depositant,
          beneficiary,
          0,
          erc20.address,
          salt,
          '0x01',
          { from: owner },
        ),
        'CreateEscrow',
      );

      assert.equal(CreateEscrow._escrowId, id);
      assert.equal(CreateEscrow._agent, erc20Agent.address);
      assert.equal(CreateEscrow._depositant, depositant);
      assert.equal(CreateEscrow._beneficiary, beneficiary);
      expect(CreateEscrow._agentFee).to.eq.BN(0);
      assert.equal(CreateEscrow._token, erc20.address);
      expect(CreateEscrow._salt).to.eq.BN(salt);
      assert.equal(CreateEscrow._agentData, '0x01');

      const escrow = await erc20Escrow.escrows(id);
      assert.equal(escrow.agent, erc20Agent.address);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.beneficiary, beneficiary);
      expect(escrow.agentFee).to.eq.BN(0);
      assert.equal(escrow.token, erc20.address);
      expect(escrow.balance).to.eq.BN(0);
    });
    it('Try create an escrow and the contract agent rejects', async () => {
      await tryCatchRevert(
        () => erc20Escrow.createEscrow(
          erc20Agent.address,
          depositant,
          beneficiary,
          0,
          erc20.address,
          random32bn(),
          [],
          { from: owner },
        ),
        'createEscrow: The agent rejects the create',
      );
    });
    it('Try create two escrows with the same id', async () => {
      const escrowId = await createBasicEscrow();

      await tryCatchRevert(
        () => erc20Escrow.createEscrow(
          basicEscrow.agent,
          basicEscrow.depositant,
          basicEscrow.beneficiary,
          basicEscrow.agentFee,
          basicEscrow.token,
          basicEscrow.salt,
          basicEscrow.agentData,
          { from: basicEscrow.agent },
        ),
        'createEscrow: The escrow exists',
      );

      // With signature
      const agentSignature = await web3.eth.sign(escrowId, basicEscrow.agent);
      await tryCatchRevert(
        () => erc20Escrow.signCreateEscrow(
          basicEscrow.agent,
          basicEscrow.depositant,
          basicEscrow.beneficiary,
          basicEscrow.agentFee,
          basicEscrow.token,
          basicEscrow.salt,
          agentSignature,
          { from: creator },
        ),
        'createEscrow: The escrow exists',
      );
    });
    it('Try set a higth agent fee(>10%)', async () => {
      await tryCatchRevert(
        () => erc20Escrow.createEscrow(
          creator,
          depositant,
          beneficiary,
          1001,
          erc20.address,
          random32bn(),
          [],
          { from: creator },
        ),
        'createEscrow: The agent fee should be low or equal than 1000',
      );
      await tryCatchRevert(
        () => erc20Escrow.createEscrow(
          creator,
          depositant,
          beneficiary,
          maxUint(256),
          erc20.address,
          random32bn(),
          [],
          { from: creator },
        ),
        'createEscrow: The agent fee should be low or equal than 1000',
      );
    });
  });
  describe('Function signCreateEscrow', function () {
    it('create a signed basic escrow', async () => {
      const salt = random32bn();
      const id = await calcId(agent, depositant, beneficiary, 0, erc20.address, salt);

      const agentSignature = await web3.eth.sign(id, agent);

      const events = await toEvents(
        erc20Escrow.signCreateEscrow(
          agent,
          depositant,
          beneficiary,
          0,
          erc20.address,
          salt,
          agentSignature,
          { from: creator },
        ),
        'CreateEscrow',
        'SignCreateEscrow',
      );

      const CreateEscrow = events[0];
      assert.equal(CreateEscrow._escrowId, id);
      assert.equal(CreateEscrow._agent, agent);
      assert.equal(CreateEscrow._depositant, depositant);
      assert.equal(CreateEscrow._beneficiary, beneficiary);
      expect(CreateEscrow._agentFee).to.eq.BN(0);
      assert.equal(CreateEscrow._token, erc20.address);
      expect(CreateEscrow._salt).to.eq.BN(salt);
      assert.equal(CreateEscrow._agentData, null);

      const SignCreateEscrow = events[1];
      assert.equal(SignCreateEscrow._escrowId, id);
      assert.equal(SignCreateEscrow._agentSignature, agentSignature);
    });
    it('Try create two escrows with the same id', async () => {
      const salt = random32bn();
      const id = await calcId(agent, depositant, beneficiary, 0, erc20.address, salt);

      const agentSignature = await web3.eth.sign(id, agent);

      await erc20Escrow.signCreateEscrow(
        agent,
        depositant,
        beneficiary,
        0,
        erc20.address,
        salt,
        agentSignature,
        { from: creator },
      );

      await tryCatchRevert(
        () => erc20Escrow.createEscrow(
          agent,
          depositant,
          beneficiary,
          0,
          erc20.address,
          salt,
          [],
          { from: agent },
        ),
        'createEscrow: The escrow exists',
      );

      await tryCatchRevert(
        () => erc20Escrow.signCreateEscrow(
          agent,
          depositant,
          beneficiary,
          0,
          erc20.address,
          salt,
          agentSignature,
          { from: creator },
        ),
        'createEscrow: The escrow exists',
      );
    });
    it('try create a signed basic escrow with invalid signature', async () => {
      const salt = random32bn();

      // With wrong id
      const wrongSignature = await web3.eth.sign([], agent);
      await tryCatchRevert(
        () => erc20Escrow.signCreateEscrow(
          agent,
          depositant,
          beneficiary,
          0,
          erc20.address,
          salt,
          wrongSignature,
          { from: creator },
        ),
        'signCreateEscrow: Invalid agent signature',
      );

      // With wrong agent in calcId
      const id = await calcId(creator, depositant, beneficiary, 0, erc20.address, salt);
      const wrongSignature2 = await web3.eth.sign(id, agent);

      await tryCatchRevert(
        () => erc20Escrow.signCreateEscrow(
          agent,
          depositant,
          beneficiary,
          0,
          erc20.address,
          salt,
          wrongSignature2,
          { from: creator },
        ),
        'signCreateEscrow: Invalid agent signature',
      );

      // With wrong signer
      const wrongSignature3 = await web3.eth.sign(id, creator);

      await tryCatchRevert(
        () => erc20Escrow.signCreateEscrow(
          agent,
          depositant,
          beneficiary,
          0,
          erc20.address,
          salt,
          wrongSignature3,
          { from: creator },
        ),
        'signCreateEscrow: Invalid agent signature',
      );
    });
    it('try create a signed basic escrow with canceled signature', async () => {
      const id = await calcId(agent, depositant, beneficiary, 0, erc20.address, salt);
      const canceledSignature = await web3.eth.sign(id, agent);

      await erc20Escrow.cancelSignature(canceledSignature, { from: agent });

      await tryCatchRevert(
        () => erc20Escrow.signCreateEscrow(
          agent,
          depositant,
          beneficiary,
          0,
          erc20.address,
          salt,
          canceledSignature,
          { from: creator },
        ),
        'signCreateEscrow: The signature was canceled',
      );
    });
  });
  describe('Function cancelSignature', function () {
    it('cancel a signature', async () => {
      const salt = random32bn();
      const id = await calcId(agent, depositant, beneficiary, 0, erc20.address, salt);

      const agentSignature = await web3.eth.sign(id, agent);

      assert.isFalse(await erc20Escrow.canceledSignatures(agent, agentSignature));

      const CancelSignature = await toEvents(
        erc20Escrow.cancelSignature(
          agentSignature,
          { from: agent },
        ),
        'CancelSignature',
      );

      assert.equal(CancelSignature._agentSignature, agentSignature);
      assert.isTrue(await erc20Escrow.canceledSignatures(agent, agentSignature));
    });
  });
  describe('Function deposit', function () {
    it('Deposit erc20 in an escrow', async () => {
      const escrowId = await createBasicEscrow();
      const amount = WEI;

      await setApproveBalance(depositant, amount);
      await saveBalances(escrowId);

      const Deposit = await toEvents(
        erc20Escrow.deposit(
          escrowId,
          amount,
          { from: depositant },
        ),
        'Deposit',
      );

      assert.equal(Deposit._escrowId, escrowId);
      expect(Deposit._amount).to.eq.BN(amount);

      const escrow = await erc20Escrow.escrows(escrowId);
      assert.equal(escrow.agent, agent);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.beneficiary, beneficiary);
      expect(escrow.agentFee).to.eq.BN(500);
      assert.equal(escrow.token, erc20.address);

      expect(await erc20.balanceOf(owner)).to.eq.BN(prevBalOwner);
      expect(await erc20.balanceOf(creator)).to.eq.BN(prevBalCreator);
      expect(await erc20.balanceOf(agent)).to.eq.BN(prevBalAgent);
      expect(await erc20.balanceOf(erc20Agent.address)).to.eq.BN(prevBalContractAgent);
      expect(await erc20.balanceOf(depositant)).to.eq.BN(prevBalDepositant.sub(amount));
      expect(await erc20.balanceOf(beneficiary)).to.eq.BN(prevBalBeneficiary);

      expect(escrow.balance).to.eq.BN(prevBalEscrow.add(amount));
      expect(await erc20.balanceOf(erc20Escrow.address)).to.eq.BN(prevBalERC20Escrow.add(amount));
    });
    it('Deposit 0 amount in an escrow', async () => {
      const escrowId = await createBasicEscrow();
      const amount = bn(0);

      await setApproveBalance(depositant, amount);
      await saveBalances(escrowId);

      const Deposit = await toEvents(
        erc20Escrow.deposit(
          escrowId,
          amount,
          { from: depositant },
        ),
        'Deposit',
      );

      assert.equal(Deposit._escrowId, escrowId);
      expect(Deposit._amount).to.eq.BN(amount);

      const escrow = await erc20Escrow.escrows(escrowId);
      assert.equal(escrow.agent, agent);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.beneficiary, beneficiary);
      expect(escrow.agentFee).to.eq.BN(500);
      assert.equal(escrow.token, erc20.address);

      expect(await erc20.balanceOf(owner)).to.eq.BN(prevBalOwner);
      expect(await erc20.balanceOf(creator)).to.eq.BN(prevBalCreator);
      expect(await erc20.balanceOf(agent)).to.eq.BN(prevBalAgent);
      expect(await erc20.balanceOf(erc20Agent.address)).to.eq.BN(prevBalContractAgent);
      expect(await erc20.balanceOf(depositant)).to.eq.BN(prevBalDepositant);
      expect(await erc20.balanceOf(beneficiary)).to.eq.BN(prevBalBeneficiary);

      expect(escrow.balance).to.eq.BN(prevBalEscrow);
      expect(await erc20.balanceOf(erc20Escrow.address)).to.eq.BN(prevBalERC20Escrow);
    });
    it('Deposit higth amount in an escrow', async () => {
      const escrowId = await createBasicEscrow();
      const amount = maxUint(240);

      await setApproveBalance(depositant, amount);
      await saveBalances(escrowId);

      const Deposit = await toEvents(
        erc20Escrow.deposit(
          escrowId,
          amount,
          { from: depositant },
        ),
        'Deposit',
      );

      assert.equal(Deposit._escrowId, escrowId);
      expect(Deposit._amount).to.eq.BN(amount);

      const escrow = await erc20Escrow.escrows(escrowId);
      assert.equal(escrow.agent, agent);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.beneficiary, beneficiary);
      expect(escrow.agentFee).to.eq.BN(500);
      assert.equal(escrow.token, erc20.address);

      expect(await erc20.balanceOf(owner)).to.eq.BN(prevBalOwner);
      expect(await erc20.balanceOf(creator)).to.eq.BN(prevBalCreator);
      expect(await erc20.balanceOf(agent)).to.eq.BN(prevBalAgent);
      expect(await erc20.balanceOf(erc20Agent.address)).to.eq.BN(prevBalContractAgent);
      expect(await erc20.balanceOf(depositant)).to.eq.BN(prevBalDepositant.sub(amount));
      expect(await erc20.balanceOf(beneficiary)).to.eq.BN(prevBalBeneficiary);

      expect(escrow.balance).to.eq.BN(prevBalEscrow.add(amount));
      expect(await erc20.balanceOf(erc20Escrow.address)).to.eq.BN(prevBalERC20Escrow.add(amount));
    });
  });
  describe('Function withdrawToBeneficiary', function () {
    it('Withdraw to beneficiary an escrow from depositant', async () => {
      const escrowId = await createBasicEscrow();
      await deposit(escrowId);
      const amount = WEI.div(bn(2));

      await saveBalances(escrowId);

      const Withdraw = await toEvents(
        erc20Escrow.withdrawToBeneficiary(
          escrowId,
          amount,
          [],
          { from: depositant },
        ),
        'Withdraw',
      );

      assert.equal(Withdraw._escrowId, escrowId);
      assert.equal(Withdraw._sender, depositant);
      assert.equal(Withdraw._to, beneficiary);
      const escrow = await erc20Escrow.escrows(escrowId);
      const toAgent = amount.mul(escrow.agentFee).div(BASE);
      const toAmount = amount.sub(toAgent);
      expect(Withdraw._toAmount).to.eq.BN(toAmount);
      expect(Withdraw._toAgent).to.eq.BN(toAgent);

      assert.equal(escrow.agent, agent);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.beneficiary, beneficiary);
      expect(escrow.agentFee).to.eq.BN(500);
      assert.equal(escrow.token, erc20.address);

      expect(await erc20.balanceOf(owner)).to.eq.BN(prevBalOwner);
      expect(await erc20.balanceOf(creator)).to.eq.BN(prevBalCreator);
      expect(await erc20.balanceOf(agent)).to.eq.BN(prevBalAgent.add(toAgent));
      expect(await erc20.balanceOf(erc20Agent.address)).to.eq.BN(prevBalContractAgent);
      expect(await erc20.balanceOf(depositant)).to.eq.BN(prevBalDepositant);
      expect(await erc20.balanceOf(beneficiary)).to.eq.BN(prevBalBeneficiary.add(toAmount));

      expect(escrow.balance).to.eq.BN(prevBalEscrow.sub(amount));
      expect(await erc20.balanceOf(erc20Escrow.address)).to.eq.BN(prevBalERC20Escrow.sub(amount));
    });
    it('Withdraw to beneficiary an escrow from agent', async () => {
      const escrowId = await createBasicEscrow();
      await deposit(escrowId);
      const amount = WEI.div(bn(2));

      await saveBalances(escrowId);

      const Withdraw = await toEvents(
        erc20Escrow.withdrawToBeneficiary(
          escrowId,
          amount,
          [],
          { from: agent },
        ),
        'Withdraw',
      );

      assert.equal(Withdraw._escrowId, escrowId);
      assert.equal(Withdraw._sender, agent);
      assert.equal(Withdraw._to, beneficiary);
      const escrow = await erc20Escrow.escrows(escrowId);
      const toAgent = amount.mul(escrow.agentFee).div(BASE);
      const toAmount = amount.sub(toAgent);
      expect(Withdraw._toAmount).to.eq.BN(toAmount);
      expect(Withdraw._toAgent).to.eq.BN(toAgent);

      assert.equal(escrow.agent, agent);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.beneficiary, beneficiary);
      expect(escrow.agentFee).to.eq.BN(500);
      assert.equal(escrow.token, erc20.address);

      expect(await erc20.balanceOf(owner)).to.eq.BN(prevBalOwner);
      expect(await erc20.balanceOf(creator)).to.eq.BN(prevBalCreator);
      expect(await erc20.balanceOf(agent)).to.eq.BN(prevBalAgent.add(toAgent));
      expect(await erc20.balanceOf(erc20Agent.address)).to.eq.BN(prevBalContractAgent);
      expect(await erc20.balanceOf(depositant)).to.eq.BN(prevBalDepositant);
      expect(await erc20.balanceOf(beneficiary)).to.eq.BN(prevBalBeneficiary.add(toAmount));

      expect(escrow.balance).to.eq.BN(prevBalEscrow.sub(amount));
      expect(await erc20.balanceOf(erc20Escrow.address)).to.eq.BN(prevBalERC20Escrow.sub(amount));
    });
    it('Withdraw to beneficiary 0 amount', async () => {
      const escrowId = await createBasicEscrow();
      await deposit(escrowId);
      const amount = bn(0);

      await saveBalances(escrowId);

      const Withdraw = await toEvents(
        erc20Escrow.withdrawToBeneficiary(
          escrowId,
          amount,
          [],
          { from: depositant },
        ),
        'Withdraw',
      );

      assert.equal(Withdraw._escrowId, escrowId);
      assert.equal(Withdraw._sender, depositant);
      assert.equal(Withdraw._to, beneficiary);
      const escrow = await erc20Escrow.escrows(escrowId);
      const toAgent = amount.mul(escrow.agentFee).div(BASE);
      const toAmount = amount.sub(toAgent);
      expect(Withdraw._toAmount).to.eq.BN(toAmount);
      expect(Withdraw._toAgent).to.eq.BN(toAgent);

      assert.equal(escrow.agent, agent);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.beneficiary, beneficiary);
      expect(escrow.agentFee).to.eq.BN(500);
      assert.equal(escrow.token, erc20.address);

      expect(await erc20.balanceOf(owner)).to.eq.BN(prevBalOwner);
      expect(await erc20.balanceOf(creator)).to.eq.BN(prevBalCreator);
      expect(await erc20.balanceOf(agent)).to.eq.BN(prevBalAgent.add(toAgent));
      expect(await erc20.balanceOf(erc20Agent.address)).to.eq.BN(prevBalContractAgent);
      expect(await erc20.balanceOf(depositant)).to.eq.BN(prevBalDepositant);
      expect(await erc20.balanceOf(beneficiary)).to.eq.BN(prevBalBeneficiary.add(toAmount));

      expect(escrow.balance).to.eq.BN(prevBalEscrow.sub(amount));
      expect(await erc20.balanceOf(erc20Escrow.address)).to.eq.BN(prevBalERC20Escrow.sub(amount));
    });
    it('Withdraw to beneficiary an escrow with a contract agent as agent from depositant', async () => {
      const escrowId = await createBasicEscrow(erc20Agent.address);
      await deposit(escrowId);
      const amount = WEI.div(bn(2));

      await saveBalances(escrowId);

      const Withdraw = await toEvents(
        erc20Escrow.withdrawToBeneficiary(
          escrowId,
          amount,
          [],
          { from: depositant },
        ),
        'Withdraw',
      );

      assert.equal(Withdraw._escrowId, escrowId);
      assert.equal(Withdraw._sender, depositant);
      assert.equal(Withdraw._to, beneficiary);
      const escrow = await erc20Escrow.escrows(escrowId);
      const toAgent = amount.mul(escrow.agentFee).div(BASE);
      const toAmount = amount.sub(toAgent);
      expect(Withdraw._toAmount).to.eq.BN(toAmount);
      expect(Withdraw._toAgent).to.eq.BN(toAgent);

      assert.equal(escrow.agent, erc20Agent.address);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.beneficiary, beneficiary);
      expect(escrow.agentFee).to.eq.BN(500);
      assert.equal(escrow.token, erc20.address);

      expect(await erc20.balanceOf(owner)).to.eq.BN(prevBalOwner);
      expect(await erc20.balanceOf(creator)).to.eq.BN(prevBalCreator);
      expect(await erc20.balanceOf(agent)).to.eq.BN(prevBalAgent);
      expect(await erc20.balanceOf(erc20Agent.address)).to.eq.BN(prevBalContractAgent.add(toAgent));
      expect(await erc20.balanceOf(depositant)).to.eq.BN(prevBalDepositant);
      expect(await erc20.balanceOf(beneficiary)).to.eq.BN(prevBalBeneficiary.add(toAmount));

      expect(escrow.balance).to.eq.BN(prevBalEscrow.sub(amount));
      expect(await erc20.balanceOf(erc20Escrow.address)).to.eq.BN(prevBalERC20Escrow.sub(amount));
    });
    it('Withdraw to beneficiary an escrow with a contract agent as agent from agent', async () => {
      const escrowId = await createBasicEscrow(erc20Agent.address);
      await deposit(escrowId);
      const amount = WEI.div(bn(2));

      await saveBalances(escrowId);

      const Withdraw = await toEvents(
        erc20Escrow.withdrawToBeneficiary(
          escrowId,
          amount,
          '0x01',
          { from: owner },
        ),
        'Withdraw',
      );

      assert.equal(Withdraw._escrowId, escrowId);
      assert.equal(Withdraw._sender, owner);
      assert.equal(Withdraw._to, beneficiary);
      const escrow = await erc20Escrow.escrows(escrowId);
      const toAgent = amount.mul(escrow.agentFee).div(BASE);
      const toAmount = amount.sub(toAgent);
      expect(Withdraw._toAmount).to.eq.BN(toAmount);
      expect(Withdraw._toAgent).to.eq.BN(toAgent);

      assert.equal(escrow.agent, erc20Agent.address);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.beneficiary, beneficiary);
      expect(escrow.agentFee).to.eq.BN(500);
      assert.equal(escrow.token, erc20.address);

      expect(await erc20.balanceOf(owner)).to.eq.BN(prevBalOwner);
      expect(await erc20.balanceOf(creator)).to.eq.BN(prevBalCreator);
      expect(await erc20.balanceOf(agent)).to.eq.BN(prevBalAgent);
      expect(await erc20.balanceOf(erc20Agent.address)).to.eq.BN(prevBalContractAgent.add(toAgent));
      expect(await erc20.balanceOf(depositant)).to.eq.BN(prevBalDepositant);
      expect(await erc20.balanceOf(beneficiary)).to.eq.BN(prevBalBeneficiary.add(toAmount));

      expect(escrow.balance).to.eq.BN(prevBalEscrow.sub(amount));
      expect(await erc20.balanceOf(erc20Escrow.address)).to.eq.BN(prevBalERC20Escrow.sub(amount));
    });
    it('Try withdraw to beneficiary an escrow and the contract agent rejects', async () => {
      const escrowId = await createBasicEscrow(erc20Agent.address);

      await tryCatchRevert(
        () => erc20Escrow.withdrawToBeneficiary(
          escrowId,
          0,
          [],
          { from: owner },
        ),
        '_withdraw: The agent rejects the withdraw',
      );
    });
    it('Try withdraw to beneficiary without be the depositant or the agent', async () => {
      const escrowId = await createBasicEscrow();

      await tryCatchRevert(
        () => erc20Escrow.withdrawToBeneficiary(
          escrowId,
          0,
          [],
          { from: beneficiary },
        ),
        '_withdraw: The sender should be the _approved or the agent',
      );

      await tryCatchRevert(
        () => erc20Escrow.withdrawToBeneficiary(
          escrowId,
          0,
          [],
          { from: creator },
        ),
        '_withdraw: The sender should be the _approved or the agent',
      );
    });
    it('Try subtraction overflow', async () => {
      const escrowId = await createBasicEscrow();

      await tryCatchRevert(
        () => erc20Escrow.withdrawToBeneficiary(
          escrowId,
          1,
          [],
          { from: depositant },
        ),
        'SafeMath: subtraction overflow',
      );
    });
  });
  describe('Function withdrawToDepositant', function () {
    it('Withdraw to depositant an escrow from beneficiary', async () => {
      const escrowId = await createBasicEscrow();
      await deposit(escrowId);
      const amount = WEI.div(bn(2));

      await saveBalances(escrowId);

      const Withdraw = await toEvents(
        erc20Escrow.withdrawToDepositant(
          escrowId,
          amount,
          [],
          { from: beneficiary },
        ),
        'Withdraw',
      );

      assert.equal(Withdraw._escrowId, escrowId);
      assert.equal(Withdraw._sender, beneficiary);
      assert.equal(Withdraw._to, depositant);
      const escrow = await erc20Escrow.escrows(escrowId);
      const toAgent = amount.mul(escrow.agentFee).div(BASE);
      const toAmount = amount.sub(toAgent);
      expect(Withdraw._toAmount).to.eq.BN(toAmount);
      expect(Withdraw._toAgent).to.eq.BN(toAgent);

      assert.equal(escrow.agent, agent);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.beneficiary, beneficiary);
      expect(escrow.agentFee).to.eq.BN(500);
      assert.equal(escrow.token, erc20.address);

      expect(await erc20.balanceOf(owner)).to.eq.BN(prevBalOwner);
      expect(await erc20.balanceOf(creator)).to.eq.BN(prevBalCreator);
      expect(await erc20.balanceOf(agent)).to.eq.BN(prevBalAgent.add(toAgent));
      expect(await erc20.balanceOf(erc20Agent.address)).to.eq.BN(prevBalContractAgent);
      expect(await erc20.balanceOf(depositant)).to.eq.BN(prevBalDepositant.add(toAmount));
      expect(await erc20.balanceOf(beneficiary)).to.eq.BN(prevBalBeneficiary);

      expect(escrow.balance).to.eq.BN(prevBalEscrow.sub(amount));
      expect(await erc20.balanceOf(erc20Escrow.address)).to.eq.BN(prevBalERC20Escrow.sub(amount));
    });
    it('Withdraw to depositant an escrow from agent', async () => {
      const escrowId = await createBasicEscrow();
      await deposit(escrowId);
      const amount = WEI.div(bn(2));

      await saveBalances(escrowId);

      const Withdraw = await toEvents(
        erc20Escrow.withdrawToDepositant(
          escrowId,
          amount,
          [],
          { from: agent },
        ),
        'Withdraw',
      );

      assert.equal(Withdraw._escrowId, escrowId);
      assert.equal(Withdraw._sender, agent);
      assert.equal(Withdraw._to, depositant);
      const escrow = await erc20Escrow.escrows(escrowId);
      const toAgent = amount.mul(escrow.agentFee).div(BASE);
      const toAmount = amount.sub(toAgent);
      expect(Withdraw._toAmount).to.eq.BN(toAmount);
      expect(Withdraw._toAgent).to.eq.BN(toAgent);

      assert.equal(escrow.agent, agent);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.beneficiary, beneficiary);
      expect(escrow.agentFee).to.eq.BN(500);
      assert.equal(escrow.token, erc20.address);

      expect(await erc20.balanceOf(owner)).to.eq.BN(prevBalOwner);
      expect(await erc20.balanceOf(creator)).to.eq.BN(prevBalCreator);
      expect(await erc20.balanceOf(agent)).to.eq.BN(prevBalAgent.add(toAgent));
      expect(await erc20.balanceOf(erc20Agent.address)).to.eq.BN(prevBalContractAgent);
      expect(await erc20.balanceOf(depositant)).to.eq.BN(prevBalDepositant.add(toAmount));
      expect(await erc20.balanceOf(beneficiary)).to.eq.BN(prevBalBeneficiary);

      expect(escrow.balance).to.eq.BN(prevBalEscrow.sub(amount));
      expect(await erc20.balanceOf(erc20Escrow.address)).to.eq.BN(prevBalERC20Escrow.sub(amount));
    });
    it('Withdraw to depositant 0 amount', async () => {
      const escrowId = await createBasicEscrow();
      await deposit(escrowId);
      const amount = bn(0);

      await saveBalances(escrowId);

      const Withdraw = await toEvents(
        erc20Escrow.withdrawToDepositant(
          escrowId,
          amount,
          [],
          { from: beneficiary },
        ),
        'Withdraw',
      );

      assert.equal(Withdraw._escrowId, escrowId);
      assert.equal(Withdraw._sender, beneficiary);
      assert.equal(Withdraw._to, depositant);
      const escrow = await erc20Escrow.escrows(escrowId);
      const toAgent = amount.mul(escrow.agentFee).div(BASE);
      const toAmount = amount.sub(toAgent);
      expect(Withdraw._toAmount).to.eq.BN(toAmount);
      expect(Withdraw._toAgent).to.eq.BN(toAgent);

      assert.equal(escrow.agent, agent);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.beneficiary, beneficiary);
      expect(escrow.agentFee).to.eq.BN(500);
      assert.equal(escrow.token, erc20.address);

      expect(await erc20.balanceOf(owner)).to.eq.BN(prevBalOwner);
      expect(await erc20.balanceOf(creator)).to.eq.BN(prevBalCreator);
      expect(await erc20.balanceOf(agent)).to.eq.BN(prevBalAgent.add(toAgent));
      expect(await erc20.balanceOf(erc20Agent.address)).to.eq.BN(prevBalContractAgent);
      expect(await erc20.balanceOf(depositant)).to.eq.BN(prevBalDepositant.add(toAmount));
      expect(await erc20.balanceOf(beneficiary)).to.eq.BN(prevBalBeneficiary);

      expect(escrow.balance).to.eq.BN(prevBalEscrow.sub(amount));
      expect(await erc20.balanceOf(erc20Escrow.address)).to.eq.BN(prevBalERC20Escrow.sub(amount));
    });
    it('Withdraw to depositant an escrow with a contract agent as agent from beneficiary', async () => {
      const escrowId = await createBasicEscrow(erc20Agent.address);
      await deposit(escrowId);
      const amount = WEI.div(bn(2));

      await saveBalances(escrowId);

      const Withdraw = await toEvents(
        erc20Escrow.withdrawToDepositant(
          escrowId,
          amount,
          [],
          { from: beneficiary },
        ),
        'Withdraw',
      );

      assert.equal(Withdraw._escrowId, escrowId);
      assert.equal(Withdraw._sender, beneficiary);
      assert.equal(Withdraw._to, depositant);
      const escrow = await erc20Escrow.escrows(escrowId);
      const toAgent = amount.mul(escrow.agentFee).div(BASE);
      const toAmount = amount.sub(toAgent);
      expect(Withdraw._toAmount).to.eq.BN(toAmount);
      expect(Withdraw._toAgent).to.eq.BN(toAgent);

      assert.equal(escrow.agent, erc20Agent.address);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.beneficiary, beneficiary);
      expect(escrow.agentFee).to.eq.BN(500);
      assert.equal(escrow.token, erc20.address);

      expect(await erc20.balanceOf(owner)).to.eq.BN(prevBalOwner);
      expect(await erc20.balanceOf(creator)).to.eq.BN(prevBalCreator);
      expect(await erc20.balanceOf(agent)).to.eq.BN(prevBalAgent);
      expect(await erc20.balanceOf(erc20Agent.address)).to.eq.BN(prevBalContractAgent.add(toAgent));
      expect(await erc20.balanceOf(depositant)).to.eq.BN(prevBalDepositant.add(toAmount));
      expect(await erc20.balanceOf(beneficiary)).to.eq.BN(prevBalBeneficiary);

      expect(escrow.balance).to.eq.BN(prevBalEscrow.sub(amount));
      expect(await erc20.balanceOf(erc20Escrow.address)).to.eq.BN(prevBalERC20Escrow.sub(amount));
    });
    it('Withdraw to depositant an escrow with a contract agent as agent from agent', async () => {
      const escrowId = await createBasicEscrow(erc20Agent.address);
      await deposit(escrowId);
      const amount = WEI.div(bn(2));

      await saveBalances(escrowId);

      const Withdraw = await toEvents(
        erc20Escrow.withdrawToDepositant(
          escrowId,
          amount,
          '0x01',
          { from: owner },
        ),
        'Withdraw',
      );

      assert.equal(Withdraw._escrowId, escrowId);
      assert.equal(Withdraw._sender, owner);
      assert.equal(Withdraw._to, depositant);
      const escrow = await erc20Escrow.escrows(escrowId);
      const toAgent = amount.mul(escrow.agentFee).div(BASE);
      const toAmount = amount.sub(toAgent);
      expect(Withdraw._toAmount).to.eq.BN(toAmount);
      expect(Withdraw._toAgent).to.eq.BN(toAgent);

      assert.equal(escrow.agent, erc20Agent.address);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.beneficiary, beneficiary);
      expect(escrow.agentFee).to.eq.BN(500);
      assert.equal(escrow.token, erc20.address);

      expect(await erc20.balanceOf(owner)).to.eq.BN(prevBalOwner);
      expect(await erc20.balanceOf(creator)).to.eq.BN(prevBalCreator);
      expect(await erc20.balanceOf(agent)).to.eq.BN(prevBalAgent);
      expect(await erc20.balanceOf(erc20Agent.address)).to.eq.BN(prevBalContractAgent.add(toAgent));
      expect(await erc20.balanceOf(depositant)).to.eq.BN(prevBalDepositant.add(toAmount));
      expect(await erc20.balanceOf(beneficiary)).to.eq.BN(prevBalBeneficiary);

      expect(escrow.balance).to.eq.BN(prevBalEscrow.sub(amount));
      expect(await erc20.balanceOf(erc20Escrow.address)).to.eq.BN(prevBalERC20Escrow.sub(amount));
    });
    it('Try withdraw to beneficiary an escrow and the contract agent rejects', async () => {
      const escrowId = await createBasicEscrow(erc20Agent.address);

      await tryCatchRevert(
        () => erc20Escrow.withdrawToDepositant(
          escrowId,
          0,
          [],
          { from: depositant },
        ),
        '_withdraw: The agent rejects the withdraw',
      );
    });
    it('Try withdraw to depositant without be the beneficiary or the agent', async () => {
      const escrowId = await createBasicEscrow();

      await tryCatchRevert(
        () => erc20Escrow.withdrawToDepositant(
          escrowId,
          0,
          [],
          { from: depositant },
        ),
        '_withdraw: The sender should be the _approved or the agent',
      );

      await tryCatchRevert(
        () => erc20Escrow.withdrawToDepositant(
          escrowId,
          0,
          [],
          { from: creator },
        ),
        '_withdraw: The sender should be the _approved or the agent',
      );
    });
  });
  describe('Function cancel', function () {
    it('Cancel an escrow', async () => {
      const escrowId = await createBasicEscrow();
      await deposit(escrowId);

      await saveBalances(escrowId);

      const Cancel = await toEvents(
        erc20Escrow.cancel(
          escrowId,
          [],
          { from: agent },
        ),
        'Cancel',
      );

      assert.equal(Cancel._escrowId, escrowId);
      expect(Cancel._amount).to.eq.BN(prevBalEscrow);

      const escrow = await erc20Escrow.escrows(escrowId);
      assert.equal(escrow.agent, address0x);
      assert.equal(escrow.depositant, address0x);
      assert.equal(escrow.beneficiary, address0x);
      expect(escrow.agentFee).to.eq.BN(0);
      assert.equal(escrow.token, address0x);

      expect(await erc20.balanceOf(owner)).to.eq.BN(prevBalOwner);
      expect(await erc20.balanceOf(creator)).to.eq.BN(prevBalCreator);
      expect(await erc20.balanceOf(agent)).to.eq.BN(prevBalAgent);
      expect(await erc20.balanceOf(erc20Agent.address)).to.eq.BN(prevBalContractAgent);
      expect(await erc20.balanceOf(depositant)).to.eq.BN(prevBalDepositant.add(prevBalEscrow));
      expect(await erc20.balanceOf(beneficiary)).to.eq.BN(prevBalBeneficiary);

      expect(escrow.balance).to.eq.BN(0);
      expect(await erc20.balanceOf(erc20Escrow.address)).to.eq.BN(prevBalERC20Escrow.sub(prevBalEscrow));
    });
    it('Cancel an escrow with a contract agent as agent', async () => {
      const escrowId = await createBasicEscrow(erc20Agent.address);
      await deposit(escrowId);

      await saveBalances(escrowId);

      const Cancel = await toEvents(
        erc20Escrow.cancel(
          escrowId,
          '0x01',
          { from: owner },
        ),
        'Cancel',
      );

      assert.equal(Cancel._escrowId, escrowId);
      expect(Cancel._amount).to.eq.BN(prevBalEscrow);

      const escrow = await erc20Escrow.escrows(escrowId);
      assert.equal(escrow.agent, address0x);
      assert.equal(escrow.depositant, address0x);
      assert.equal(escrow.beneficiary, address0x);
      expect(escrow.agentFee).to.eq.BN(0);
      assert.equal(escrow.token, address0x);

      expect(await erc20.balanceOf(owner)).to.eq.BN(prevBalOwner);
      expect(await erc20.balanceOf(creator)).to.eq.BN(prevBalCreator);
      expect(await erc20.balanceOf(agent)).to.eq.BN(prevBalAgent);
      expect(await erc20.balanceOf(erc20Agent.address)).to.eq.BN(prevBalContractAgent);
      expect(await erc20.balanceOf(depositant)).to.eq.BN(prevBalDepositant.add(prevBalEscrow));
      expect(await erc20.balanceOf(beneficiary)).to.eq.BN(prevBalBeneficiary);

      expect(escrow.balance).to.eq.BN(0);
      expect(await erc20.balanceOf(erc20Escrow.address)).to.eq.BN(prevBalERC20Escrow.sub(prevBalEscrow));
    });
    it('Try cancel an escrow and the contract agent rejects', async () => {
      const escrowId = await createBasicEscrow(erc20Agent.address);

      await tryCatchRevert(
        () => erc20Escrow.cancel(
          escrowId,
          [],
          { from: depositant },
        ),
        'cancel: The agent rejects the cancel',
      );
    });
    it('Try cancel without be the agent', async () => {
      const escrowId = await createBasicEscrow();

      await tryCatchRevert(
        () => erc20Escrow.cancel(
          escrowId,
          [],
          { from: depositant },
        ),
        'cancel: The sender should be the agent',
      );
    });
  });
});
