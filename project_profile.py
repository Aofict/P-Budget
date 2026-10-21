"""Profile validation and financing conversion, including legacy project payloads."""
from datetime import date
from decimal import Decimal, InvalidOperation
import json
from investment_plan import validate_plan
from monthly_disbursement import validate_monthly_disbursement

FINANCE_FIELDS = ('loan','revenue','oh','idc','loanSpent','revenueSpent','unallocated','unallocatedSpent')
FINANCE_COLUMNS = ('loan_baht','revenue_baht','oh_baht','idc_baht','loan_spent_baht','revenue_spent_baht','unallocated_baht','unallocated_spent_baht')
TEXT_FIELDS = {'shortName':80,'nationalDevelopmentPlan':180,'director':180,'department':180,'division':180,'objectives':8000,'area':4000,'statusNotes':4000,'studySource':1000,'timeline':1000,'cabinetDate':1000}
DATE_FIELDS = ('startDate','endDate','studyDate')
TEXT_FIELDS['fundingSources'] = 100
CUMULATIVE_FIELDS = ('cumulativeDomesticSpent','cumulativeForeignSpent','cumulativeRevenueSpent')
NUMBER_FIELDS = ('paybackYears','npv','firr','eirr','approvedLoan','approvedRevenue','foreignLoan','approvedForeignLoan','land',*CUMULATIVE_FIELDS)


def profile_details(data, previous, error):
    old = (previous or {}).get('details', {})
    supplied = data.get('details', {})
    if not isinstance(supplied,dict) or set(supplied)-set(TEXT_FIELDS)-set(DATE_FIELDS)-set(NUMBER_FIELDS)-{'projectType','investmentPlan','monthlyDisbursement'}:
        raise error('รายละเอียดโครงการไม่ถูกต้อง')
    merged = old | supplied
    result = {}
    result['investmentPlan'] = validate_plan(merged.get('investmentPlan'), error)
    result['monthlyDisbursement'] = validate_monthly_disbursement(merged.get('monthlyDisbursement'), error)
    for key, limit in TEXT_FIELDS.items():
        value = merged.get(key,'')
        if key == 'cabinetDate' and value is None:
            value = ''
        if not isinstance(value,str) or len(value.strip())>limit:
            raise error(f'{key}: ต้องเป็นข้อความไม่เกิน {limit} ตัวอักษร')
        result[key] = value.strip()
    for key in DATE_FIELDS:
        raw = merged.get(key)
        value = None if raw is None or raw == '' else raw
        if value is not None:
            try:
                value = date.fromisoformat(value).isoformat()
            except (ValueError,TypeError):
                raise error(f'{key}: วันที่ไม่ถูกต้อง')
        result[key] = value
    if result['startDate'] and result['endDate'] and result['endDate']<result['startDate']:
        raise error('วันสิ้นสุดต้องไม่ก่อนวันเริ่มโครงการ')
    if 'timeline' not in merged:
        dates = [date.fromisoformat(result[k]) for k in ('startDate', 'endDate') if result[k]]
        result['timeline'] = ' – '.join(f'{d.day:02d}/{d.month:02d}/{d.year + 543}' for d in dates)
    result['projectType'] = merged.get('projectType','')
    if not isinstance(result['projectType'], str) or len(result['projectType']) > 100:
        raise error('ประเภทโครงการไม่ถูกต้อง')
    for key in NUMBER_FIELDS:
        value = merged.get(key)
        if value in (None,''):
            result[key] = None
            continue
        try:
            number = Decimal(str(value))
            maximum = Decimal('9000000000000000') if key in CUMULATIVE_FIELDS else Decimal('9000000000')
            if isinstance(value,bool) or not number.is_finite() or abs(number)>maximum or (key in ('paybackYears','approvedLoan','approvedRevenue','foreignLoan','approvedForeignLoan','land',*CUMULATIVE_FIELDS) and number<0):
                raise ValueError()
            result[key] = float(number)
        except (InvalidOperation,ValueError):
            raise error(f'{key}: กรุณากรอกตัวเลขที่ถูกต้อง หรือเว้นว่างเมื่อยังไม่มีผลศึกษา')
    if set(filter(None,result['fundingSources'].split(',')))-{'domestic','foreign','revenue'}:
        raise error('แหล่งเงินไม่ถูกต้อง')
    if (result['approvedForeignLoan'] or 0) > (result['approvedLoan'] or 0):
        raise error('งบอนุมัติเงินกู้ต่างประเทศต้องไม่เกินงบอนุมัติเงินกู้รวม')
    return result


def normalize_finances(data, previous, money, error, actual):
    supplied = data.get('finances')
    if supplied is not None:
        if not isinstance(supplied,dict) or set(supplied)-set(FINANCE_FIELDS):
            raise error('ข้อมูลวงเงินแยกแหล่งเงินไม่ถูกต้อง')
        amounts = {key:money(supplied.get(key,0),key) if key not in ('loanSpent','revenueSpent','unallocatedSpent') else 0 for key in FINANCE_FIELDS}
        if amounts['unallocated'] or amounts['unallocatedSpent']:
            # Only unchanged legacy balances may be round-tripped; new data must be classified.
            old = (previous or {}).get('finances',{})
            if any(amounts[key]!=money(old.get(key,0),key) for key in ('unallocated','unallocatedSpent')):
                raise error('ต้องจัดสรรวงเงินเป็นเงินกู้หรือเงินรายได้')
        budget = amounts['loan']+amounts['revenue']+amounts['unallocated']
        if 'budget' in data and money(data['budget'],'งบประมาณรวม')!=budget:
            raise error('งบรวมต้องเท่ากับเงินกู้ + เงินรายได้')
        if amounts['unallocated']:
            fund = (previous or {}).get('fundId')
        elif amounts['loan']:
            fund = 'domestic-loan'
        elif amounts['oh']==amounts['revenue'] and amounts['oh']:
            fund = 'oh'
        elif amounts['idc']==amounts['revenue'] and amounts['idc']:
            fund = 'idc'
        else:
            fund = 'pea-revenue'
    else:
        budget = money(data.get('budget'),'งบประมาณ')
        fund = data.get('fundId')
        old = (previous or {}).get('finances',{})
        if previous and old and fund==previous.get('fundId') and budget==money(previous['budget'],'งบประมาณ'):
            amounts = {key:money(old.get(key,0),key) for key in FINANCE_FIELDS}
        else:
            if previous and old.get('loan',0) and old.get('revenue',0):
                raise error('โครงการมีหลายแหล่งเงิน กรุณาส่งวงเงินแยกแหล่งเงินด้วย')
            amounts = dict.fromkeys(FINANCE_FIELDS,0)
            if fund=='domestic-loan':
                amounts.update(loan=budget)
            elif fund in ('pea-revenue','oh','idc'):
                amounts.update(revenue=budget)
                if fund in ('oh','idc'):
                    amounts[fund]=budget
            else:
                amounts.update(unallocated=budget)
    amounts.update(loanSpent=money(actual['loanSpent'], 'loanSpent'), revenueSpent=money(actual['revenueSpent'], 'revenueSpent'), unallocatedSpent=0)
    spent = amounts['loanSpent'] + amounts['revenueSpent']
    if amounts['oh']+amounts['idc']>amounts['revenue']:
        raise error('OH + IDC ต้องไม่เกินเงินรายได้ เพราะเป็นส่วนหนึ่งของเงินรายได้')
    if amounts['loanSpent']>amounts['loan'] or amounts['revenueSpent']>amounts['revenue']:
        raise error('ยอดเบิกจ่ายแต่ละแหล่งต้องไม่เกินวงเงินของแหล่งนั้น')
    if budget>9000000000000000:
        raise error('วงเงินรวมสูงเกินช่วงที่รองรับ')
    normalized = dict(data, fundId=fund, budget=budget/1_000_000, spent=spent/1_000_000)
    return normalized, tuple(amounts[key] for key in FINANCE_FIELDS)


def enrich_project(result, row):
    result['finances']={key:row[col]/1_000_000 for key,col in zip(FINANCE_FIELDS,FINANCE_COLUMNS)}
    defaults = dict.fromkeys(TEXT_FIELDS,'') | dict.fromkeys((*DATE_FIELDS,*NUMBER_FIELDS),None) | {'projectType':''}
    result['details']=defaults | json.loads(row['details_json'])
    if row['loan_baht'] and row['revenue_baht']:
        result.update(fund='เงินกู้ + เงินรายได้',fundingSourceId='mixed',fundComponent=None)
    return result
