// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract helpers-mock-registry {
    address public owner;
    
    constructor() {
        owner = msg.sender;
    }
    
    function dummy() public pure returns (uint256) {
        return 42;
    }
}