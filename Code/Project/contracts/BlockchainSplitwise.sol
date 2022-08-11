// Please paste your contract's solidity code here
// Note that writing a contract here WILL NOT deploy it and allow you to access it from your client
// You should write and develop your contract in Remix and then, before submitting, copy and paste it here


pragma solidity ^0.5.16;

contract BlockchainSplitwise {

    uint public length = 0;

    struct Creditor {
      uint32 amt_owed;
      address addr;
    }

    mapping (address => Creditor[]) public debtors;      
    mapping (address => bool) public areDebtors;

    event LogAdd_IOU(address debtor, address creditor, uint32 amount);
    event LogResolvedCycle(address[] _path, uint32 amount);
    event LogAdjustedDebt(address debtor, address creditor, uint32 amount, bool sign);


    modifier isDebtor (address debtor) { require(areDebtors[debtor] == true); _; }

    /* Returns the amount that the debtor owes the creditor. 
      Precondition: no cycles are in the graph. */
    function lookup(address debtor, address creditor) 
        public view returns (uint32 ret){
        if (areDebtors[debtor] == true) {
            Creditor[] storage creditors = debtors[debtor];
            for (uint i = 0; i < creditors.length; i++){
                if (creditors[i].addr == creditor){
                    return creditors[i].amt_owed;
                }
            }
        }
        return 0;
    } 

    /* Adjusts the debt between debtor and creditor by amount */
    function adjustDebt(address debtor, address creditor, uint32 amt, bool sign)
        internal isDebtor(debtor) returns (uint32 amt_new){
        Creditor[] storage creditors = debtors[debtor];
        uint i = 0;
        while (i < creditors.length){
            if (creditors[i].addr == creditor){
                if (sign) {
                    creditors[i].amt_owed += amt;
                } else {
                    creditors[i].amt_owed -= amt;
                }
                emit LogAdjustedDebt(debtor, creditor, amt, sign);
                return creditors[i].amt_owed;
            }
            i++;
        }     
        return 0;
    }

    /* Informs the contract that msg.sender now owes amount 
      more dollars to creditor. If money is already owed, this 
      adds to that, amount must be positive.  
      Precondition: no cycles are in the graph. 
      If _path is provided, it is from creditor to debtor */    
    function add_IOU(uint32 _amount, address _creditor, bool _path_formed, address[] memory _path)
        public {

        address debtor = msg.sender; 
        if (areDebtors[debtor] == false) {
            // Add the debt from _debtor to _creditor first
            Creditor memory creditor = Creditor({amt_owed: _amount, addr: _creditor});
            areDebtors[debtor] = true;
            debtors[debtor].push(creditor);
            emit LogAdd_IOU(debtor, _creditor, _amount);
        } else {
            adjustDebt(debtor, _creditor, _amount, true);        
        }


        if (_path_formed){
            uint path_len = _path.length;
            require(_path[0] == _creditor && _path[path_len-1] == debtor, "Valid endpoints required.");
            // If there is a path from _creditor to _debtor, determine the lowest amount
            uint32 path_min_amt = _amount;
            for (uint i = 0; i < _path.length-1; i++){
                uint32 path_i_amt = lookup(_path[i], _path[i+1]);
                assert(path_i_amt != 0);
                if (path_i_amt < path_min_amt){
                    path_min_amt = path_i_amt;
                }
            }
            for (uint i = 0; i < _path.length-1; i++){
                adjustDebt(_path[i], _path[i+1], path_min_amt, false);
            }
            adjustDebt(debtor, _creditor, path_min_amt, false); 
            emit LogResolvedCycle(_path, path_min_amt);
        } 

    }
}
