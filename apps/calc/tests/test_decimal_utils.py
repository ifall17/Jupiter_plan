from decimal import Decimal

from utils.decimal_utils import safe_divide, to_decimal



def test_safe_divide_returns_zero_when_denominator_zero():
    # Arrange
    numerator = Decimal("10")
    denominator = Decimal("0")

    # Act
    result = safe_divide(numerator, denominator)

    # Assert
    assert result == Decimal("0")



def test_to_decimal_converts_float_via_string():
    # Arrange
    value = 0.1

    # Act
    result = to_decimal(value)

    # Assert
    assert result == Decimal("0.1")



def test_safe_divide_rounds_half_up_two_decimals():
    # Arrange
    numerator = Decimal("10")
    denominator = Decimal("3")

    # Act
    result = safe_divide(numerator, denominator, precision=2)

    # Assert
    assert result == Decimal("3.33")
