// Shared financial display calculations. Monthly ledger conversion stays in dashboard.js.
window.createPBudgetFinance = function ({format}) {
function approvedBudget(project) {
  return Number(project.details?.approvedLoan || 0) + Number(project.details?.approvedRevenue || 0);
}

function cumulativeSpent(project) {
  const details=project.details || {};
  const keys=['cumulativeDomesticSpent','cumulativeForeignSpent','cumulativeRevenueSpent'];
  if(!keys.some(key=>details[key] !== null && details[key] !== undefined && details[key] !== '')) {
    return {
      loanSpent:Number(project.finances?.loanSpent || 0),
      revenueSpent:Number(project.finances?.revenueSpent || 0),
    };
  }
  return {
    loanSpent:(Number(details.cumulativeDomesticSpent || 0)+Number(details.cumulativeForeignSpent || 0))/1_000_000,
    revenueSpent:Number(details.cumulativeRevenueSpent || 0)/1_000_000,
  };
}

function disbursementPercent(spent, approved) {
  return approved > 0 ? spent / approved * 100 : null;
}

function fundingBreakdown(loan, revenue, detailed = false) {
  const total = loan + revenue;
  const loanPercent = total > 0 ? loan / total * 100 : 0;
  const revenuePercent = total > 0 ? revenue / total * 100 : 0;
  if (detailed) {
    const sourceLabel = (label, value, source) => `<span class="overview-funding-source"><i class="overview-funding-dot ${source}" aria-hidden="true"></i><span>${label}:</span><strong>${format(value)}</strong><small>ล้านบาท</small></span>`;
    return `<div class="stat-source-box"><div class="stat-source-labels">${sourceLabel('เงินกู้', loan, 'is-loan')}${sourceLabel('เงินรายได้', revenue, 'is-revenue')}</div><div class="stat-source-bar" role="img" aria-label="เงินกู้ ${format(loanPercent,1)}% เงินรายได้ ${format(revenuePercent,1)}%"><span class="stat-source-loan" style="width:${loanPercent}%">${loanPercent ? format(loanPercent,1)+'%' : ''}</span><span class="stat-source-revenue" style="width:${revenuePercent}%">${revenuePercent ? format(revenuePercent,1)+'%' : ''}</span></div></div>`;
  }
  return `<div class="stat-source-box"><div class="stat-source-labels"><span>เงินกู้ ${format(loan)}</span><span>เงินรายได้ ${format(revenue)}</span></div><div class="stat-source-bar" role="img" aria-label="${total ? `เงินกู้ ${format(loanPercent,1)}% เงินรายได้ ${format(revenuePercent,1)}%` : 'ยังไม่มียอดแยกแหล่งเงิน'}"><span class="stat-source-loan" style="width:${loanPercent}%">${loanPercent ? format(loanPercent,1)+'%' : ''}</span><span class="stat-source-revenue" style="width:${revenuePercent}%">${revenuePercent ? format(revenuePercent,1)+'%' : ''}</span></div></div>`;
}

return {approvedBudget, cumulativeSpent, disbursementPercent, fundingBreakdown};
};
