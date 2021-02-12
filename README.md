[![Lint Sol Status](https://github.com/rotcivegaf/BSC-Escrow/workflows/Lint%20Sol/badge.svg)](https://github.com/rotcivegaf/BSC-Escrow/actions?query=workflow%3A%22Lint+Sol%22)
[![Lint JS Status](https://github.com/rotcivegaf/BSC-Escrow/workflows/Lint%20JS/badge.svg)](https://github.com/rotcivegaf/BSC-Escrow/actions?query=workflow%3A%22Lint+JS%22)
[![Test Status](https://github.com/rotcivegaf/BSC-Escrow/workflows/Test%20Contracts/badge.svg)](https://github.com/rotcivegaf/BSC-Escrow/actions?query=workflow%3A%22Test+Contracts%22)
[![Coverage Status](https://github.com/rotcivegaf/BSC-Escrow/workflows/Coverage/badge.svg)](https://github.com/rotcivegaf/BSC-Escrow/actions?query=workflow%3ACoverage)

[![Coverage](https://codecov.io/gh/rotcivegaf/BSC-Escrow/graph/badge.svg)](https://codecov.io/gh/rotcivegaf/BSC-Escrow)

# BSC-Escrow

In the real world, when you want to sell a thing like a house, a car, etc.

You need a notary to manage an escrow and you have to pay a lot of taxes and fees

With these contracts, I search to fix this issue, remove the taxes and change the notary for a wallet or a contract

## Full Example

We have:
  - An ERC721 token, in this case, represents a `House`
  - An amount of ERC20 token, in this case, the value of the `House` is `100.000 USDC`
  - 2 participants, the `Buyer` and the `seller`
  - The `Agent contract`
  - The `ERC721Escrow` and `ERC20Escrow` contracts

After of check conditions of buying the `House`, the participants need to deposit the `House` and the `100.000 USDC`

In the first transaction, someone create the two escrows(ERC20Escrow and ERC721Escrow) can be the `Buyer` or the `Seller` or some wallet

<img align="center" src="https://github.com/rotcivegaf/BSC-Escrow/blob/master/img/0%20create.svg" width="400" />

In the second transaction, the `Buyer` deposit the `100.000 USDC` in the `ERC20Escrow` contract

<img align="center" src="https://github.com/rotcivegaf/BSC-Escrow/blob/master/img/1%20deposit.svg" width="400" />

In the third transaction the `Seller` deposit the `House` in the `ERC721Escrow` contract, the `Agent contract` check if the deposit of `100.000 USDC` it's done, if true, it withdraw the `House` to the `Buyer` and the `100.000 USDC` to the `Seller`

`Seller` deposit the `House` in the `ERC721Escrow` contract:

<img align="center" src="https://github.com/rotcivegaf/BSC-Escrow/blob/master/img/2%20deposit.svg" width="400" />

`Agent contract` check if the deposit of `100.000 USDC`:

<img align="center" src="https://github.com/rotcivegaf/BSC-Escrow/blob/master/img/2%20check%20deposit.svg" width="400" />

It withdraw the `House` to the `Buyer` and the `100.000 USDC` to the `Seller`:

<img align="center" src="https://github.com/rotcivegaf/BSC-Escrow/blob/master/img/2%20withdraw.svg" width="400" />

This is a happy example, but can be others, if the agent its not a contracts is a wallet and the depositant dont withdraw the ERC20/721 to the Beneficiary, this agent should be mediate betweeen both

## Documentation

  - [ERC20Escrow](https://github.com/rotcivegaf/BSC-Escrow/blob/master/ERC20Escrow_DOCUMENTATION.md)
  - [ERC721Escrow](TODO)
