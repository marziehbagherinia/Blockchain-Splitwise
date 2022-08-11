// TODO: Take a node(string) and return its neighbors as an array
// Make use of the mapping in the smart contract
function getNeighbors(node) {
  BlockchainSplitwise.methods.areDebtors(node).call((err,res) => {
    console.log('accessing smart contract data')
    console.log(res)
  })
  return [];
}

async function getCreditors() {
    let allAddIOUCalls = await getAllFunctionCalls(contractAddress, "add_IOU");
    creditors = new Set();
    for (const call of allAddIOUCalls) {
        creditors.add(call.args[0]);
    }
    return Array.from(creditors);
}

async function getCreditorsForUser(user) {
    let creditors = await getCreditors();
    let userCreditors = [];
    for (const creditor of creditors) {
        let debt = parseInt(await BlockchainSplitwise.methods.lookup(user, creditor).call({from: web3.eth.defaultAccount})); 
        if (debt > 0) {
            userCreditors.push(creditor);
        }
    }
    return userCreditors;
}

async function findMinDebt(path) {
    let minDebt = Number.MAX_SAFE_INTEGER;
    for (var i = 0; i < path.length-1; i++) {
        let debtor = path[i];
        let creditor = path[i+1];
        let debt = parseInt(await BlockchainSplitwise.methods.lookup(debtor, creditor).call({from: web3.eth.defaultAccount})); 
        if (debt < minDebt) {
            minDebt = debt;
        } 
    }
    return minDebt;
}

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

// This searches the block history for all calls to 'functionName' (string) on the 'addressOfContract' (string) contract
// It returns an array of objects, one for each call, containing the sender ('from') and arguments ('args')
// https://github.com/ethereum/wiki/wiki/JavaScript-API#web3ethblocknumber
function getAllFunctionCalls(addressOfContract, functionName) {
  var curBlock = web3.eth.blockNumber;
  var function_calls = [];
  while (curBlock !== GENESIS) {
    // true flag means transactions are returned as objects
    var b = web3.eth.getBlock(curBlock, true); 
    var txns = b.transactions;
    for (var j = 0; j < txns.length; j++) {
      var txn = txns[j];
      // check that destination of txn is our contract
      if (txn.to === addressOfContract) {
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
    var cur = queue.shift(); // return the first item and make queue shorter
    var lastNode = cur[cur.length-1]
    if (lastNode === end) {
      return cur;
    } else {
      var neighbors = getNeighbors(lastNode);
      for (var i = 0; i < neighbors.length; i++) {
        // concat joins two arrays
        // push adds the element to the end of the array
        queue.push(cur.concat([neighbors[i]]));
      }
    }
  }
  return null;
}

// This is a log function, provided if you want to display things to the page instead of the JavaScript console
// Pass in a discription of what you're printing, and then the object to print

App = {
  web3Provider: null,
  contracts: {},

  init: async function() {
    return await App.initWeb3();
  },

  initWeb3: async function() {
    // Modern dapp browsers...
    if (window.ethereum) {
      App.web3Provider = window.ethereum;
      try {
        // Request account access
        await window.ethereum.enable();
      } catch (error) {
        // User denied account access...
        console.error("User denied account access")
      }
    }
    // Legacy dapp browsers...
    else if (window.web3) {
      App.web3Provider = window.web3.currentProvider;
    }
    // If no injected web3 instance is detected, fall back to Ganache
    else {
      App.web3Provider = new Web3.providers.HttpProvider('http://localhost:7545');
    }
    web3 = new Web3(App.web3Provider);
    web3.eth.defaultAccount = web3.eth.accounts[0];

    return App.initContract();
  },

  initContract: function() {
  
    $.getJSON('BlockchainSplitwise.json', function(data) {
      // Get the necessary contract artifact file and instantiate it with truffle-contract
      var BlockchainSplitwiseArtifact = data;
      App.contracts.BlockchainSplitwise = TruffleContract(BlockchainSplitwiseArtifact);

      // Set the provider for our contract
      App.contracts.BlockchainSplitwise.setProvider(App.web3Provider);

      App.listenForEvents();

      return App.render();
    });
    
  },

  
  // Listen for events emitted from the contract
  listenForEvents: function() {
    App.contracts.BlockchainSplitwise.deployed().then(function(instance) {
      // Restart Chrome if you are unable to receive this event
      // This is a known issue with Metamask
      // https://github.com/MetaMask/metamask-extension/issues/2393
      instance.LogAdd_IOU({}, {
        fromBlock: 0,
        toBlock: 'latest'
      }).watch(function(error, event) {
        console.log("debt added", event);
        // Reload when a new debt is recorded
        App.render();
      });
    });
  },

  render: function() {
    var blockchainSplitwiseInstance;
    var total_owed = $("#total_owed");
    var last_active = $("#last_active");
    
    // This code updates the 'My Account' UI with the
    // results of your functions.
    // # is to select element with HTML id
    web3.eth.getCoinbase(function(err, account) {
      if (err === null) {
        App.account = account;
        $("#accountAddress").html("Your Account: " + account);
        $("#total_owed").html("$"+getTotalOwed(account));
        $("#last_active").html(timeConverter(getLastActive(account)));
      }
    });

    // Display addresses
    // . is to select element with HTML class
    web3.eth.getAccounts(function(err, accounts) {
      $(".wallet_addresses").html(accounts.map(function (a) {
        return "<li>" + a + "</li>";
      }));
    });


    // This code updates the 'Users' list in the UI with the results of your function
    $("#all_users").html(getUsers().map(function (u,i) { return "<li>"+u+"</li>"; }));

    // log to JavaScript console
    //App.log("test", "hi");
    App.contracts.BlockchainSplitwise.deployed().then(function(instance){
      calls = getAllFunctionCalls(instance.address, add_IOU);
      App.log(calls, "calls to add_IOU");
    } );
  },

  // This runs the 'add_IOU' function when you click the button
  // It passes the values from the two inputs above 
  // The person you owe money to is passed as 'creditor'
  // The amount you owe them is passed as 'amount'
  addIOU: function() {
    var creditor = $("#creditor").val();
    var amount = $("#amount").val();
    App.contracts.BlockchainSplitwise.deployed().then(function(instance) {
      // TODO: add to the following two lines
      var path_formed = false;
      var path = [];
      return instance.add_IOU(amount, creditor, path_formed, path,
                              { from: App.account });
    }).then(function(result){
      console.log("IOU added");
      // TODO: check this
      window.location.reload(true);
    }).catch(function(err) {
      console.error(err);
    });
  },

  // This is a log function, provided if you want to display things to the page instead of the JavaScript console
  // Pass in a discription of what you're printing, and then the object to print
  log: function(description, obj) {
    $("#log").html($("#log").html() + description + ": " + JSON.stringify(obj, null, 2) + "\n\n");
  },

  // We've provided a breadth-first search implementation for you, if that's useful
  // It will find a path from start to end (or return null if none exists)
  // You just need to pass in a function ('getNeighbors') that takes a node (string) and returns its neighbors (as an array)
  doBFS: function(start, end, getNeighbors) {
    var queue = [[start]];
    while (queue.length > 0) {
      var cur = queue.shift();
      var lastNode = cur[cur.length-1];
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
  },


  // This searches the block history for all calls to 'functionName' (string) on the 'addressOfContract' (string) contract
  // It returns an array of objects, one for each call, containing the sender ('from') and arguments ('args')
  getAllFunctionCalls: function(addressOfContract, functionName) {
    var curBlock = web3.eth.blockNumber();
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
            });
          }
        }
      }
      curBlock = b.parentHash;
    }
    return function_calls;
  }
};

$(function() {
  $(window).load(function() {
    App.init();
  });
});