import sys, os
sys.path.insert(0, r'c:\Users\buddh\GIT_Projects\simulation\bridge')
from bridge import calculate_rate_speed

print("Testing calculate_rate_speed():")
test_cases = [
    (10, None, "Deadband <= 15px"),
    (15, None, "Deadband boundary 15px"),
    (20, 19, "Near deadband crawling"),
    (50, 14, "Mid crawling"),
    (80, 9, "80px boundary"),
    (85, 8, "Just above 80px"),
    (120, 7, "Mid medium"),
    (180, 6, "Upper medium"),
    (200, 5, "200px boundary"),
    (250, 3, "Large error"),
    (350, 2, "Very large error"),
    (500, 1, "Maximum error")
]

all_passed = True
for err, expected, label in test_cases:
    actual = calculate_rate_speed(err)
    status = "OK" if actual == expected else f"FAIL (got {actual})"
    print(f"  Error: {err:3d}px -> Speed: {str(actual):>4s} (Expected: {str(expected):>4s}) | {label} [{status}]")
    if actual != expected:
        all_passed = False

if all_passed:
    print("\n[SUCCESS] All rate speed calculations match the teammate's exact specification!")
else:
    print("\n[FAIL] Some test cases did not match.")
