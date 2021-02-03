const TestToken = artifacts.require('TestToken');
const TestERC721Token = artifacts.require('TestERC721Token');

const ERC721Escrow = artifacts.require('ERC721Escrow');

const {
  expect,
  toEvents,
  tryCatchRevert,
  address0x,
  random32,
  random32bn,
  bn,
} = require('./Helper.js');

contract('ERC721Escrow', (accounts) => {
  const owner = accounts[1];
  const creator = accounts[2];
  const agent = accounts[5];
  const depositant = accounts[3];
  const beneficiary = accounts[4];

  let erc721Escrow;
  let erc721;
  let erc20;

  let salt = 0;
  let basicEscrow;

  async function setApproveBalance (beneficiary, amount) {
    await erc20.setBalance(beneficiary, amount, { from: owner });
    await erc20.approve(erc721Escrow.address, amount, { from: beneficiary });
  }

  async function createApprove (beneficiary, tokenId, amount) {
    await setApproveBalance(beneficiary, amount);
    await erc721.mint(beneficiary, tokenId, { from: owner });
    await erc721.approve(erc721Escrow.address, tokenId, { from: beneficiary });
  }

  async function calcId (agent, depositant, beneficiary, token721, tokenId, token20, toAgent, salt) {
    const id = await erc721Escrow.calculateId(
      agent,
      depositant,
      beneficiary,
      token721,
      tokenId,
      token20,
      toAgent,
      salt,
    );

    const localId = web3.utils.soliditySha3(
      { t: 'address', v: erc721Escrow.address },
      { t: 'address', v: agent },
      { t: 'address', v: depositant },
      { t: 'address', v: beneficiary },
      { t: 'address', v: token721 },
      { t: 'uint256', v: tokenId },
      { t: 'address', v: token20 },
      { t: 'uint256', v: toAgent },
      { t: 'uint256', v: salt },
    );

    assert.equal(id, localId);

    return id;
  }

  async function createBasicEscrow () {
    basicEscrow.salt = ++salt;
    basicEscrow.tokenId = basicEscrow.salt;

    await erc721Escrow.createEscrow(
      basicEscrow.depositant,
      basicEscrow.beneficiary,
      basicEscrow.token721,
      basicEscrow.tokenId,
      basicEscrow.token20,
      basicEscrow.toAgent,
      basicEscrow.salt,
      { from: basicEscrow.agent },
    );

    return calcId(basicEscrow.agent, basicEscrow.depositant, basicEscrow.beneficiary, basicEscrow.token721, basicEscrow.tokenId, basicEscrow.token20, basicEscrow.toAgent, basicEscrow.salt);
  }

  async function deposit (escrowId) {
    const escrow = await erc721Escrow.escrows(escrowId);

    await setApproveBalance(escrow.depositant, escrow.toAgent);
    await createApprove(escrow.depositant, escrow.tokenId, escrow.toAgent);

    await erc721Escrow.deposit(escrowId, { from: escrow.depositant });
  }

  before('Deploy contracts', async function () {
    erc721Escrow = await ERC721Escrow.new({ from: owner });

    erc20 = await TestToken.new({ from: owner });
    erc721 = await TestERC721Token.new({ from: owner });

    basicEscrow = {
      agent: agent,
      depositant: depositant,
      beneficiary: beneficiary,
      token721: erc721.address,
      tokenId: random32bn(),
      token20: erc20.address,
      toAgent: bn(1),
      salt: salt,
    };
  });

  describe('Try execute functions with non-exists escrow', function () {
    it('Try deposit in non-exists escrow', async () => {
      await tryCatchRevert(
        () => erc721Escrow.deposit(
          random32(),
          { from: agent },
        ),
        'deposit: The sender should be the depositant',
      );
    });
    it('Try withdraw to beneficiary of non-exists escrow', async () => {
      await tryCatchRevert(
        () => erc721Escrow.withdrawToBeneficiary(
          random32(),
          { from: agent },
        ),
        '_withdraw: The sender should be the _approved or the agent',
      );
    });
    it('Try withdraw to depositant of non-exists escrow', async () => {
      await tryCatchRevert(
        () => erc721Escrow.withdrawToDepositant(
          random32(),
          { from: agent },
        ),
        '_withdraw: The sender should be the _approved or the agent',
      );
    });
    it('Try cancel an non-exists escrow', async () => {
      await tryCatchRevert(
        () => erc721Escrow.cancel(
          random32(),
          { from: agent },
        ),
        'cancel: The sender should be the agent',
      );
    });
  });
  describe('Function createEscrow', function () {
    it('create basic escrow', async () => {
      const salt = random32bn();
      const tokenId = random32bn();
      const toAgent = bn(1);
      const id = await calcId(agent, depositant, beneficiary, erc721.address, tokenId, erc20.address, toAgent, salt);

      const CreateEscrow = await toEvents(
        erc721Escrow.createEscrow(
          depositant,
          beneficiary,
          erc721.address,
          tokenId,
          erc20.address,
          toAgent,
          salt,
          { from: agent },
        ),
        'CreateEscrow',
      );

      assert.equal(CreateEscrow._escrowId, id);
      assert.equal(CreateEscrow._agent, agent);
      assert.equal(CreateEscrow._depositant, depositant);
      assert.equal(CreateEscrow._beneficiary, beneficiary);
      assert.equal(CreateEscrow._token721, erc721.address);
      expect(CreateEscrow._tokenId).to.eq.BN(tokenId);
      assert.equal(CreateEscrow._token20, erc20.address);
      expect(CreateEscrow._toAgent).to.eq.BN(toAgent);
      expect(CreateEscrow._salt).to.eq.BN(salt);

      const escrow = await erc721Escrow.escrows(id);
      assert.equal(escrow.agent, agent);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.beneficiary, beneficiary);
      assert.equal(escrow.token721, erc721.address);
      expect(escrow.tokenId).to.eq.BN(tokenId);
      assert.equal(escrow.token20, erc20.address);
      expect(escrow.toAgent).to.eq.BN(toAgent);
    });
    it('Try create two escrows with the same id', async function () {
      const escrowId = await createBasicEscrow();

      await tryCatchRevert(
        () => erc721Escrow.createEscrow(
          basicEscrow.depositant,
          basicEscrow.beneficiary,
          basicEscrow.token721,
          basicEscrow.tokenId,
          basicEscrow.token20,
          basicEscrow.toAgent,
          basicEscrow.salt,
          { from: basicEscrow.agent },
        ),
        'createEscrow: The escrow exists',
      );

      // With signature
      const agentSignature = await web3.eth.sign(escrowId, basicEscrow.agent);
      await tryCatchRevert(
        () => erc721Escrow.signCreateEscrow(
          basicEscrow.agent,
          basicEscrow.depositant,
          basicEscrow.beneficiary,
          basicEscrow.token721,
          basicEscrow.tokenId,
          basicEscrow.token20,
          basicEscrow.toAgent,
          basicEscrow.salt,
          agentSignature,
          { from: creator },
        ),
        'createEscrow: The escrow exists',
      );
    });
  });
  describe('Function signCreateEscrow', function () {
    it('create a signed basic escrow', async () => {
      const salt = random32bn();
      const tokenId = random32bn();
      const toAgent = bn(1);
      const id = await calcId(agent, depositant, beneficiary, erc721.address, tokenId, erc20.address, toAgent, salt);

      const agentSignature = await web3.eth.sign(id, agent);

      const SignCreateEscrow = await toEvents(
        erc721Escrow.signCreateEscrow(
          agent,
          depositant,
          beneficiary,
          erc721.address,
          tokenId,
          erc20.address,
          toAgent,
          salt,
          agentSignature,
          { from: creator },
        ),
        'SignCreateEscrow',
      );

      assert.equal(SignCreateEscrow._escrowId, id);
      assert.equal(SignCreateEscrow._agentSignature, agentSignature);
    });
    it('Try create two escrows with the same id', async function () {
      const salt = random32bn();
      const tokenId = random32bn();
      const toAgent = bn(1);
      const id = await calcId(agent, depositant, beneficiary, erc721.address, tokenId, erc20.address, toAgent, salt);

      const agentSignature = await web3.eth.sign(id, agent);

      await erc721Escrow.signCreateEscrow(
        agent,
        depositant,
        beneficiary,
        erc721.address,
        tokenId,
        erc20.address,
        toAgent,
        salt,
        agentSignature,
        { from: creator },
      );

      await tryCatchRevert(
        () => erc721Escrow.createEscrow(
          depositant,
          beneficiary,
          erc721.address,
          tokenId,
          erc20.address,
          toAgent,
          salt,
          { from: agent },
        ),
        'createEscrow: The escrow exists',
      );

      await tryCatchRevert(
        () => erc721Escrow.signCreateEscrow(
          agent,
          depositant,
          beneficiary,
          erc721.address,
          tokenId,
          erc20.address,
          toAgent,
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
        () => erc721Escrow.signCreateEscrow(
          agent,
          depositant,
          beneficiary,
          erc721.address,
          random32bn(),
          erc20.address,
          0,
          salt,
          wrongSignature,
          { from: creator },
        ),
        'signCreateEscrow: Invalid agent signature',
      );

      // With wrong agent in calcId
      const tokenId = random32();
      const toAgent = bn(1);
      const id = await calcId(creator, depositant, beneficiary, erc721.address, tokenId, erc20.address, toAgent, salt);
      const wrongSignature2 = await web3.eth.sign(id, agent);

      await tryCatchRevert(
        () => erc721Escrow.signCreateEscrow(
          agent,
          depositant,
          beneficiary,
          erc721.address,
          tokenId,
          erc20.address,
          toAgent,
          salt,
          wrongSignature2,
          { from: creator },
        ),
        'signCreateEscrow: Invalid agent signature',
      );

      // With wrong signer
      const wrongSignature3 = await web3.eth.sign(id, creator);

      await tryCatchRevert(
        () => erc721Escrow.signCreateEscrow(
          agent,
          depositant,
          beneficiary,
          erc721.address,
          tokenId,
          erc20.address,
          toAgent,
          salt,
          wrongSignature3,
          { from: creator },
        ),
        'signCreateEscrow: Invalid agent signature',
      );
    });
    it('try create a signed basic escrow with canceled signature', async () => {
      const tokenId = random32();
      const toAgent = bn(1);
      const id = await calcId(agent, depositant, beneficiary, erc721.address, tokenId, erc20.address, toAgent, salt);
      const canceledSignature = await web3.eth.sign(id, agent);

      await erc721Escrow.cancelSignature(canceledSignature, { from: agent });

      await tryCatchRevert(
        () => erc721Escrow.signCreateEscrow(
          agent,
          depositant,
          beneficiary,
          erc721.address,
          tokenId,
          erc20.address,
          toAgent,
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
      const id = await calcId(agent, depositant, beneficiary, erc721.address, random32bn(), erc20.address, bn(0), random32bn());

      const agentSignature = await web3.eth.sign(id, agent);

      assert.isFalse(await erc721Escrow.canceledSignatures(agent, agentSignature));

      const CancelSignature = await toEvents(
        erc721Escrow.cancelSignature(
          agentSignature,
          { from: agent },
        ),
        'CancelSignature',
      );

      assert.equal(CancelSignature._agentSignature, agentSignature);
      assert.isTrue(await erc721Escrow.canceledSignatures(agent, agentSignature));
    });
  });
  describe('Function deposit', function () {
    it('Deposit erc721 in an escrow', async () => {
      const escrowId = await createBasicEscrow();

      await createApprove(depositant, basicEscrow.tokenId, basicEscrow.toAgent);

      const prevBalDepositant = await erc20.balanceOf(depositant);
      const prevBalEscrow = await erc20.balanceOf(erc721Escrow.address);

      const Deposit = await toEvents(
        erc721Escrow.deposit(
          escrowId,
          { from: depositant },
        ),
        'Deposit',
      );

      assert.equal(Deposit._escrowId, escrowId);

      const escrow = await erc721Escrow.escrows(escrowId);
      assert.equal(escrow.agent, agent);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.beneficiary, beneficiary);
      assert.equal(escrow.token721, erc721.address);
      expect(escrow.tokenId).to.eq.BN(basicEscrow.tokenId);
      assert.equal(escrow.token20, erc20.address);
      expect(escrow.toAgent).to.eq.BN(basicEscrow.toAgent);

      expect(await erc20.balanceOf(depositant)).to.eq.BN(prevBalDepositant.sub(basicEscrow.toAgent));
      expect(await erc20.balanceOf(erc721Escrow.address)).to.eq.BN(prevBalEscrow.add(basicEscrow.toAgent));

      assert.equal(await erc721.ownerOf(basicEscrow.tokenId), erc721Escrow.address);
    });
    it('Try deposit in an escrow without be the depositant', async () => {
      const escrowId = await createBasicEscrow();

      await tryCatchRevert(
        () => erc721Escrow.deposit(
          escrowId,
          { from: creator },
        ),
        'deposit: The sender should be the depositant',
      );
    });
  });
  describe('Function withdrawToBeneficiary', function () {
    it('Withdraw to beneficiary an escrow from depositant', async () => {
      const escrowId = await createBasicEscrow();
      await deposit(escrowId);

      const prevBalEscrow = await erc20.balanceOf(erc721Escrow.address);
      const prevBalAgent = await erc20.balanceOf(agent);

      const Withdraw = await toEvents(
        erc721Escrow.withdrawToBeneficiary(
          escrowId,
          { from: depositant },
        ),
        'Withdraw',
      );

      assert.equal(Withdraw._escrowId, escrowId);
      assert.equal(Withdraw._sender, depositant);
      assert.equal(Withdraw._to, beneficiary);

      const escrow = await erc721Escrow.escrows(escrowId);
      assert.equal(escrow.agent, agent);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.beneficiary, beneficiary);
      assert.equal(escrow.token721, erc721.address);
      expect(escrow.tokenId).to.eq.BN(basicEscrow.tokenId);
      assert.equal(escrow.token20, erc20.address);
      expect(escrow.toAgent).to.eq.BN(basicEscrow.toAgent);

      expect(await erc20.balanceOf(erc721Escrow.address)).to.eq.BN(prevBalEscrow.sub(basicEscrow.toAgent));
      expect(await erc20.balanceOf(agent)).to.eq.BN(prevBalAgent.add(basicEscrow.toAgent));

      assert.equal(await erc721.ownerOf(basicEscrow.tokenId), escrow.beneficiary);
    });
    it('Withdraw to beneficiary an escrow from agent', async () => {
      const escrowId = await createBasicEscrow();
      await deposit(escrowId);

      const prevBalEscrow = await erc20.balanceOf(erc721Escrow.address);
      const prevBalAgent = await erc20.balanceOf(agent);

      const Withdraw = await toEvents(
        erc721Escrow.withdrawToBeneficiary(
          escrowId,
          { from: agent },
        ),
        'Withdraw',
      );

      assert.equal(Withdraw._escrowId, escrowId);
      assert.equal(Withdraw._sender, agent);
      assert.equal(Withdraw._to, beneficiary);

      const escrow = await erc721Escrow.escrows(escrowId);
      assert.equal(escrow.agent, agent);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.beneficiary, beneficiary);
      assert.equal(escrow.token721, erc721.address);
      expect(escrow.tokenId).to.eq.BN(basicEscrow.tokenId);
      assert.equal(escrow.token20, erc20.address);
      expect(escrow.toAgent).to.eq.BN(basicEscrow.toAgent);

      expect(await erc20.balanceOf(erc721Escrow.address)).to.eq.BN(prevBalEscrow.sub(basicEscrow.toAgent));
      expect(await erc20.balanceOf(agent)).to.eq.BN(prevBalAgent.add(basicEscrow.toAgent));

      assert.equal(await erc721.ownerOf(basicEscrow.tokenId), escrow.beneficiary);
    });
    it('Try withdraw to beneficiary without be the depositant or the agent', async () => {
      const escrowId = await createBasicEscrow();

      await tryCatchRevert(
        () => erc721Escrow.withdrawToBeneficiary(
          escrowId,
          { from: beneficiary },
        ),
        '_withdraw: The sender should be the _approved or the agent',
      );

      await tryCatchRevert(
        () => erc721Escrow.withdrawToBeneficiary(
          escrowId,
          { from: creator },
        ),
        '_withdraw: The sender should be the _approved or the agent',
      );
    });
  });
  describe('Function withdrawToDepositant', function () {
    it('Withdraw to depositant an escrow from beneficiary', async () => {
      const escrowId = await createBasicEscrow();
      await deposit(escrowId);

      const prevBalEscrow = await erc20.balanceOf(erc721Escrow.address);
      const prevBalAgent = await erc20.balanceOf(agent);

      const Withdraw = await toEvents(
        erc721Escrow.withdrawToDepositant(
          escrowId,
          { from: beneficiary },
        ),
        'Withdraw',
      );

      assert.equal(Withdraw._escrowId, escrowId);
      assert.equal(Withdraw._sender, beneficiary);
      assert.equal(Withdraw._to, depositant);

      const escrow = await erc721Escrow.escrows(escrowId);
      assert.equal(escrow.agent, agent);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.beneficiary, beneficiary);
      assert.equal(escrow.token721, erc721.address);
      expect(escrow.tokenId).to.eq.BN(basicEscrow.tokenId);
      assert.equal(escrow.token20, erc20.address);
      expect(escrow.toAgent).to.eq.BN(basicEscrow.toAgent);

      expect(await erc20.balanceOf(erc721Escrow.address)).to.eq.BN(prevBalEscrow.sub(basicEscrow.toAgent));
      expect(await erc20.balanceOf(agent)).to.eq.BN(prevBalAgent.add(basicEscrow.toAgent));

      assert.equal(await erc721.ownerOf(basicEscrow.tokenId), escrow.depositant);
    });
    it('Withdraw to depositant an escrow from agent', async () => {
      const escrowId = await createBasicEscrow();
      await deposit(escrowId);

      const prevBalEscrow = await erc20.balanceOf(erc721Escrow.address);
      const prevBalAgent = await erc20.balanceOf(agent);

      const Withdraw = await toEvents(
        erc721Escrow.withdrawToDepositant(
          escrowId,
          { from: agent },
        ),
        'Withdraw',
      );

      assert.equal(Withdraw._escrowId, escrowId);
      assert.equal(Withdraw._sender, agent);
      assert.equal(Withdraw._to, depositant);

      const escrow = await erc721Escrow.escrows(escrowId);
      assert.equal(escrow.agent, agent);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.beneficiary, beneficiary);
      assert.equal(escrow.token721, erc721.address);
      expect(escrow.tokenId).to.eq.BN(basicEscrow.tokenId);
      assert.equal(escrow.token20, erc20.address);
      expect(escrow.toAgent).to.eq.BN(basicEscrow.toAgent);

      expect(await erc20.balanceOf(erc721Escrow.address)).to.eq.BN(prevBalEscrow.sub(basicEscrow.toAgent));
      expect(await erc20.balanceOf(agent)).to.eq.BN(prevBalAgent.add(basicEscrow.toAgent));

      assert.equal(await erc721.ownerOf(basicEscrow.tokenId), escrow.depositant);
    });
    it('Try withdraw to depositant without be the beneficiary or the agent', async () => {
      const escrowId = await createBasicEscrow();

      await tryCatchRevert(
        () => erc721Escrow.withdrawToDepositant(
          escrowId,
          { from: depositant },
        ),
        '_withdraw: The sender should be the _approved or the agent',
      );

      await tryCatchRevert(
        () => erc721Escrow.withdrawToDepositant(
          escrowId,
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

      const prevBalDepositant = await erc20.balanceOf(depositant);
      const prevBalEscrow = await erc20.balanceOf(erc721Escrow.address);
      const prevBalAgent = await erc20.balanceOf(agent);

      const Cancel = await toEvents(
        erc721Escrow.cancel(
          escrowId,
          { from: agent },
        ),
        'Cancel',
      );

      assert.equal(Cancel._escrowId, escrowId);

      const escrow = await erc721Escrow.escrows(escrowId);
      assert.equal(escrow.depositant, address0x);
      assert.equal(escrow.beneficiary, address0x);
      assert.equal(escrow.agent, address0x);
      expect(escrow.fee).to.eq.BN(0);
      assert.equal(escrow.token721, address0x);
      expect(escrow.tokenId).to.eq.BN(0);
      assert.equal(escrow.token20, address0x);
      expect(escrow.toAgent).to.eq.BN(0);

      expect(await erc20.balanceOf(agent)).to.eq.BN(prevBalAgent);
      expect(await erc20.balanceOf(erc721Escrow.address)).to.eq.BN(prevBalEscrow.sub(basicEscrow.toAgent));
      expect(await erc20.balanceOf(depositant)).to.eq.BN(prevBalDepositant.add(basicEscrow.toAgent));

      assert.equal(await erc721.ownerOf(basicEscrow.tokenId), depositant);
    });
    it('Try cancel without be the agent', async () => {
      const escrowId = await createBasicEscrow();

      await tryCatchRevert(
        () => erc721Escrow.cancel(
          escrowId,
          { from: depositant },
        ),
        'cancel: The sender should be the agent',
      );
    });
  });
});
