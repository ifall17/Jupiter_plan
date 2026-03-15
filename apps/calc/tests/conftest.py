import sys
from pathlib import Path

CALC_ROOT = Path(__file__).resolve().parents[1]
if str(CALC_ROOT) not in sys.path:
    sys.path.insert(0, str(CALC_ROOT))

# Keep compatibility with new root-level fixtures and env protections.
