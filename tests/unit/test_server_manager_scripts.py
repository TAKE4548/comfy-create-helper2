import os
import re
from pathlib import Path
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
TOOLS_DIR = REPO_ROOT / 'tools' / 'server-manager'

def test_restart_web_manager_script_logic():
    bat_path = TOOLS_DIR / 'restart_web_manager.bat'
    assert bat_path.exists(), f'{bat_path} does not exist'
    content = bat_path.read_text(encoding='utf-8', errors='ignore')

    # Step 1: oldPids tracking
    assert "$oldPids" in content, "restart_web_manager.bat should track $oldPids"
    assert "$oldPids = @()" in content, "restart_web_manager.bat should initialize $oldPids"

    # Step 2: Elevation fallback and exit 1
    assert "-Verb RunAs" in content, "restart_web_manager.bat should attempt UAC elevation via -Verb RunAs"
    assert "exit 1" in content, "restart_web_manager.bat should exit 1 on port release failure"

    # Step 4: Verification with new PID check
    assert "$oldPids -notcontains" in content, "restart_web_manager.bat should check that new PID is not in $oldPids"
    assert "$newPid" in content, "restart_web_manager.bat should verify $newPid"

def test_batch_background_flags():
    start_bat = (TOOLS_DIR / 'start_servers.bat').read_text(encoding='utf-8', errors='ignore')
    toggle_bat = (TOOLS_DIR / 'toggle_servers.bat').read_text(encoding='utf-8', errors='ignore')
    all_bat = (TOOLS_DIR / 'start_background_all.bat').read_text(encoding='utf-8', errors='ignore')

    assert '-Background' in start_bat, 'start_servers.bat must pass -Background'
    assert '-Background' in toggle_bat, 'toggle_servers.bat must pass -Background'
    assert 'conhost.exe' not in all_bat, 'start_background_all.bat must not use conhost.exe'
