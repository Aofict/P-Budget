const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({window:{}});
for (const name of ['finance','dashboard']) {
  vm.runInContext(fs.readFileSync('frontend/'+name+'.js','utf8'),context);
}
const finance = context.window.createPBudgetFinance({format:(value)=>String(value)});
context.analytics = context.window.createPBudgetDashboard({finance,getPage:()=> 'dashboard'});
const {period,sum,yearsFor,portfolioTotals} = context.analytics;
const project = {details:{timelineStartYear:2569,timelineEndYear:2570,monthlyDisbursement:{months:{
  '2569-09':{cabinet:{domestic:1_000_000},actual:{domestic:800_000}},
  '2569-10':{cabinet:{domestic:2_000_000,foreign:500_000},revised:{domestic:3_000_000},actual:{domestic:1_000_000}},
  '2570-01':{cabinet:{revenue:500_000},actual:{revenue:0}}
}}}};
const fiscal = period(2570,'fiscal').map(month=>month.key);
assert.equal(fiscal[0],'2569-10');assert.equal(fiscal[11],'2570-09');
assert.equal(sum([project],fiscal,'cabinet'),3);
assert.equal(sum([project],fiscal,'revised'),3);
assert.equal(sum([project],fiscal,'actual'),1);
assert.equal(sum([project],['2570-01'],'actual'),0);
assert.equal(sum([project],['2570-02'],'actual'),null);
assert.equal(sum([],fiscal,'actual'),null);
assert.equal(sum([project],period(2569,'calendar').map(month=>month.key),'actual'),1.8);
assert.deepEqual(Array.from(yearsFor([project],'fiscal')),[2569,2570]);
assert.equal(sum([project,project],fiscal,'cabinet'),6);
// Preserve historical entries outside the current timeline and removed sources.
assert.deepEqual(Array.from(yearsFor([{details:{monthlyDisbursement:{months:{'2571-10':{actual:{foreign:5}}}}}}],'fiscal')),[2572]);
console.log('PASS: fiscal/calendar boundaries, source sums, plan selection, baht conversion, missing vs zero, historical years');
const totals = portfolioTotals([
  {budget:100, finances:{loanSpent:20,revenueSpent:5}, details:{approvedLoan:40, approvedRevenue:10}},
  {budget:200, details:{approvedLoan:100, approvedRevenue:0,cumulativeDomesticSpent:35_000_000,cumulativeForeignSpent:0,cumulativeRevenueSpent:0}},
]);
assert.equal(totals.budget,300);assert.equal(totals.approved,150);
assert.equal(totals.spent,60);assert.equal(totals.rate,40);
assert.equal(portfolioTotals([{budget:100,finances:{loanSpent:25,revenueSpent:0}}]).rate,null);
assert.equal(portfolioTotals([]).spent,0);
assert.deepEqual(Array.from(yearsFor([{details:{timeline:'2568 - 2574'}}],'calendar')),[2568,2569,2570,2571,2572,2573,2574]);
assert.deepEqual(Array.from(yearsFor([{details:{timeline:'2568 - 2574',timelineStartYear:2570,timelineEndYear:2571}}],'calendar')),[2570,2571]);
console.log('PASS: cumulative cards use actual approved amounts; aggregate rate and zero denominator');
