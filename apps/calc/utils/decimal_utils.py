from decimal import Decimal, InvalidOperation, ROUND_HALF_UP



def to_decimal(value) -> Decimal:
    """Convert any value to a safe Decimal."""
    if isinstance(value, float):
        return Decimal(str(value))
    try:
        return Decimal(str(value))
    except InvalidOperation:
        return Decimal("0")



def safe_divide(numerator: Decimal, denominator: Decimal, precision: int = 2) -> Decimal:
    """Safe division returning 0 when denominator is 0."""
    if denominator == Decimal("0"):
        return Decimal("0")
    result = numerator / denominator
    return result.quantize(Decimal(10) ** -precision, rounding=ROUND_HALF_UP)



def format_fcfa(amount: Decimal) -> str:
    """Format FCFA amount for logs."""
    return f"{amount:,.0f} FCFA"
