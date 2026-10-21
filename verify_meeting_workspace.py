"""Headless integration check against an isolated imported legacy database."""
from pathlib import Path
import verify_browser as runner
from import_meeting_legacy import import_legacy

original_create=runner.create_app
def seeded_app(database):
    import_legacy(Path(__file__).parent/'.imports/MeetingBudget_Test/budget.db',database)
    return original_create(database)

runner.create_app=seeded_app
runner.SCREENSHOT_PREFIX='preview-meeting-integrated'
runner.CHECKS=(Path(__file__).parent/'browser_meeting_workspace_checks.js').read_text(encoding='utf-8')
if __name__=='__main__':raise SystemExit(runner.main())
