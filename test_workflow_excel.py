from io import BytesIO
import unittest

from openpyxl import Workbook

from workflow_excel import parse_workflow_excel


class WorkflowExcelTests(unittest.TestCase):
    def test_reads_summary_rows_after_row_250_and_keeps_cached_totals(self):
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "016-1"
        sheet["A7"] = "ลำดับ"
        sheet["B7"] = "รายการ"
        sheet["BE7"] = "เหตุผลที่ยกเลิกงบ/งาน"
        sheet["G9"] = "ปี 2568"
        sheet["H9"] = "ปี 2569"
        sheet["I8"] = "ปี 2570"
        sheet["V8"] = "ปี 2571"
        for column, year in enumerate(range(2572, 2586), start=35):
            sheet.cell(8, column, f"ปี {year}")

        sheet["A274"] = "รวมงานจ้างเหมา"
        sheet["AW274"] = 10
        sheet["AX274"] = 1
        sheet["AY274"] = 2
        sheet["AZ274"] = 3
        sheet["BB274"] = 16
        sheet["A281"] = "รวมทั้งสิ้น (ข้อ1+2+3)"
        sheet["AW281"] = 20
        sheet["AX281"] = 1
        sheet["AY281"] = 2
        sheet["AZ281"] = 3
        sheet["BB281"] = 26
        sheet["A287"] = "หมายเหตุ"

        stream = BytesIO()
        workbook.save(stream)

        workflow, preview = parse_workflow_excel(
            stream.getvalue(), "summary-after-row-250.xlsx", 2569
        )
        rows = {row["key"]: row for row in workflow["rows"]}

        self.assertTrue(preview["can_import"])
        self.assertEqual(rows["total_contract"]["source_row"], 274)
        self.assertEqual(rows["grand_total"]["source_row"], 281)
        self.assertEqual(rows["grand_total"]["source_total"], 20)
        self.assertEqual(rows["grand_total"]["source_grand_total"], 26)
        self.assertTrue(workflow["preserve_excel_formula_values"])


if __name__ == "__main__":
    unittest.main()
