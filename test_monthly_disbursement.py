import unittest
import sqlite3
from contextlib import closing
from monthly_disbursement import validate_monthly_disbursement, actual_finances
from test_project_profile import ProjectProfileTests


class MonthlyValidationTests(unittest.TestCase):
    def test_exact_spending_and_empty_legacy(self):
        plan={'years':[2570],'months':{'2569-10':{'actual':{'domestic':0.1,'foreign':0.2,'revenue':0.3}},'2570-01':{'cabinet':{'domestic':900},'actual':{'domestic':0.2}}}}
        validate_monthly_disbursement(plan,ValueError)
        totals=actual_finances(plan)
        self.assertEqual(totals['loanSpent'],0.5/1000000)
        self.assertEqual(totals['revenueSpent'],0.3/1000000)
        self.assertIsNone(actual_finances({'years':[2570],'months':{}}))

    def test_bad_month_amount_and_source(self):
        for month,groups in [('2570-13',{'actual':{'domestic':1}}),('2570-01',{'actual':{'domestic':-1}}),('2570-01',{'actual':{'domestic':0.001}}),('2570-01',{'actual':{'unknown':1}})]:
            with self.subTest(month=month,groups=groups),self.assertRaises(ValueError):
                validate_monthly_disbursement({'years':[2570],'months':{month:groups}},ValueError)


class MonthlyApiTests(unittest.TestCase):
    setUp=ProjectProfileTests.setUp
    tearDown=ProjectProfileTests.tearDown
    create=ProjectProfileTests.create
    def test_old_spending_is_not_displayed_without_monthly_actual(self):
        project = self.create()
        self.assertEqual(project['spent'], 0)
        self.assertEqual(project['finances']['loanSpent'], 0)
        self.assertEqual(project['finances']['revenueSpent'], 0)
        with closing(sqlite3.connect(self.db)) as connection:
            stored = connection.execute('SELECT spent_baht FROM projects WHERE id=?', (project['id'],)).fetchone()[0]
        self.assertEqual(stored, 0)
        self.data['details']['monthlyDisbursement'] = {
            'years': [2570], 'months': {'2570-01': {'cabinet': {'domestic': 1000000}}},
        }
        project = self.create()
        self.assertEqual(project['spent'], 0)

    def test_monthly_actual_updates_project_spending(self):
        plan={'years':[2570],'months':{'2569-10':{'actual':{'domestic':1000000,'foreign':500000,'revenue':200000}},'2570-01':{'actual':{'revenue':300000}}}}
        self.data['details']['monthlyDisbursement']=plan
        project=self.create()
        self.assertEqual(project['spent'],2)
        self.assertEqual(project['finances']['loanSpent'],1.5)
        self.assertEqual(project['finances']['revenueSpent'],.5)
        self.assertEqual(project['details']['monthlyDisbursement'],plan)
