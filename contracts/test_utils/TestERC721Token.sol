pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";


contract TestERC721Token is ERC721 {
    constructor() ERC721("Test ERC721", "TEST") { }

    function mint(address _beneficiary, uint256 _assetId) external {
        _mint(_beneficiary, _assetId);
    }
}