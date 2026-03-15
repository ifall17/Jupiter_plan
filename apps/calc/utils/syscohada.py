import re

SYSCOHADA_CLASSES = {
    "1": "Sustainable resources accounts",
    "2": "Fixed assets accounts",
    "3": "Inventory accounts",
    "4": "Third-party accounts",
    "5": "Treasury accounts",
    "6": "Expense accounts",
    "7": "Revenue accounts",
    "8": "Other charges and income accounts",
}



def is_valid_syscohada(code: str) -> bool:
    if not re.match(r"^\d{6,8}$", code):
        return False
    return code[0] in SYSCOHADA_CLASSES



def get_line_type(code: str) -> str:
    """Map SYSCOHADA account code to financial line type."""
    if code.startswith("7"):
        return "REVENUE"
    if code.startswith("6"):
        return "EXPENSE"
    return "OTHER"
