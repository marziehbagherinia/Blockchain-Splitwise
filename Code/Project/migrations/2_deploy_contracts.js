var BlockchainSplitwise = artifacts.require("./BlockchainSplitwise.sol");

module.exports = function(deployer) {
  deployer.deploy(BlockchainSplitwise);
};
