from pathlib import Path
from unittest.mock import patch
import os
import threading
import unittest

import desktop_launcher as launcher


class DesktopLauncherTests(unittest.TestCase):
    def test_waits_until_expected_database_is_ready(self):
        with patch.object(launcher,'read_status',side_effect=[None,{'application':'other'},
             {'application':'PBudgetManager','databaseKey':'expected'}]),patch.object(launcher.webbrowser,'open') as browser:
            self.assertTrue(launcher.open_when_ready(8080,'expected',threading.Event(),2))
            browser.assert_called_once_with('http://127.0.0.1:8080/',new=2)

    def test_does_not_open_when_stopped(self):
        stop=threading.Event();stop.set()
        with patch.object(launcher.webbrowser,'open') as browser:
            self.assertFalse(launcher.open_when_ready(8080,'expected',stop))
            browser.assert_not_called()

    def test_frozen_data_beside_exe_not_temp_assets(self):
        with patch.dict(os.environ,{},clear=True),patch.object(launcher.sys,'frozen',True,create=True),patch.object(launcher.sys,'executable',str(Path.cwd()/'portable'/'PBudgetManager.exe')):
            self.assertEqual(launcher.database_path(),Path.cwd()/'portable'/'data'/'master.db')

    def test_second_launch_reuses_same_server(self):
        key=launcher.sha256(str(launcher.database_path()).casefold().encode()).hexdigest()
        with patch.object(launcher,'read_status',return_value={'application':'PBudgetManager','databaseKey':key}),patch.object(launcher.webbrowser,'open') as browser,patch.object(launcher,'make_server') as server:
            launcher.run(lambda _:self.fail('must not open another database'))
            browser.assert_called_once();server.assert_not_called()


if __name__=='__main__':unittest.main()
