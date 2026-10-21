# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['desktop_launcher.py'],
    pathex=[],
    binaries=[],
    datas=[('pea_logo.png', '.'), ('database-session.js', '.'), ('database-settings.js', '.'), ('release.json', '.'), ('html-portable.js', '.'), ('assets/fonts', 'assets/fonts'), ('patch-settings.js', '.'), ('index.html', '.'), ('app.js', '.'), ('frontend', 'frontend'), ('style.css', '.'), ('project-form.js', '.'), ('disbursement-plan.js', '.'), ('project-form.css', '.'), ('meetings.js', '.'), ('meetings.css', '.'), ('migrations', 'migrations'), ('meeting-app', 'meeting-app'), ('nine-box-app', 'nine-box-app'), ('Update-PBudget.cmd', '.')],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='PBudgetManager',
    icon='meeting-app/assets/brand/app.ico',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    contents_directory='.',
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='PBudgetManager',
)
