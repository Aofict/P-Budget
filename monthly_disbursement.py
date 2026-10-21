"""Validate calendar-month amounts stored in baht and derive project spending."""
import re
import json
from decimal import Decimal, InvalidOperation


def validate_monthly_disbursement(value, error):
    if value is None:
        return None
    if not isinstance(value, dict) or set(value) != {'years','months'}:
        raise error('ข้อมูลแผนและผลการเบิกจ่ายไม่ถูกต้อง')
    years, months=value['years'], value['months']
    if not isinstance(years,list) or len(years)>601 or any(type(y) is not int or not 2400<=y<=3000 for y in years):
        raise error('ปีของแผนเบิกจ่ายไม่ถูกต้อง')
    if not isinstance(months,dict) or len(months)>7212:
        raise error('ข้อมูลรายเดือนไม่ถูกต้อง')
    for key, groups in months.items():
        if not isinstance(key,str) or not re.fullmatch(r'\d{4}-(?:0[1-9]|1[0-2])',key) or not 2399<=int(key[:4])<=3000:
            raise error('เดือนของแผนเบิกจ่ายไม่ถูกต้อง')
        if not isinstance(groups,dict) or set(groups)-{'cabinet','revised','actual'}:
            raise error('ชุดแผนเบิกจ่ายไม่ถูกต้อง')
        for amounts in groups.values():
            if not isinstance(amounts,dict) or set(amounts)-{'domestic','foreign','revenue'}:
                raise error('แหล่งเงินของแผนเบิกจ่ายไม่ถูกต้อง')
            for amount in amounts.values():
                try:
                    number=Decimal(str(amount))
                    if isinstance(amount,bool) or not isinstance(amount,(int,float)) or not number.is_finite() or not 0<=number<=Decimal('9000000000000000') or number*100 != (number*100).to_integral_value():
                        raise ValueError()
                except (ValueError,InvalidOperation):
                    raise error('จำนวนเงินรายเดือนต้องตั้งแต่ 0 และมีทศนิยมไม่เกิน 2 ตำแหน่ง')
    return value


def actual_finances(plan):
    if not plan or not any('actual' in groups for groups in plan['months'].values()):
        return None
    loan=Decimal(0);revenue=Decimal(0)
    for groups in plan['months'].values():
        actual=groups.get('actual',{})
        loan+=Decimal(str(actual.get('domestic',0)))+Decimal(str(actual.get('foreign',0)))
        revenue+=Decimal(str(actual.get('revenue',0)))
    return {'loanSpent':float(loan/1000000),'revenueSpent':float(revenue/1000000)}


def sync_project_spending(db):
    """Replace legacy totals with monthly actuals, leaving plans and budgets intact."""
    changed = 0
    for row in db.execute('SELECT id, details_json, spent_baht, loan_spent_baht, revenue_spent_baht, unallocated_spent_baht FROM projects').fetchall():
        actual = actual_finances(json.loads(row[1]).get('monthlyDisbursement')) or {}
        loan = Decimal(str(actual.get('loanSpent', 0))) * 1000000
        revenue = Decimal(str(actual.get('revenueSpent', 0))) * 1000000
        values = tuple(float(value) for value in (loan + revenue, loan, revenue, 0))
        if tuple(row[2:]) != values:
            db.execute('UPDATE projects SET spent_baht=?, loan_spent_baht=?, revenue_spent_baht=?, unallocated_spent_baht=?, version=version+1 WHERE id=?', (*values, row[0]))
            changed += 1
    return changed
