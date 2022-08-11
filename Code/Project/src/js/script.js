// =============================================================================
//                                  Config 
// =============================================================================

// sets up web3.js
if (typeof web3 !== 'undefined')  {
	web3 = new Web3(web3.currentProvider);
} else {
	web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
}

// Default account is the first one
web3.eth.defaultAccount = web3.eth.accounts[0];
// Constant we use later
var GENESIS = '0x0000000000000000000000000000000000000000000000000000000000000000';

// This is the ABI for your contract (get it from Remix, in the 'Compile' tab)
// ============================================================
var abi = 
[
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "_creditor",
				"type": "address"
			},
			{
				"internalType": "uint32",
				"name": "_amount",
				"type": "uint32"
			},
			{
				"internalType": "address[]",
				"name": "_path",
				"type": "address[]"
			},
			{
				"internalType": "uint32",
				"name": "_minDebt",
				"type": "uint32"
			}
		],
		"name": "add_IOU",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "_debtor",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "_creditor",
				"type": "address"
			}
		],
		"name": "lookup",
		"outputs": [
			{
				"internalType": "uint32",
				"name": "",
				"type": "uint32"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
]; 
// ============================================================
abiDecoder.addABI(abi);
// call abiDecoder.decodeMethod to use this - see 'getAllFunctionCalls' for more

// Reads in the ABI
var BlockchainSplitwiseContractSpec = web3.eth.contract(abi);

// This is the address of the contract you want to connect to; copy this from Remix
var contractAddress = '0x048B115B438b2AA664289aBC53BECA7a0743f597' // FIXME: fill this in with your contract's address/hash

var BlockchainSplitwise = BlockchainSplitwiseContractSpec.at(contractAddress)


// =============================================================================
//                            Functions To Implement 
// =============================================================================

// TODO: Add any helper functions here!

// TODO: Return a list of all users (creditors or debtors) in the system
// You can return either:
//   - a list of everyone who has ever sent or received an IOU
// OR
//   - a list of everyone currently owing or being owed money
async function getUsers() {
    let allAddIOUCalls = await getAllFunctionCalls(contractAddress, "add_IOU");
    users = [];
    for (const call of allAddIOUCalls) {
        if (users.indexOf(call["from"]) == -1) {
            users.push(call["from"]);
        }
        if (users.indexOf(call["args"][0]) == -1) {
            users.push(call["args"][0]);
        }
    }
    return users;
}

async function getTotalOwed(user) {
    let users = await getUsers();
    let totalOwed = 0;
    for (const creditor of users) {
        if (user.toLowerCase() != creditor) {
            totalOwed += parseInt(await BlockchainSplitwise.methods.lookup(user, creditor).call({from: web3.eth.defaultAccount}));
        }
    }
    return totalOwed;
}

// Return null if you can't find any activity for the user.
// HINT: Try looking at the way 'getAllFunctionCalls' is written. You can modify it if you'd like.
async function getLastActive(user) {
    let allAddIOUCalls = await getAllFunctionCalls(contractAddress, "add_IOU");
    timestamps = [];
    for (const call of allAddIOUCalls) {
        if (user.toLowerCase() == call["from"] || user.toLowerCase() == call["args"][0]) {
            timestamps.push(parseInt(call["t"]));
        }
    }
    if (timestamps.length !== 0) {
        return Math.max(...timestamps);
    }
    return null;
}

// The person you owe money is passed as 'creditor'
// The amount you owe them is passed as 'amount'
async function add_IOU(creditor, amount) {
    const debtor = await web3.eth.defaultAccount;
    const path = await doBFS(creditor, debtor.toLowerCase(), getCreditorsForUser);
    let minDebtInPath;
    if (path.length === 0) {
        // If there is no cycle of debt from creditor to debtor, then there is no cycle to resolve.
        minDebtInPath = 0; 
    } else {
        // If there is a cycle of debt from creditor to debtor, then find the minimum debt in that
        // cycle to resolve the cycle.
        minDebtInPath = await findMinDebt(path);
        if (amount < minDebtInPath) {
            minDebtInPath = amount;
        }
    }

    // let debt = await BlockchainSplitwise.methods.lookup(user, creditor).call({from:web3.eth.defaultAccount});
    await BlockchainSplitwise.methods.add_IOU(creditor, amount, path, minDebtInPath).send({from:debtor.toLowerCase()});
    return;
}

// =============================================================================
//                              Provided Functions 
// =============================================================================
// Reading and understanding these should help you implement the above

// This searches the block history for all calls to 'functionName' (string) on the 'addressOfContract' (string) contract
// It returns an array of objects, one for each call, containing the sender ('from') and arguments ('args')
function getAllFunctionCalls(addressOfContract, functionName) {
	var curBlock = web3.eth.blockNumber;
	var function_calls = [];
	while (curBlock !== GENESIS) {
	  var b = web3.eth.getBlock(curBlock, true);
	  var txns = b.transactions;
	  for (var j = 0; j < txns.length; j++) {
	  	var txn = txns[j];
	  	// check that destination of txn is our contract
	  	if (txn.to === addressOfContract.toLowerCase()) {
	  		var func_call = abiDecoder.decodeMethod(txn.input);
	  		// check that the function getting called in this txn is 'functionName'
	  		if (func_call && func_call.name === functionName) {
	  			var args = func_call.params.map(function (x) {return x.value});
	  			function_calls.push({
	  				from: txn.from,
	  				args: args
	  			})
	  		}
	  	}
	  }
	  curBlock = b.parentHash;
	}
	return function_calls;
}

// We've provided a breadth-first search implementation for you, if that's useful
// It will find a path from start to end (or return null if none exists)
// You just need to pass in a function ('getNeighbors') that takes a node (string) and returns its neighbors (as an array)
function doBFS(start, end, getNeighbors) {
	var queue = [[start]];
	while (queue.length > 0) {
		var cur = queue.shift();
		var lastNode = cur[cur.length-1]
		if (lastNode === end) {
			return cur;
		} else {
			var neighbors = getNeighbors(lastNode);
			for (var i = 0; i < neighbors.length; i++) {
				queue.push(cur.concat([neighbors[i]]));
			}
		}
	}
	return null;
}
// =============================================================================
//                                      UI 
// =============================================================================
// all code here has been refactored in app.js except the switching between accounts 
// which we will instead use Metamask for


// This code updates the 'My Account' UI with the results of your functions
$("#total_owed").html("$"+getTotalOwed(web3.eth.defaultAccount));
$("#last_active").html(timeConverter(getLastActive(web3.eth.defaultAccount)));
$("#myaccount").change(function() {
	web3.eth.defaultAccount = $(this).val();
	$("#total_owed").html("$"+getTotalOwed(web3.eth.defaultAccount));
	$("#last_active").html(timeConverter(getLastActive(web3.eth.defaultAccount)))
});

// Allows switching between accounts in 'My Account' and the 'fast-copy' in 'Address of person you owe
var opts = web3.eth.accounts.map(function (a) { return '<option value="'+a+'">'+a+'</option>' })
$(".account").html(opts);
$(".wallet_addresses").html(web3.eth.accounts.map(function (a) { return '<li>'+a+'</li>' }))

// This code updates the 'Users' list in the UI with the results of your function
$("#all_users").html(getUsers().map(function (u,i) { return "<li>"+u+"</li>" }));

// This runs the 'add_IOU' function when you click the button
// It passes the values from the two inputs above
$("#addiou").click(function() {
  add_IOU($("#creditor").val(), $("#amount").val());
  window.location.reload(true); // refreshes the page after
});

// This is a log function, provided if you want to display things to the page instead of the JavaScript console
// Pass in a discription of what you're printing, and then the object to print
function log(description, obj) {
	$("#log").html($("#log").html() + description + ": " + JSON.stringify(obj, null, 2) + "\n\n");
}


