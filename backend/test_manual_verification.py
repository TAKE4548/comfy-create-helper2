# File: test_manual_verification.py
import sys
import os

sys.path.insert(0, '.')

from app.services.workflow_scanner import scan_workflow

def run_m01():
    """Test M01: Multiple Perfect Matches Fallback"""
    DummyMappingMaster = type('DummyMappingMaster', (object,), {})
    master = DummyMappingMaster()
    master.id=1; master.role='sampler_role'; 
    master.expected_class_types='["KSampler"]'; 
    master.param_name='seed'; 
    master.title_patterns='["positive"]'

    workflow_json = {
        '10': {'class_type': 'KSampler', 'inputs': {'seed': 123}, '_meta': {'title': 'positive'}}, 
        '11': {'class_type': 'KSampler', 'inputs': {'seed': 456}, '_meta': {'title': 'positive'}}, 
        '5': {'class_type': 'KSampler', 'inputs': {'seed': 789}, '_meta': {'title': 'negative'}}
    }

    res = scan_workflow(workflow_json, [master])

    # Strict Assertions
    if res['matched'][0]['node_id'] != '10': 
        raise AssertionError(f'M01_FAIL: Expected node_id "10", got {res["matched"][0]["node_id"]}')
    
    if len(res['warnings']) != 1 or res['warnings'][0]['status'] != 'duplicated': 
        raise AssertionError('M01_FAIL: Expected 1 warning with status "duplicated"')

    expected_ids = {'10', '11', '5'}
    actual_ids = set(res['warnings'][0]['node_ids'])
    if actual_ids != expected_ids: 
        raise AssertionError(f'M01_FAIL: Expected node_ids {expected_ids}, got {actual_ids}')

    return "M01_PASS"

def run_m02():
    """Test M02: Empty Class Types Matching"""
    DummyMappingMaster = type('DummyMappingMaster', (object,), {})
    master = DummyMappingMaster()
    master.id=1; master.role='custom_role'; 
    master.expected_class_types='[]'; 
    master.param_name=''; 
    master.title_patterns='["SpecialPrompt"]'

    workflow_json = {
        '10': {'class_type': 'SomeClass', '_meta': {'title': 'other_title'}}, 
        '11': {'class_type': 'AnotherClass', '_meta': {'title': 'SpecialPrompt'}}
    }

    res = scan_workflow(workflow_json, [master])

    if res['matched'][0]['node_id'] != '11': 
        raise AssertionError(f'M02_FAIL: Expected node_id "11", got {res["matched"][0]["node_id"]}')

    if len(res['warnings']) != 0: 
        raise AssertionError(f'M02_FAIL: Expected 0 warnings, got {len(res["warnings"])}')

    return "M02_PASS"

if __name__ == "__main__":
    try:
        print(run_m01())
        print(run_m02())
        print("ALL_MANUAL_TESTS_PASS")
        sys.exit(0)
    except Exception as e:
        print(f"TEST_FAILED: {e}")
        sys.exit(1)
