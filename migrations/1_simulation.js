// Import necessary libraries
const ethers = require('ethers');

//Proposal states are defined by OpenZeppelin/Compound
oz_states = ['Pending', 'Active', 'Canceled', 'Defeated',
             'Succeeded', 'Queued', 'Expired', 'Executed'];

// Ganache localhost URL
const url = "http://localhost:8545";
const provider = new ethers.providers.JsonRpcProvider(url);

// Helper function to fast forward blocks
const ff_blocks = async (n) => {
    for (let i = 0; i < n; i++) {
        await provider.send('evm_mine');
    }
    console.log("\nMoved", n, "blocks\n");
}

// Helper function to get current block
const getBlock = async () => {
    const blockNum = await provider.getBlockNumber();
    console.log("Block:", blockNum);
    return blockNum;
}

// Helper function to get proposal state
const getProposalState = async (gov, proposalId) => {
    let propState = await gov.state(proposalId);
    console.log("Proposal State:", oz_states[propState.toNumber()]);
}

// Getting three wallets from Ganache provider
const owner = provider.getSigner(0);
const voter1 = provider.getSigner(1);
const voter2 = provider.getSigner(2);

// Get instances of all three contracts
const tokenContract = artifacts.require("GovToken");
const govContract = artifacts.require("DaoGovernor");
const daoContract = artifacts.require("Dao");

module.exports = async function (deployer) {
    // Deploy the governance token contract
    await deployer.deploy(tokenContract);
    const token = await tokenContract.deployed();
    console.log("Token Contract deployed to: ",token.address);

    //Get addresses of all three accounts
    const ow = await owner.getAddress();
    const v1 = await voter1.getAddress();
    const v2 = await voter2.getAddress();

    //Mint 100 tokens to owner, voter1 and voter2
    await token.mint(ow, 100);
    await token.mint(v1, 100);
    await token.mint(v2, 100);
    console.log("minted 100 tokens to owner, voter1 and voter2", "\n");

    // Delegate voting power to themselves
    await token.delegate(ow, { from: ow});
    await token.delegate(v1, { from: v1});
    await token.delegate(v2, { from: v2});

    // Deploy the governor contract
    await deployer.deploy(govContract, token.address);
    const gov = await govContract.deployed();
    console.log("Governor contract deployed to: ", gov.address, "\n");
    
    // Deploy the dao contract
    await deployer.deploy(daoContract, gov.address);
    const dao = await daoContract.deployed();
    console.log("DAO contract deployed to:", dao.address, "\n");

    // Owner creates a proposal to change value to 42
    let proposalFunc = dao.contract.methods.updateValue(42).encodeABI();
    let proposalDesc = "Updating DAO value to 42";
    console.log("Proposing:", proposalDesc);
    let proposalTrxn = await gov.propose(
        [dao.address],
        [0],
        [proposalFunc],
        proposalDesc,
    );

    // Move past voting delay
    await ff_blocks(1);

    // Get proposal ID and make proposal active
    let proposalId = proposalTrxn.logs[0].args.proposalId;
    console.log("Proposal ID: ", proposalId.toString());
    await getProposalState(gov, proposalId);

    // Voter 1 and voter 2 vote in favor
    let vote = await gov.castVote(proposalId, 1, { from: v1});
    console.log("V1 has voted in favor.")
    vote = await gov.castVote(proposalId, 1, {from: v2});
    console.log("V2 has voted in favor");

    // Move 5 blocks
    await ff_blocks(5);

    //Get final result
    console.log("Final Result");
    await getProposalState(gov, proposalId);

    // Execute task
    let desHash = ethers.utils.id(proposalDesc);
    execute = await gov.execute(
        [dao.address],
        [0],
        [proposalFunc],
        desHash
    );
    console.log("\nExecuting proposal on DAO")

    // Check if value on dao has changed
    const daoVal = await dao.daoVal.call();
    console.log("daoVal:", daoVal.toNumber());
};