"""Legacy entry point — all schemas have been moved to app/schemas/ package.

This file is kept to preserve any direct `from app.schemas import ...` or
`import app.schemas` references in routers that have not yet been updated.
All symbols are re-exported from the schemas package.
"""

# NOTE: This file will be removed in a future cleanup pass.
# Please update any imports to use `from app.schemas import ...` instead.

from app.schemas import *  # noqa: F401, F403
