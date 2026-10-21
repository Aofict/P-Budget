"""Build a read-only Pages site from a NEW empty database, never the user's DB."""
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sqlite3
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from html_export import document, snapshot
from server import SCHEMA_VERSION, initialize, list_projects, read_masters


def main():
    output = ROOT / '_site'
    output.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='pbudget-pages-empty-') as temporary:
        database = Path(temporary) / 'empty.db'
        initialize(database)
        with closing(sqlite3.connect(database)) as connection:
            connection.row_factory = sqlite3.Row
            data = snapshot(
                connection, list_projects(connection), read_masters(connection),
                SCHEMA_VERSION, datetime.now(timezone(timedelta(hours=7))).isoformat(),
            )
        if data['projects'] or data['meetings'] or data['nineBox']:
            raise RuntimeError('Pages must not contain entered project data')
        data['theme'] = 'light'
        (output / 'index.html').write_text(document(data, ROOT), encoding='utf-8')
    (output / '.nojekyll').write_text('', encoding='utf-8')
    print('Read-only Pages site built from an empty database: _site/index.html')


if __name__ == '__main__':
    main()
